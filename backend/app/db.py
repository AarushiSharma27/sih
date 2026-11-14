"""
db.py -- SQLite storage. Every figure the app shows is computed from these tables;
nothing is generated. The file lives at backend/skilltrack.db (override with
SKILLTRACK_DB). Create the first administrator with:

    python -m app.db create-admin you@example.gov.in "Your Name"
"""

from __future__ import annotations

import getpass
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(os.environ.get("SKILLTRACK_DB", Path(__file__).resolve().parents[1] / "skilltrack.db"))
UPLOAD_DIR = DB_PATH.parent / "uploads"  # certificate files; outside the served folders

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('trainee','employer','admin')),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, pw_hash TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created TEXT NOT NULL DEFAULT (datetime('now')));
-- what a course teaches, entered by an admin from the official qualification pack
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, qp_code TEXT, sector TEXT,
  skills TEXT NOT NULL, source_url TEXT);
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, gstin TEXT NOT NULL, website TEXT, district TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL, skills TEXT NOT NULL, district TEXT NOT NULL,
  salary_min INTEGER, salary_max INTEGER, openings INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  posted TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS trainees (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL, gender TEXT NOT NULL, dob TEXT NOT NULL, district TEXT NOT NULL,
  course_id INTEGER NOT NULL REFERENCES courses(id), certificate_no TEXT NOT NULL,
  certified_on TEXT NOT NULL, cert_verified INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT NOT NULL, resume_text TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '', education TEXT NOT NULL DEFAULT '', experience TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '', job_role TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '[]',
  relevance INTEGER, reason TEXT,
  outcome TEXT CHECK (outcome IN ('employed','self','apprentice','notplaced')),
  employer_name TEXT, salary INTEGER, outcome_verified INTEGER NOT NULL DEFAULT 0,
  outcome_updated TEXT);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trainee_id INTEGER NOT NULL REFERENCES trainees(user_id) ON DELETE CASCADE,
  cert_score REAL NOT NULL, resume_score REAL NOT NULL, matched TEXT NOT NULL, missing TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('screened_in','screened_out','shortlisted','rejected','hired')),
  created TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (job_id, trainee_id));
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), actor TEXT NOT NULL,
  action TEXT NOT NULL, target TEXT NOT NULL);
"""


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init() -> None:
    with connect() as con:
        con.executescript(SCHEMA)
        # columns added after the first release; ALTER fails harmlessly once present
        for table, col in (("companies", "sector TEXT NOT NULL DEFAULT ''"), ("companies", "size TEXT NOT NULL DEFAULT ''"),
                           ("trainees", "cert_file TEXT"), ("trainees", "verified_by TEXT"),
                           ("trainees", "verified_at TEXT"), ("trainees", "verify_note TEXT")):
            try:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass
        # one person, one certificate: the same certificate or phone cannot register twice
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS trainee_cert ON trainees (lower(certificate_no))")
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS trainee_phone ON trainees (phone)")


def rows(cur: sqlite3.Cursor, json_cols: tuple[str, ...] = ("skills", "matched", "missing")) -> list[dict]:
    out = []
    for r in cur.fetchall():
        d = dict(r)
        for c in json_cols:
            if c in d and isinstance(d[c], str):
                d[c] = json.loads(d[c])
        out.append(d)
    return out


def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    return salt.hex() + ":" + hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1).hex()


def check_pw(pw: str, stored: str) -> bool:
    salt, digest = stored.split(":")
    calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()
    return hmac.compare_digest(calc, digest)


if __name__ == "__main__" and sys.argv[1:2] == ["create-admin"] and len(sys.argv) == 4:
    init()
    pw = getpass.getpass("Password (min 8 chars): ")
    if len(pw) < 8:
        sys.exit("Password too short.")
    with connect() as con:
        con.execute("INSERT INTO users (role, email, name, pw_hash) VALUES ('admin', ?, ?, ?)",
                    (sys.argv[2], sys.argv[3], hash_pw(pw)))
    print("Admin created.")
elif __name__ == "__main__":
    sys.exit('usage: python -m app.db create-admin EMAIL "NAME"')
