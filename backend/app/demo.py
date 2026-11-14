"""
demo.py -- fictional companies and open jobs for demos. NOT real organisations.

    python -m app.demo          # add (skips companies already present)
    python -m app.demo trainees [FILE.csv]  # import fictional trainees (default: backend/demo_trainees.csv)
    python -m app.demo remove   # delete every demo company and demo trainee, with their jobs and applications

Demo companies use hr@<name>.demo.skilltrack emails, demo trainees @example.com (a reserved
domain no real person has); every demo account's password is "demo1234".
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from . import db

DOMAIN = "demo.skilltrack"

# name, sector, size, district, GSTIN, [(title, skills, salary_min, salary_max, openings, description)]
COMPANIES = [
    # large employers
    ("Narmada Infotech Ltd", "IT-ITeS", "5000+", "Indore", "23AABCN1001A1Z1", [
        ("Junior Data Analyst", ["Excel", "SQL", "Power BI", "Statistics"], 22000, 30000, 15,
         "Clean and analyse client sales data, build weekly dashboards in Power BI and present findings to account managers."),
        ("Associate Software Engineer", ["JavaScript", "HTML/CSS", "React", "Git"], 25000, 35000, 20,
         "Build and maintain web front-ends for enterprise clients in an agile team. Training provided on internal frameworks."),
    ]),
    ("Vindhya Steel & Power Ltd", "Capital Goods", "5000+", "Jabalpur", "23AABCV1002B1Z2", [
        ("Welder (MIG/TIG)", ["MIG", "TIG", "ARC", "Blueprint reading"], 18000, 24000, 30,
         "Fabrication-shop welding of structural steel to drawings. Shift work; safety gear provided."),
        ("Plant Electrician", ["Wiring", "Motor control", "PLC basics", "Safety cert"], 20000, 26000, 12,
         "Maintain plant electrical systems, motors and control panels; respond to breakdowns on shift."),
    ]),
    ("Malwa Motors Ltd", "Automotive", "1000-5000", "Indore", "23AABCM1003C1Z3", [
        ("Service Technician", ["Engine service", "Diagnostics tool", "EV basics"], 17000, 23000, 18,
         "Periodic service and fault diagnosis of passenger vehicles at the Indore workshop, including EV models."),
    ]),
    ("Central India Health Group", "Healthcare", "1000-5000", "Bhopal", "23AABCC1004D1Z4", [
        ("General Duty Assistant", ["Patient care", "Vitals", "Infection control", "Basic life support"], 15000, 19000, 25,
         "Assist nursing staff with patient care, vitals monitoring and ward hygiene across our Bhopal hospitals."),
        ("Medical Records Assistant", ["EMR entry", "Excel", "Typing"], 14000, 18000, 6,
         "Enter and maintain patient records in the hospital EMR system; prepare daily reports."),
    ]),
    ("Satpura Retail Ltd", "Retail", "5000+", "Gwalior", "23AABCS1005E1Z5", [
        ("Retail Sales Associate", ["Customer handling", "POS billing", "Upselling", "Spoken English"], 13000, 17000, 40,
         "Serve customers on the shop floor, handle billing and help hit store sales targets."),
    ]),
    ("Indus Textiles Ltd", "Textiles", "1000-5000", "Dewas", "23AABCI1006F1Z6", [
        ("Sewing Machine Operator", ["Machine operation", "Stitching", "Quality check"], 12000, 15000, 50,
         "Operate industrial sewing machines on the garment line to daily quality and output targets."),
    ]),
    # startups
    ("PayKhata Technologies", "Fintech", "50-200", "Indore", "23AABCP1007G1Z7", [
        ("Customer Support Executive", ["Customer handling", "Spoken English", "Excel", "Typing"], 15000, 20000, 10,
         "Resolve merchant queries over phone and chat for our digital ledger app; Hindi and English required."),
        ("Data Operations Intern", ["Excel", "SQL"], 10000, 12000, 4,
         "Six-month paid internship cleaning transaction data and maintaining reports for the ops team."),
    ]),
    ("KhetiTech Agro", "Agritech", "10-50", "Ujjain", "23AABCK1008H1Z8", [
        ("Field Sales Associate", ["Customer handling", "Spoken English", "Upselling"], 14000, 18000, 8,
         "Visit farmers and agri-input dealers across Ujjain district to onboard them to our crop-advice app."),
    ]),
    ("SolarSetu Energy", "Green Energy", "50-200", "Sagar", "23AABCS1009J1Z9", [
        ("Solar PV Technician", ["Panel install", "Inverter config", "Rooftop safety", "Net metering"], 16000, 22000, 14,
         "Install and commission rooftop solar systems for homes and small businesses across Bundelkhand."),
    ]),
    ("GreenRide EV", "Automotive", "50-200", "Bhopal", "23AABCG1010K1Z1", [
        ("EV Service Technician", ["EV basics", "Diagnostics tool", "Wiring"], 16000, 21000, 6,
         "Service and repair electric two-wheelers at our Bhopal hub; battery and motor diagnostics."),
    ]),
    ("ByteNest Labs", "IT-ITeS", "10-50", "Bhopal", "23AABCB1011L1Z2", [
        ("Junior Web Developer", ["JavaScript", "HTML/CSS", "React", "REST APIs"], 18000, 26000, 3,
         "Ship features for client web apps in a small product team. Portfolio or GitHub link preferred."),
    ]),
    ("QuickKirana", "Retail", "50-200", "Jabalpur", "23AABCQ1012M1Z3", [
        ("Inventory & Billing Associate", ["POS billing", "Inventory app", "Excel"], 13000, 16000, 12,
         "Manage stock, billing and order packing at our quick-commerce dark stores in Jabalpur."),
    ]),
]


DEMO_PW_HASH = db.hash_pw("demo1234")  # hashed once; scrypt per row would take ~minutes for 200 rows


def add() -> int:
    db.init()
    added = 0
    with db.connect() as con:
        for name, sector, size, district, gstin, jobs in COMPANIES:
            email = f"hr@{name.split()[0].lower()}.{DOMAIN}"
            if con.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                continue
            uid = con.execute("INSERT INTO users (role, email, name, pw_hash) VALUES ('employer', ?, ?, ?)",
                              (email, f"{name} HR", db.hash_pw("demo1234"))).lastrowid
            cid = con.execute("INSERT INTO companies (user_id, name, gstin, website, district, sector, size, verified) "
                              "VALUES (?, ?, ?, '', ?, ?, ?, 1)", (uid, name + " (demo)", gstin, district, sector, size)).lastrowid
            for title, skills, lo, hi, openings, desc in jobs:
                con.execute("INSERT INTO jobs (company_id, title, description, skills, district, salary_min, salary_max, openings) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (cid, title, desc, json.dumps(skills), district, lo, hi, openings))
            added += 1
    return added


def import_trainees(path: str) -> tuple[int, list[str]]:
    """Validate each row like the registration form, then insert it with its certificate pending verification."""
    from .main import TraineeSignup, norm  # the API's own validation rules
    db.init()
    added, problems = 0, []
    with db.connect() as con:
        courses = {name.lower(): cid for cid, name in con.execute("SELECT id, name FROM courses")}
        for n, row in enumerate(csv.DictReader(open(path, encoding="utf-8-sig")), start=2):
            row = {k: (v or "").strip() for k, v in row.items()}
            where = f"line {n} ({row.get('email')})"
            if not row["email"].lower().endswith("@example.com"):
                problems.append(f"{where}: demo emails must end with @example.com")
                continue
            if row["course"].lower() not in courses:
                problems.append(f"{where}: course '{row['course']}' is not published")
                continue
            try:
                t = TraineeSignup(name=row["name"] + " (demo)", email=row["email"], password="demo1234", phone=row["phone"],
                                  gender=row["gender"], dob=row["dob"], district=row["district"],
                                  course_id=courses[row["course"].lower()], certificate_no=row["certificate_no"],
                                  certified_on=row["certified_on"], consent=True, skills=[row["skills"]])
            except ValidationError as e:
                problems.append(f"{where}: " + "; ".join(f"{x['loc'][-1]} {x['msg']}" for x in e.errors()))
                continue
            outcome = row["outcome"] or None
            if outcome not in (None, "employed", "self", "apprentice", "notplaced"):
                problems.append(f"{where}: unknown outcome '{outcome}'")
                continue
            if con.execute("SELECT 1 FROM users WHERE email = ?", (t.email,)).fetchone():
                continue  # already imported
            uid = con.execute("INSERT INTO users (role, email, name, pw_hash) VALUES ('trainee', ?, ?, ?)",
                              (t.email, t.name, DEMO_PW_HASH)).lastrowid
            con.execute(
                "INSERT INTO trainees (user_id, phone, gender, dob, district, course_id, certificate_no, certified_on, "
                "cert_verified, consent_at, resume_text, skills, outcome, employer_name, salary, reason, outcome_updated) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END)",
                (uid, t.phone, t.gender, t.dob, t.district, t.course_id, t.certificate_no, t.certified_on, row["resume_text"],
                 json.dumps(norm(t.skills)), outcome, row["employer_name"] or None,
                 int(row["salary"]) if row["salary"] else None, row["reason"] or None, outcome))
            added += 1
    return added, problems


def remove() -> int:
    with db.connect() as con:  # cascades to companies, trainees, jobs, applications, sessions
        return con.execute("DELETE FROM users WHERE email LIKE ? OR email LIKE '%@example.com'", (f"%.{DOMAIN}",)).rowcount


if __name__ == "__main__":
    if sys.argv[1:] == ["remove"]:
        print(f"Removed {remove()} demo accounts.")
    elif sys.argv[1:2] == ["trainees"] and len(sys.argv) <= 3:
        n, bad = import_trainees(sys.argv[2] if len(sys.argv) == 3 else str(Path(__file__).resolve().parents[1] / "demo_trainees.csv"))
        print(f"Imported {n} demo trainees. Sign in with their email and password demo1234.")
        print("\n".join(["Skipped:"] + bad) if bad else "No rows skipped.")
    else:
        print(f"Added {add()} demo companies ({len(COMPANIES)} defined). Sign in as any with password demo1234.")
