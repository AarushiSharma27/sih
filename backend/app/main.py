"""
main.py -- the SkillTrack API plus the static frontend.

Roles: trainee, employer, admin. Sessions are an HttpOnly cookie. Nothing is
seeded: companies and trainees register themselves, an admin verifies company
GSTINs and trainee certificates, and every number is a query over that data.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import re
import secrets
import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Iterator, Literal

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from . import db
from .match import PASS_MARK, cert_match, norm, screen_resume

FRONTEND_DIR = Path(__file__).resolve().parents[2]

MP_DISTRICTS = [
    "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind",
    "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori",
    "Guna", "Gwalior", "Harda", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone",
    "Maihar", "Mandla", "Mandsaur", "Mauganj", "Morena", "Narmadapuram", "Narsinghpur", "Neemuch",
    "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore",
    "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain",
    "Umaria", "Vidisha",
]
District = Literal[tuple(MP_DISTRICTS)]  # type: ignore[valid-type]
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
GSTIN = r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"
PLACED = ("employed", "self", "apprentice")

app = FastAPI(title="SkillTrack API", version="2.0.0")
db.init()


def log(con: sqlite3.Connection, actor: str, action: str, target: str) -> None:
    con.execute("INSERT INTO audit (actor, action, target) VALUES (?, ?, ?)", (actor, action, target))


def trainee_id(uid: int, created: str) -> str:
    return f"SKL-MP-{created[:4]}-{uid:05d}"


# ---------- dependencies ----------

def get_con() -> Iterator[sqlite3.Connection]:
    con = db.connect()
    try:
        yield con
        con.commit()
    finally:
        con.close()


Con = Annotated[sqlite3.Connection, Depends(get_con)]


def current_user(con: Con, st_session: Annotated[str | None, Cookie()] = None) -> dict:
    row = st_session and con.execute(
        "SELECT u.id, u.role, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = ? AND s.created > datetime('now', '-30 days')", (st_session,)).fetchone()
    if not row:
        raise HTTPException(401, "Please sign in.")
    return dict(row)


def role(*allowed: str):
    def dep(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(403, "Your account cannot do this.")
        return user
    return Depends(dep)


Trainee = Annotated[dict, role("trainee")]
Employer = Annotated[dict, role("employer")]
Admin = Annotated[dict, role("admin")]


# ---------- request bodies (the trust boundary) ----------

class Account(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(pattern=EMAIL, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class TraineeSignup(Account):
    phone: str = Field(pattern=r"^[6-9]\d{9}$")
    gender: Literal["F", "M", "O"]
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    district: District
    course_id: int
    certificate_no: str = Field(min_length=4, max_length=60)
    certified_on: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    consent: Literal[True]
    location: str = Field(default="", max_length=200)
    education: str = Field(default="", max_length=80)
    experience: str = Field(default="", max_length=80)
    industry: str = Field(default="", max_length=80)
    job_role: str = Field(default="", max_length=120)
    skills: list[str] = Field(default=[], max_length=40)
    # base64 PDF/JPEG/PNG of the certificate; required by the registration endpoint (not by the demo importer)
    certificate_file: str | None = Field(default=None, max_length=3_000_000)

    @model_validator(mode="after")
    def plausible_dates(self) -> "TraineeSignup":
        dob, cert = date.fromisoformat(self.dob), date.fromisoformat(self.certified_on)
        if cert > date.today():
            raise ValueError("Certificate date is in the future.")
        if cert < dob.replace(year=dob.year + 14):
            raise ValueError("Certificate date is before the trainee turned 14.")
        return self


CERT_TYPES = {b"%PDF": ("pdf", "application/pdf"), b"\xff\xd8\xff": ("jpg", "image/jpeg"), b"\x89PNG": ("png", "image/png")}


def decode_certificate(b64: str | None) -> tuple[bytes, str]:
    """Check the upload is really a PDF/JPEG/PNG under 2 MB, by content, not by file name."""
    try:
        raw = base64.b64decode((b64 or "").split(",")[-1], validate=True)
    except ValueError:
        raw = b""
    if not raw:
        raise HTTPException(422, "Upload a scan or photo of your certificate.")
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(422, "Certificate file must be under 2 MB.")
    ext = next((e for magic, (e, _) in CERT_TYPES.items() if raw.startswith(magic)), None)
    if not ext:
        raise HTTPException(422, "Certificate must be a PDF, JPEG or PNG file.")
    return raw, ext


class EmployerSignup(Account):
    company: str = Field(min_length=2, max_length=160)
    gstin: str = Field(pattern=GSTIN)
    website: str = Field(default="", max_length=200)
    district: District


class Login(BaseModel):
    email: str
    password: str


class Resume(BaseModel):
    text: str = Field(min_length=50, max_length=20000)


class Outcome(BaseModel):
    outcome: Literal["employed", "self", "apprentice", "notplaced"]
    employer_name: str | None = Field(default=None, max_length=160)
    salary: int | None = Field(default=None, ge=0, le=10_000_000)
    relevance: int | None = Field(default=None, ge=1, le=5)
    reason: str | None = Field(default=None, max_length=20)


class Job(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=30, max_length=10000)
    skills: list[str] = Field(min_length=1, max_length=30)
    district: District
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    openings: int = Field(default=1, ge=1, le=10000)


class Decision(BaseModel):
    stage: Literal["shortlisted", "rejected", "hired"]
    salary: int | None = Field(default=None, ge=0, le=10_000_000)


class Course(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    qp_code: str = Field(min_length=3, max_length=40)
    sector: str = Field(min_length=2, max_length=80)
    skills: list[str] = Field(min_length=1, max_length=40)
    source_url: str = Field(pattern=r"^https?://", max_length=300)


class Verdict(BaseModel):
    verified: bool


class CertVerdict(Verdict):
    note: str = Field(min_length=10, max_length=500, description="What it was checked against, e.g. portal + reference")


# ---------- public ----------

@app.get("/api/meta")
def meta(con: Con) -> dict[str, Any]:
    """Dropdown values plus headline counts for the landing page."""
    q = lambda sql: con.execute(sql).fetchone()[0]  # noqa: E731
    return {
        "districts": MP_DISTRICTS,
        "courses": db.rows(con.execute("SELECT id, name, qp_code, sector, skills, source_url FROM courses ORDER BY name")),
        "stats": {
            "trainees": q("SELECT count(*) FROM trainees"),
            "verifiedCompanies": q("SELECT count(*) FROM companies WHERE verified = 1"),
            "openJobs": q("SELECT count(*) FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.status = 'open' AND c.verified = 1"),
            "verifiedPlacements": q("SELECT count(*) FROM trainees WHERE outcome_verified = 1"),
        },
    }


# ---------- auth ----------

def start_session(con: sqlite3.Connection, user_id: int, resp: Response) -> None:
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    # shortcut: secure=False so it works on http://localhost; set secure=True behind HTTPS
    resp.set_cookie("st_session", token, httponly=True, samesite="lax", max_age=30 * 86400)


def new_user(con: sqlite3.Connection, role_: str, a: Account) -> int:
    try:
        return con.execute("INSERT INTO users (role, email, name, pw_hash) VALUES (?, ?, ?, ?)",
                           (role_, a.email.strip(), a.name.strip(), db.hash_pw(a.password))).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists.")


@app.post("/api/auth/register/trainee")
def register_trainee(body: TraineeSignup, con: Con, resp: Response) -> dict:
    if not con.execute("SELECT 1 FROM courses WHERE id = ?", (body.course_id,)).fetchone():
        raise HTTPException(422, "Unknown course.")
    raw, ext = decode_certificate(body.certificate_file)
    uid = new_user(con, "trainee", body)
    try:
        con.execute(
        "INSERT INTO trainees (user_id, phone, gender, dob, district, course_id, certificate_no, certified_on, consent_at, "
        "location, education, experience, industry, job_role, skills) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)",
        (uid, body.phone, body.gender, body.dob, body.district, body.course_id, body.certificate_no.strip(), body.certified_on,
         body.location, body.education, body.experience, body.industry, body.job_role, json.dumps(norm(body.skills))))
    except sqlite3.IntegrityError:  # unique certificate number / phone; the user row rolls back with it
        raise HTTPException(409, "This certificate number or mobile number is already registered.")
    db.UPLOAD_DIR.mkdir(exist_ok=True)
    (db.UPLOAD_DIR / f"cert-{uid}.{ext}").write_bytes(raw)
    con.execute("UPDATE trainees SET cert_file = ? WHERE user_id = ?", (f"cert-{uid}.{ext}", uid))
    start_session(con, uid, resp)
    tid = trainee_id(uid, con.execute("SELECT created FROM users WHERE id = ?", (uid,)).fetchone()[0])
    log(con, body.email, "Registered as trainee", tid)
    return {"role": "trainee", "id": tid}


@app.post("/api/auth/register/employer")
def register_employer(body: EmployerSignup, con: Con, resp: Response) -> dict:
    uid = new_user(con, "employer", body)
    con.execute("INSERT INTO companies (user_id, name, gstin, website, district) VALUES (?, ?, ?, ?, ?)",
                (uid, body.company.strip(), body.gstin, body.website.strip(), body.district))
    start_session(con, uid, resp)
    log(con, body.email, "Registered company, GSTIN pending verification", body.company)
    return {"role": "employer"}


@app.post("/api/auth/login")
def login(body: Login, con: Con, resp: Response) -> dict:
    m = re.fullmatch(r"SKL-MP-\d{4}-(\d{5})", body.email.strip().upper())  # trainees may sign in with their ID
    row = con.execute("SELECT id, role, pw_hash FROM users WHERE " + ("id = ? AND role = 'trainee'" if m else "email = ?"),
                      (int(m.group(1)) if m else body.email.strip(),)).fetchone()
    if not row or not db.check_pw(body.password, row["pw_hash"]):
        raise HTTPException(401, "Email or password is incorrect.")
    start_session(con, row["id"], resp)
    return {"role": row["role"]}


@app.post("/api/auth/logout")
def logout(con: Con, resp: Response, st_session: Annotated[str | None, Cookie()] = None) -> dict:
    con.execute("DELETE FROM sessions WHERE token = ?", (st_session,))
    resp.delete_cookie("st_session")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: Annotated[dict, Depends(current_user)]) -> dict:
    return user


# ---------- trainee ----------

def trainee_row(con: sqlite3.Connection, uid: int) -> dict:
    return db.rows(con.execute(
        "SELECT t.*, u.name, u.email, c.name AS course, c.skills AS course_skills FROM trainees t "
        "JOIN users u ON u.id = t.user_id JOIN courses c ON c.id = t.course_id WHERE t.user_id = ?", (uid,)),
        ("course_skills",))[0]


def open_jobs(con: sqlite3.Connection) -> list[dict]:
    return db.rows(con.execute(
        "SELECT j.*, c.name AS company FROM jobs j JOIN companies c ON c.id = j.company_id "
        "WHERE j.status = 'open' AND c.verified = 1 ORDER BY j.posted DESC"))


@app.get("/api/trainee/me")
def trainee_me(user: Trainee, con: Con) -> dict:
    t = trainee_row(con, user["id"])
    t["applications"] = db.rows(con.execute(
        "SELECT a.id, a.stage, a.cert_score, a.resume_score, a.matched, a.missing, a.created, j.title, c.name AS company "
        "FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id "
        "WHERE a.trainee_id = ? ORDER BY a.created DESC", (user["id"],)))
    return t


@app.put("/api/trainee/resume")
def save_resume(body: Resume, user: Trainee, con: Con) -> dict:
    con.execute("UPDATE trainees SET resume_text = ? WHERE user_id = ?", (body.text, user["id"]))
    return {"ok": True}


@app.put("/api/trainee/outcome")
def save_outcome(body: Outcome, user: Trainee, con: Con) -> dict:
    placed = body.outcome in PLACED
    con.execute(
        "UPDATE trainees SET outcome = ?, employer_name = ?, salary = ?, relevance = coalesce(?, relevance), reason = ?, "
        "outcome_verified = 0, outcome_updated = datetime('now') WHERE user_id = ?",
        (body.outcome, body.employer_name if placed else None, body.salary if placed else None, body.relevance,
         None if placed else body.reason, user["id"]))
    log(con, user["email"], "Updated employment status: " + body.outcome, "self")
    return {"ok": True}


class CertUpload(BaseModel):
    certificate_file: str = Field(max_length=3_000_000)


@app.put("/api/trainee/certificate")
def upload_certificate(body: CertUpload, user: Trainee, con: Con) -> dict:
    """Upload or replace the certificate scan; it goes (back) to pending for the mission office to check."""
    t = con.execute("SELECT cert_verified, cert_file FROM trainees WHERE user_id = ?", (user["id"],)).fetchone()
    if t["cert_verified"] == 1 and t["cert_file"]:  # a checked document cannot be swapped afterwards
        raise HTTPException(409, "Your certificate is already verified and cannot be replaced.")
    raw, ext = decode_certificate(body.certificate_file)
    db.UPLOAD_DIR.mkdir(exist_ok=True)
    for old in db.UPLOAD_DIR.glob(f"cert-{user['id']}.*"):
        old.unlink()
    (db.UPLOAD_DIR / f"cert-{user['id']}.{ext}").write_bytes(raw)
    con.execute("UPDATE trainees SET cert_file = ?, cert_verified = 0, verified_by = NULL, verified_at = NULL, verify_note = NULL "
                "WHERE user_id = ?", (f"cert-{user['id']}.{ext}", user["id"]))
    log(con, user["email"], "Uploaded certificate for verification", "self")
    return {"ok": True}


@app.get("/api/trainee/jobs")
def recommended_jobs(user: Trainee, con: Con) -> dict:
    """Round 1: open jobs at verified companies, ranked by certificate-to-JD skill match."""
    t = trainee_row(con, user["id"])
    if t["cert_verified"] != 1:
        return {"certVerified": False, "jobs": []}
    applied = {r[0] for r in con.execute("SELECT job_id FROM applications WHERE trainee_id = ?", (user["id"],))}
    have = {s.lower() for s in t["course_skills"]}
    jobs = []
    for j in open_jobs(con):
        score = cert_match(t["course_skills"], j["skills"])
        if score > 0:
            jobs.append({**j, "certScore": score, "applied": j["id"] in applied,
                         "fromCertificate": [s for s in j["skills"] if s.lower() in have]})
    jobs.sort(key=lambda j: j["certScore"], reverse=True)
    return {"certVerified": True, "jobs": jobs}


@app.post("/api/trainee/jobs/{job_id}/apply")
def apply(job_id: int, user: Trainee, con: Con) -> dict:
    """Round 2 runs here: the resume is screened against the JD the moment you apply."""
    t = trainee_row(con, user["id"])
    job = next((j for j in open_jobs(con) if j["id"] == job_id), None)
    if not job:
        raise HTTPException(404, "This job is not open.")
    if t["cert_verified"] != 1:
        raise HTTPException(409, "Your certificate has not been verified yet.")
    if not t["resume_text"]:
        raise HTTPException(409, "Add your resume before applying.")
    cs = cert_match(t["course_skills"], job["skills"])
    if cs == 0:
        raise HTTPException(409, "Your certified course does not cover any skill this job asks for.")
    rs, matched, missing = screen_resume(t["resume_text"], job["skills"])
    stage = "screened_in" if rs >= PASS_MARK else "screened_out"
    try:
        con.execute("INSERT INTO applications (job_id, trainee_id, cert_score, resume_score, matched, missing, stage) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)", (job_id, user["id"], cs, rs, json.dumps(matched), json.dumps(missing), stage))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "You have already applied to this job.")
    return {"stage": stage, "resumeScore": rs, "matched": matched, "missing": missing}


# ---------- employer ----------

def my_company(con: sqlite3.Connection, uid: int) -> dict:
    return dict(con.execute("SELECT * FROM companies WHERE user_id = ?", (uid,)).fetchone())


@app.get("/api/employer/me")
def employer_me(user: Employer, con: Con) -> dict:
    c = my_company(con, user["id"])
    c["jobs"] = db.rows(con.execute(
        "SELECT j.*, count(a.id) AS applicants, sum(a.stage != 'screened_out') AS passed, sum(a.stage = 'hired') AS hired "
        "FROM jobs j LEFT JOIN applications a ON a.job_id = j.id WHERE j.company_id = ? GROUP BY j.id ORDER BY j.posted DESC",
        (c["id"],)))
    return c


@app.post("/api/employer/jobs")
def post_job(body: Job, user: Employer, con: Con) -> dict:
    if body.salary_min and body.salary_max and body.salary_min > body.salary_max:
        raise HTTPException(422, "Minimum salary is above maximum.")
    skills = norm(body.skills)
    if not skills:
        raise HTTPException(422, "List at least one required skill.")
    c = my_company(con, user["id"])
    jid = con.execute(
        "INSERT INTO jobs (company_id, title, description, skills, district, salary_min, salary_max, openings) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (c["id"], body.title, body.description, json.dumps(skills), body.district, body.salary_min, body.salary_max, body.openings)).lastrowid
    log(con, user["email"], "Posted job: " + body.title, c["name"])
    return {"id": jid}


def own_job(con: sqlite3.Connection, uid: int, job_id: int) -> sqlite3.Row:
    job = con.execute("SELECT j.* FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ? AND c.user_id = ?",
                      (job_id, uid)).fetchone()
    if not job:
        raise HTTPException(404, "No such job in your company.")
    return job


@app.post("/api/employer/jobs/{job_id}/close")
def close_job(job_id: int, user: Employer, con: Con) -> dict:
    own_job(con, user["id"], job_id)
    con.execute("UPDATE jobs SET status = 'closed' WHERE id = ?", (job_id,))
    return {"ok": True}


@app.get("/api/employer/jobs/{job_id}/applicants")
def applicants(job_id: int, user: Employer, con: Con) -> list[dict]:
    """Only candidates who passed resume screening are shown, best match first."""
    own_job(con, user["id"], job_id)
    return db.rows(con.execute(
        "SELECT a.id, a.stage, a.cert_score, a.resume_score, a.matched, a.missing, u.name, u.email, t.phone, "
        "t.district, t.resume_text, t.certificate_no, c.name AS course FROM applications a "
        "JOIN trainees t ON t.user_id = a.trainee_id JOIN users u ON u.id = t.user_id JOIN courses c ON c.id = t.course_id "
        "WHERE a.job_id = ? AND a.stage != 'screened_out' ORDER BY a.resume_score + a.cert_score DESC", (job_id,)))


@app.post("/api/employer/applications/{app_id}")
def decide(app_id: int, body: Decision, user: Employer, con: Con) -> dict:
    a = con.execute(
        "SELECT a.id, a.trainee_id, a.stage, c.name AS company FROM applications a JOIN jobs j ON j.id = a.job_id "
        "JOIN companies c ON c.id = j.company_id WHERE a.id = ? AND c.user_id = ?", (app_id, user["id"])).fetchone()
    if not a or a["stage"] == "screened_out":
        raise HTTPException(404, "No such applicant.")
    if body.stage == "hired" and not body.salary:
        raise HTTPException(422, "Enter the monthly salary offered.")
    con.execute("UPDATE applications SET stage = ? WHERE id = ?", (body.stage, app_id))
    if body.stage == "hired":  # an employer-confirmed hire is the only kind of verified placement
        con.execute("UPDATE trainees SET outcome = 'employed', employer_name = ?, salary = ?, outcome_verified = 1, "
                    "outcome_updated = datetime('now') WHERE user_id = ?", (a["company"], body.salary, a["trainee_id"]))
    log(con, user["email"], "Applicant " + body.stage, f"application {app_id}")
    return {"ok": True}


@app.post("/api/employer/claims/{trainee_uid}")
def confirm_claim(trainee_uid: int, body: Verdict, user: Employer, con: Con) -> dict:
    """A trainee said they work here; the employer confirms or disputes it."""
    c = my_company(con, user["id"])
    n = con.execute("UPDATE trainees SET outcome_verified = ? WHERE user_id = ? AND employer_name = ? COLLATE NOCASE "
                    "AND outcome IN ('employed','apprentice')", (1 if body.verified else -1, trainee_uid, c["name"])).rowcount
    if not n:
        raise HTTPException(404, "No such employment claim for your company.")
    log(con, user["email"], "Employment claim " + ("confirmed" if body.verified else "disputed"), f"trainee {trainee_uid}")
    return {"ok": True}


# ---------- admin ----------

@app.get("/api/admin/pending")
def pending(user: Admin, con: Con) -> dict:
    return {
        "companies": db.rows(con.execute(
            "SELECT c.*, u.email, u.name AS contact FROM companies c JOIN users u ON u.id = c.user_id WHERE c.verified = 0")),
        "certificates": db.rows(con.execute(
            "SELECT t.user_id, u.name, u.email, t.certificate_no, t.certified_on, c.name AS course, c.qp_code FROM trainees t "
            "JOIN users u ON u.id = t.user_id JOIN courses c ON c.id = t.course_id WHERE t.cert_verified = 0")),
    }


@app.post("/api/admin/companies/{company_id}")
def verify_company(company_id: int, body: Verdict, user: Admin, con: Con) -> dict:
    if body.verified:
        n = con.execute("UPDATE companies SET verified = 1 WHERE id = ?", (company_id,)).rowcount
    else:  # rejected: remove the account so the GSTIN can re-register correctly
        n = con.execute("DELETE FROM users WHERE id = (SELECT user_id FROM companies WHERE id = ?)", (company_id,)).rowcount
    if not n:
        raise HTTPException(404, "No such company.")
    log(con, user["email"], "Company " + ("verified" if body.verified else "rejected"), f"company {company_id}")
    return {"ok": True}


@app.post("/api/admin/trainees/{trainee_id}/certificate")
def verify_certificate(trainee_id: int, body: CertVerdict, user: Admin, con: Con) -> dict:
    t = con.execute("SELECT cert_file FROM trainees WHERE user_id = ?", (trainee_id,)).fetchone()
    if not t:
        raise HTTPException(404, "No such trainee.")
    if body.verified and not t["cert_file"]:
        raise HTTPException(409, "No certificate file was uploaded, so it cannot be verified.")
    # cert_verified: 0 pending, 1 verified, -1 rejected; who, when and against what is kept with the record
    con.execute("UPDATE trainees SET cert_verified = ?, verified_by = ?, verified_at = datetime('now'), verify_note = ? "
                "WHERE user_id = ?", (1 if body.verified else -1, user["email"], body.note.strip(), trainee_id))
    log(con, user["email"], "Certificate " + ("verified" if body.verified else "rejected") + ": " + body.note.strip(),
        f"trainee {trainee_id}")
    return {"ok": True}


@app.get("/api/admin/trainees/{trainee_id}/certificate-file")
def certificate_file(trainee_id: int, user: Admin, con: Con) -> FileResponse:
    t = con.execute("SELECT cert_file FROM trainees WHERE user_id = ?", (trainee_id,)).fetchone()
    if not t or not t["cert_file"]:
        raise HTTPException(404, "No certificate file uploaded.")
    ext = t["cert_file"].rsplit(".", 1)[1]
    return FileResponse(db.UPLOAD_DIR / t["cert_file"], media_type={e: m for e, m in CERT_TYPES.values()}[ext])


@app.post("/api/admin/courses")
def add_course(body: Course, user: Admin, con: Con) -> dict:
    try:
        cid = con.execute("INSERT INTO courses (name, qp_code, sector, skills, source_url) VALUES (?, ?, ?, ?, ?)",
                          (body.name, body.qp_code, body.sector, json.dumps(norm(body.skills)), body.source_url)).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "A course with this name exists.")
    log(con, user["email"], "Published course", body.name)
    return {"id": cid}


def filtered_trainees(con: sqlite3.Connection, course_id: int | None, district: str | None, gender: str | None) -> list[dict]:
    sql = ("SELECT t.user_id, u.name, t.gender, t.district, t.course_id, c.name AS course, t.cert_verified, t.outcome, "
           "t.employer_name, t.salary, t.outcome_verified, t.outcome_updated, u.created FROM trainees t "
           "JOIN users u ON u.id = t.user_id JOIN courses c ON c.id = t.course_id WHERE 1=1")
    args: list[Any] = []
    for col, val in (("t.course_id", course_id), ("t.district", district), ("t.gender", gender)):
        if val:
            sql += f" AND {col} = ?"
            args.append(val)
    return db.rows(con.execute(sql + " ORDER BY u.created DESC", args))


def summarise(ts: list[dict]) -> dict:
    reported = [t for t in ts if t["outcome"]]
    placed = [t for t in reported if t["outcome"] in PLACED]
    paid = [t["salary"] for t in placed if t["salary"]]
    return {
        "trainees": len(ts),
        "certVerified": sum(t["cert_verified"] == 1 for t in ts),
        "reported": len(reported),
        "placed": len(placed),
        "verifiedPlacements": sum(t["outcome_verified"] for t in ts),
        "placementRate": len(placed) / len(reported) if reported else None,
        "avgSalary": sum(paid) / len(paid) if paid else None,
    }


@app.get("/api/admin/analytics")
def analytics(user: Admin, con: Con, course_id: int | None = None, district: str | None = None,
              gender: str | None = None) -> dict:
    ts = filtered_trainees(con, course_id, district, gender)
    by = lambda key: sorted(  # noqa: E731
        ({"key": k, **summarise([t for t in ts if t[key] == k])} for k in {t[key] for t in ts}),
        key=lambda r: -r["trainees"])

    # industry demand = skills asked for in open JDs of verified companies; taught = course curriculum
    jobs = open_jobs(con)
    courses = db.rows(con.execute("SELECT id, name, qp_code, skills FROM courses ORDER BY name"))
    demand = Counter(s.lower() for j in jobs for s in j["skills"])
    spelling = {s.lower(): s for j in jobs for s in j["skills"]}
    gaps = []
    for c in courses:
        relevant = [j for j in jobs if cert_match(c["skills"], j["skills"]) > 0]
        need = Counter(s.lower() for j in relevant for s in j["skills"])
        taught = {s.lower() for s in c["skills"]}
        gaps.append({
            "course": c["name"], "qp_code": c["qp_code"], "taught": c["skills"], "jobs": len(relevant),
            "missing": [{"skill": spelling[s], "jobs": n} for s, n in need.most_common() if s not in taught],
        })
    return {
        "summary": summarise(ts),
        "outcomes": Counter(t["outcome"] or "unreported" for t in ts),
        "byCourse": by("course"), "byDistrict": by("district"), "byGender": by("gender"),
        "pipeline": dict(con.execute("SELECT stage, count(*) FROM applications GROUP BY stage").fetchall()),
        "demand": [{"skill": spelling[s], "jobs": n} for s, n in demand.most_common(15)],
        "openJobs": len(jobs),
        "gaps": gaps,
    }


@app.get("/api/admin/trainees")
def registry(user: Admin, con: Con, course_id: int | None = None, district: str | None = None,
             gender: str | None = None) -> list[dict]:
    return filtered_trainees(con, course_id, district, gender)


@app.get("/api/admin/export.csv")
def export(user: Admin, con: Con, course_id: int | None = None, district: str | None = None,
           gender: str | None = None) -> Response:
    ts = filtered_trainees(con, course_id, district, gender)
    buf = io.StringIO()
    w = csv.writer(buf)
    cols = ["user_id", "name", "gender", "district", "course", "cert_verified", "outcome", "employer_name",
            "salary", "outcome_verified", "outcome_updated"]
    w.writerow(cols)
    w.writerows([t[c] for c in cols] for t in ts)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=skilltrack-trainees.csv"})


# ---------- /api/db: real data in the shape the original pages read (assets/js/data.js) ----------

def months_between(a: str | None, b: date) -> int:
    if not a:
        return 0
    d = date.fromisoformat(a[:10])
    return max(0, (b.year - d.year) * 12 + b.month - d.month - (b.day < d.day))


def legacy_trainee(t: dict, companies: dict[str, int], today: date) -> dict:
    months = months_between(t["certified_on"], today)
    placed = t["outcome"] in PLACED
    cert = date.fromisoformat(t["certified_on"])
    follow = {}
    for wave, m in (("3m", 3), ("6m", 6), ("12m", 12), ("24m", 24)):
        # a wave counts as answered if the trainee updated their status at or after that milestone
        follow[wave] = ("scheduled" if months < m else
                        "responded" if t["outcome_updated"] and months_between(t["certified_on"], date.fromisoformat(t["outcome_updated"][:10])) >= m
                        else "no-response")
    return {
        "id": trainee_id(t["user_id"], t["created"]), "uid": t["user_id"], "name": t["name"], "gender": t["gender"],
        "age": months_between(t["dob"], today) // 12, "phone": "+91 " + t["phone"], "email": t["email"],
        "district": t["district"], "course": t["course"], "courseCode": t["qp_code"], "sector": t["sector"],
        "provider": "Not recorded", "providerId": None,
        "batch": f"{cert.year}-{'A' if cert.month <= 6 else 'B'}", "enrolled": t["certified_on"],
        "attendance": None, "score": None, "certified": t["cert_verified"] == 1, "certStatus": t["cert_verified"],
        "outcome": t["outcome"] or "notplaced", "outcomeReported": bool(t["outcome"]),
        "employer": t["employer_name"], "employerId": f"EMP-{companies[t['employer_name'].lower()]}" if t["employer_name"] and t["employer_name"].lower() in companies else None,
        "startingSalary": t["salary"] or 0, "currentSalary": t["salary"] or 0, "retained12m": None,
        "relevance": t["relevance"] or 0,
        "reason": None if placed else (t["reason"] or ("NOREPORT" if not t["outcome"] else None)),
        "monthsSince": months, "follow": follow, "consent": True, "contactValid": True,
        "verified": (t["outcome_verified"] == 1) if placed else None,
        "jobRole": t["job_role"], "outcomeUpdated": t["outcome_updated"], "skills": t["skills"],
    }


@app.get("/api/db")
def snapshot(user: Annotated[dict, Depends(current_user)], con: Con) -> dict:
    today = date.today()
    companies = db.rows(con.execute(
        "SELECT c.*, u.name AS contact, u.email, u.created FROM companies c JOIN users u ON u.id = c.user_id"))
    by_name = {c["name"].lower(): c["id"] for c in companies}
    raw = db.rows(con.execute(
        "SELECT t.*, u.name, u.email, u.created, c.name AS course, c.qp_code, c.sector, c.skills AS course_skills "
        "FROM trainees t JOIN users u ON u.id = t.user_id JOIN courses c ON c.id = t.course_id"), ("skills", "course_skills"))
    me_company = next((c for c in companies if c["user_id"] == user["id"]), None)
    if user["role"] == "trainee":
        raw = [t for t in raw if t["user_id"] == user["id"]]
    elif user["role"] == "employer":
        applied = {r[0] for r in con.execute("SELECT a.trainee_id FROM applications a JOIN jobs j ON j.id = a.job_id "
                                             "WHERE j.company_id = ?", (me_company["id"],))}
        raw = [t for t in raw if t["user_id"] in applied or (t["employer_name"] or "").lower() == me_company["name"].lower()]
    trainees = [legacy_trainee(t, by_name, today) for t in raw]

    courses = db.rows(con.execute("SELECT * FROM courses ORDER BY name"))
    jobs = open_jobs(con)
    gaps = []
    for c in courses:
        need = Counter(s for j in jobs if cert_match(c["skills"], j["skills"]) > 0 for s in j["skills"])
        gaps.append({"course": c["name"], "industry": [s for s, _ in need.most_common()], "taught": c["skills"],
                     "demandIndex": sum(1 for j in jobs if cert_match(c["skills"], j["skills"]) > 0)})

    def job_view(j: dict) -> dict:
        sal = (f"₹{j['salary_min']:,}" if j["salary_min"] else "") + (f" – ₹{j['salary_max']:,}" if j["salary_max"] else "")
        return {"id": f"JOB-{j['id']}", "rawId": j["id"], "title": j["title"], "openings": j["openings"], "skills": j["skills"],
                "district": j["district"], "salary": sal or "Not stated", "posted": j["posted"][:10],
                "applicants": j.get("applicants", 0), "status": j["status"], "company": j.get("company", ""),
                "description": j["description"]}

    out: dict[str, Any] = {
        "user": user,
        "trainees": trainees,
        "DISTRICTS": [{"name": d} for d in MP_DISTRICTS],
        "COURSES": [{"code": c["qp_code"], "name": c["name"], "sector": c["sector"], "duration": None, "fee": None,
                     "skills": c["skills"], "source_url": c["source_url"], "id": c["id"]} for c in courses],
        "PROVIDERS": [],
        "BATCHES": [{"id": b, "label": b.replace("-", " Batch "), "start": None, "ageMonths": None}
                    for b in sorted({t["batch"] for t in trainees})],
        "EMPLOYERS": [{"id": f"EMP-{c['id']}", "name": c["name"], "sector": c["sector"], "district": c["district"], "size": c["size"],
                       "verified": bool(c["verified"]), "gstin": c["gstin"], "contact": c["contact"], "email": c["email"],
                       "phone": "", "hires": sum(1 for t in trainees if t["employerId"] == f"EMP-{c['id']}"), "rating": None}
                      for c in companies if c["verified"] or user["role"] == "admin"],
        "SKILL_GAPS": gaps,
        "CAMPAIGNS": [],
        "VALIDATION_QUEUE": [], "VERIFY_REQUESTS": [], "AUDIT_LOG": [],
        "JOB_POSTINGS": [job_view(j) for j in jobs],
        "ADMIN_USER": None, "EMPLOYER_USER": None, "TRAINEE_USER": None,
    }
    initials = "".join(w[0] for w in user["name"].split()[:2]).upper()

    if user["role"] == "admin":
        q = out["VALIDATION_QUEUE"]
        for c in companies:
            if not c["verified"]:
                q.append({"id": f"GST-{c['id']}", "kind": "company", "ref": c["id"], "type": "GSTIN unverified", "severity": "warning",
                          "subject": f"EMP-{c['id']} — {c['name']}", "detail": f"GSTIN {c['gstin']} has not been checked on the GST portal yet.",
                          "source": "Company registration", "raised": c["created"][:10]})
        for t in raw:
            if t["cert_verified"] == 0:
                q.append({"id": f"CRT-{t['user_id']}", "kind": "certificate", "ref": t["user_id"], "type": "Certificate unverified",
                          "severity": "serious", "subject": trainee_id(t["user_id"], t["created"]),
                          "detail": f"Certificate {t['certificate_no']} ({t['course']}, {t['qp_code']}, issued {t['certified_on']}) for {t['name']}, "
                                    f"born {t['dob']}. Automatic checks passed (unique certificate and phone, plausible dates). "
                                    + ("Open the uploaded certificate and check it with the issuing body." if t["cert_file"] else "No certificate file uploaded — cannot be verified."),
                          "file": f"/api/admin/trainees/{t['user_id']}/certificate-file" if t["cert_file"] else None,
                          "source": "Trainee registration", "raised": t["created"][:10]})
            if t["outcome_verified"] == -1:
                q.append({"id": f"EMP-CLAIM-{t['user_id']}", "kind": "claim", "ref": t["user_id"], "type": "Employer mismatch",
                          "severity": "critical", "subject": trainee_id(t["user_id"], t["created"]),
                          "detail": f"Trainee reports working at '{t['employer_name']}'; the employer disputed it.",
                          "source": "Employer portal", "raised": (t["outcome_updated"] or "")[:10]})
        out["AUDIT_LOG"] = [{"at": r["at"][:16], "actor": r["actor"], "action": r["action"], "target": r["target"], "ip": "—"}
                            for r in db.rows(con.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 200"))]
        row = con.execute("SELECT created FROM users WHERE id = ?", (user["id"],)).fetchone()
        out["ADMIN_USER"] = {
            "name": user["name"], "initials": initials, "role": "Administrator", "dept": "MP State Skill Development Mission",
            "id": f"ADM-{user['id']:04d}", "email": user["email"], "phone": "—", "jurisdiction": "All districts — Madhya Pradesh",
            "since": row[0][:10], "lastLogin": "this session", "mfa": False,
            "permissions": [{"name": n, "granted": True} for n in (
                "View aggregate analytics", "View trainee records", "Verify companies (GSTIN)",
                "Verify certificates", "Publish courses")] + [{"name": "Export raw microdata", "granted": True}],
        }

    if user["role"] == "employer":
        c = me_company
        out["VERIFY_REQUESTS"] = [
            {"id": f"VR-{t['user_id']}", "uid": t["user_id"], "trainee": t["name"], "traineeId": trainee_id(t["user_id"], t["created"]),
             "role": t["job_role"] or "—", "since": (t["outcome_updated"] or "")[:10], "salary": t["salary"] or 0,
             "raised": (t["outcome_updated"] or "")[:10],
             "status": {0: "pending", 1: "confirmed", -1: "disputed"}[t["outcome_verified"]]}
            for t in raw if (t["employer_name"] or "").lower() == c["name"].lower() and t["outcome"] in ("employed", "apprentice")]
        own = db.rows(con.execute("SELECT j.*, count(a.id) AS applicants FROM jobs j LEFT JOIN applications a ON a.job_id = j.id "
                                  "WHERE j.company_id = ? GROUP BY j.id ORDER BY j.posted DESC", (c["id"],)))
        out["JOB_POSTINGS"] = [job_view(j) for j in own]
        out["EMPLOYER_USER"] = {
            "id": f"EMP-{c['id']}", "name": c["name"], "sector": c["sector"], "district": c["district"], "size": c["size"], "verified": bool(c["verified"]),
            "gstin": c["gstin"], "contact": c["contact"], "email": c["email"], "phone": "", "hires": sum(1 for t in trainees if t["verified"]),
            "rating": None, "initials": initials, "onboarded": c["created"][:10], "contactRole": "", "address": c["district"],
            "website": c["website"] or "", "apiKey": None,
        }

    if user["role"] == "trainee":
        t, T = raw[0], dict(trainees[0])
        placed = t["outcome"] in PLACED
        T.update({
            "initials": initials, "altPhone": "", "address": t["location"] or t["district"], "aadhaarMasked": "—",
            "completed": t["certified_on"], "certId": t["certificate_no"], "certDate": t["certified_on"],
            "role": t["job_role"], "employedSince": (t["outcome_updated"] or "")[:10],
            # course skills come from the published qualification pack; others are self-declared at registration
            "skills": [{"name": s, "level": 100} for s in t["course_skills"]] +
                      [{"name": s, "level": 60} for s in t["skills"] if s.lower() not in {c.lower() for c in t["course_skills"]}],
            "wageHistory": [{"label": "Reported", "month": (t["outcome_updated"] or "")[:7], "amount": t["salary"]}] if t["salary"] else [],
            "journey": [
                {"stage": "Registration & consent", "date": t["created"][:10], "status": "done", "note": f"ID {T['id']} issued. Consent recorded."},
                {"stage": "Certification", "date": t["certified_on"], "status": "done", "note": f"Certificate {t['certificate_no']} — {t['course']} ({t['qp_code']})."},
                {"stage": "Certificate verification", "date": t["created"][:10],
                 "status": {1: "done", 0: "active", -1: "active"}[t["cert_verified"]],
                 "note": {1: "Verified by the mission office.", 0: "Waiting for the mission office to verify.",
                          -1: "Could not be verified. Contact the mission office."}[t["cert_verified"]]},
            ] + ([{"stage": "Placement", "date": (t["outcome_updated"] or "")[:10], "status": "done",
                   "note": f"{t['employer_name'] or 'Placed'}" + (" · verified by employer" if t["outcome_verified"] == 1 else " · self-reported")}]
                 if placed else []),
            "pendingSurvey": ([{"q": f"Are you still working at {t['employer_name']}?", "type": "yesno"}] if placed and t["employer_name"] else []) +
                             [{"q": "What is your current monthly take-home income?", "type": "amount"},
                              {"q": "How relevant was your training to your work?", "type": "scale"}],
            "notifications": [],
            "applications": db.rows(con.execute(
                "SELECT a.id, a.stage, a.cert_score, a.resume_score, a.matched, a.missing, a.created, j.title, c.name AS company "
                "FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id "
                "WHERE a.trainee_id = ? ORDER BY a.created DESC", (user["id"],))),
            "resume": t["resume_text"],
            "certFile": bool(t["cert_file"]), "verifyNote": t["verify_note"] if t["cert_verified"] == -1 else None,
        })
        out["TRAINEE_USER"] = T
    return out


# ---------- frontend: only assets/ and top-level pages, never the repo (the DB lives in it) ----------

PAGES = {p.name for p in FRONTEND_DIR.glob("*.html")}
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/", include_in_schema=False)
@app.get("/{page}", include_in_schema=False)
def page(page: str = "index.html") -> FileResponse:
    if page not in PAGES:
        raise HTTPException(404)
    return FileResponse(FRONTEND_DIR / page)
