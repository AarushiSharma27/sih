"""End-to-end: register -> verify -> post job -> certificate match -> resume screening -> hire -> dashboard."""
import base64
import os
import tempfile

os.environ["SKILLTRACK_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402


PDF = base64.b64encode(b"%PDF-1.4 test certificate").decode()


def client(email, pw="password123"):
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200
    return c


def test_full_flow():
    with db.connect() as con:
        con.execute("INSERT INTO users (role, email, name, pw_hash) VALUES ('admin', 'a@gov.in', 'Admin', ?)", (db.hash_pw("password123"),))
    admin = client("a@gov.in")
    assert TestClient(app).get("/api/auth/me").status_code == 401
    cid = admin.post("/api/admin/courses", json={"name": "Data Entry", "qp_code": "SSC/Q2212", "sector": "IT",
        "skills": ["Excel", "Typing", "SQL"], "source_url": "https://example.org/qp"}).json()["id"]

    emp = TestClient(app)
    r = emp.post("/api/auth/register/employer", json={"name": "HR", "email": "hr@co.in", "password": "password123",
        "company": "Co Pvt Ltd", "gstin": "23ABCDE1234F1Z5", "district": "Indore"})
    assert r.status_code == 200, r.text
    job = emp.post("/api/employer/jobs", json={"title": "Data Analyst", "description": "Analyse sales data and build reports weekly.",
        "skills": ["SQL", "Power BI", "excel "], "district": "Indore", "salary_min": 18000}).json()["id"]

    tr = TestClient(app)
    r = tr.post("/api/auth/register/trainee", json={"name": "Ravi", "email": "ravi@x.in", "password": "password123",
        "phone": "9876543210", "gender": "M", "dob": "2001-01-01", "district": "Indore", "course_id": cid,
        "certificate_no": "CERT-1", "certified_on": "2026-01-01", "consent": True, "certificate_file": PDF})
    assert r.status_code == 200, r.text

    # strong verification: each of these registrations must be refused
    base = {"name": "Fake", "password": "password123", "gender": "M", "dob": "2001-01-01", "district": "Indore",
            "course_id": cid, "certified_on": "2026-01-01", "consent": True, "certificate_file": PDF}
    bad = [
        ({"email": "f1@x.in", "phone": "9876500001", "certificate_no": "cert-1"}, 409),           # same certificate (any case)
        ({"email": "f2@x.in", "phone": "9876543210", "certificate_no": "CERT-2"}, 409),           # same phone
        ({"email": "f3@x.in", "phone": "9876500003", "certificate_no": "CERT-3", "certified_on": "2099-01-01"}, 422),
        ({"email": "f4@x.in", "phone": "9876500004", "certificate_no": "CERT-4", "certified_on": "2010-01-01"}, 422),  # before age 14
        ({"email": "f5@x.in", "phone": "9876500005", "certificate_no": "CERT-5", "certificate_file": None}, 422),
        ({"email": "f6@x.in", "phone": "9876500006", "certificate_no": "CERT-6",
          "certificate_file": base64.b64encode(b"MZ not a pdf").decode()}, 422),                 # wrong file type
    ]
    for extra, code in bad:
        assert TestClient(app).post("/api/auth/register/trainee", json={**base, **extra}).status_code == code, extra
    assert TestClient(app).post("/api/auth/login", json={"email": "f1@x.in", "password": "password123"}).status_code == 401  # rolled back
    assert tr.get("/api/trainee/me").json()["name"] == "Ravi"          # the signed-in user, never a demo profile
    assert tr.get("/api/trainee/jobs").json() == {"certVerified": False, "jobs": []}

    uid = tr.get("/api/auth/me").json()["id"]
    co = admin.get("/api/admin/pending").json()["companies"][0]["id"]
    assert admin.post(f"/api/admin/companies/{co}", json={"verified": True}).status_code == 200
    assert admin.get(f"/api/admin/trainees/{uid}/certificate-file").content.startswith(b"%PDF")
    assert tr.get(f"/api/admin/trainees/{uid}/certificate-file").status_code == 403
    assert admin.post(f"/api/admin/trainees/{uid}/certificate", json={"verified": True}).status_code == 422  # note required
    assert admin.post(f"/api/admin/trainees/{uid}/certificate",
                      json={"verified": True, "note": "Skill India Digital: number and name match"}).status_code == 200
    with db.connect() as con:
        assert con.execute("SELECT verified_by FROM trainees WHERE user_id = ?", (uid,)).fetchone()[0] == "a@gov.in"

    jobs = tr.get("/api/trainee/jobs").json()["jobs"]
    assert [j["id"] for j in jobs] == [job] and abs(jobs[0]["certScore"] - 2 / 3) < 1e-9
    assert tr.post(f"/api/trainee/jobs/{job}/apply").status_code == 409  # no resume yet
    tr.put("/api/trainee/resume", json={"text": "Two years using SQL and Excel to build monthly sales reports for a retail chain."})
    r = tr.post(f"/api/trainee/jobs/{job}/apply").json()
    assert r["stage"] == "screened_in" and r["missing"] == ["Power BI"]

    apps = emp.get(f"/api/employer/jobs/{job}/applicants").json()
    assert len(apps) == 1
    assert tr.get(f"/api/employer/jobs/{job}/applicants").status_code == 403
    assert emp.post(f"/api/employer/applications/{apps[0]['id']}", json={"stage": "hired", "salary": 21000}).status_code == 200

    a = admin.get("/api/admin/analytics").json()
    assert a["summary"]["verifiedPlacements"] == 1 and a["summary"]["placementRate"] == 1.0
    assert a["gaps"][0]["missing"] == [{"skill": "Power BI", "jobs": 1}]
    assert admin.get("/backend/skilltrack.db").status_code == 404 and admin.get("/t.db").status_code == 404

    # the data the original pages read: each role sees only what it should
    d = admin.get("/api/db").json()
    assert len(d["trainees"]) == 1 and d["trainees"][0]["verified"] is True and d["ADMIN_USER"]["name"] == "Admin"
    assert d["SKILL_GAPS"][0]["industry"] and not d["VALIDATION_QUEUE"]
    e = emp.get("/api/db").json()
    assert e["EMPLOYER_USER"]["name"] == "Co Pvt Ltd" and e["JOB_POSTINGS"][0]["applicants"] == 1 and e["ADMIN_USER"] is None
    t = tr.get("/api/db").json()
    assert t["TRAINEE_USER"]["name"] == "Ravi" and len(t["trainees"]) == 1 and t["AUDIT_LOG"] == []
    assert TestClient(app).get("/api/db").status_code == 401

    # trainees can sign in with their SkillTrack ID
    sid = t["TRAINEE_USER"]["id"]
    assert TestClient(app).post("/api/auth/login", json={"email": sid, "password": "password123"}).json()["role"] == "trainee"

    # employer confirms a self-reported claim
    tr.put("/api/trainee/outcome", json={"outcome": "employed", "employer_name": "co pvt ltd", "salary": 22000})
    assert emp.post(f"/api/employer/claims/{uid}", json={"verified": True}).status_code == 200
    assert emp.post("/api/employer/claims/999", json={"verified": True}).status_code == 404
