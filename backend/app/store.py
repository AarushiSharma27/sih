"""
store.py -- the in-memory data store, built once at import.

Everything lives in process. Mutations (resolving a flag, answering a
verification request, recording a survey response) are real and visible to
subsequent reads, but they do not survive a restart -- this is the seam where a
real database goes. Each accessor returns the live list so a router can mutate
it; nothing here copies defensively, because the API is single-process and the
alternative is copying a 10,000-row cohort per request.
"""

from __future__ import annotations

import copy
import threading
from typing import Any

from .generator import FEATURED_TRAINEE, build_cohort, recount_hires
from .reference import (
    BATCHES,
    COURSES,
    DISTRICTS,
    EMPLOYERS,
    NON_PLACEMENT_REASONS,
    OUTCOMES,
    PROVIDERS,
)

CAMPAIGNS: list[dict[str, Any]] = [
    {"id": "CMP-311", "name": "6-month outcome check -- 2025-B", "channel": "SMS + WhatsApp", "audience": 1840, "sent": 1840, "responded": 1276, "status": "running",   "started": "2026-09-02"},
    {"id": "CMP-309", "name": "12-month retention -- 2025-A",    "channel": "IVR call",       "audience": 1610, "sent": 1610, "responded": 1042, "status": "running",   "started": "2026-08-21"},
    {"id": "CMP-304", "name": "3-month status -- 2026-A",        "channel": "App push",       "audience": 2210, "sent": 2210, "responded": 1789, "status": "completed", "started": "2026-06-11"},
    {"id": "CMP-298", "name": "24-month livelihood -- 2024-A",   "channel": "Assisted call",  "audience": 1290, "sent": 1290, "responded":  701, "status": "completed", "started": "2026-03-04"},
    {"id": "CMP-294", "name": "Employer verification sweep Q2",  "channel": "Email",          "audience":  412, "sent":  412, "responded":  338, "status": "completed", "started": "2026-04-18"},
]

VALIDATION_QUEUE: list[dict[str, Any]] = [
    {"id": "FLG-8821", "type": "Salary outlier",      "severity": "serious",  "subject": "SKL-MP-2025-04120",           "detail": "Reported monthly wage Rs 96,000 is 4.8x the course median (Rs 19,800).",       "source": "Self-reported (app)",           "raised": "2026-09-15", "status": "open"},
    {"id": "FLG-8817", "type": "Employer mismatch",   "severity": "critical", "subject": "SKL-MP-2025-02887",           "detail": "Trainee reports 'Vindhya Steel Works'; employer record shows no such hire.",   "source": "Cross-check -- employer portal", "raised": "2026-09-15", "status": "open"},
    {"id": "FLG-8814", "type": "Duplicate identity",  "severity": "critical", "subject": "SKL-MP-2024-00913",           "detail": "Two trainee IDs share the same phone + date of birth across providers.",       "source": "Dedup engine",                  "raised": "2026-09-14", "status": "open"},
    {"id": "FLG-8809", "type": "Unreachable contact", "severity": "warning",  "subject": "SKL-MP-2025-03341",           "detail": "Phone disconnected on 3 consecutive follow-up attempts. Alternate contact needed.", "source": "Follow-up engine",           "raised": "2026-09-14", "status": "open"},
    {"id": "FLG-8803", "type": "GSTIN unverified",    "severity": "warning",  "subject": "EMP-105 -- Shivaay Retail Mart", "detail": "Employer GSTIN could not be validated against the GST API.",                "source": "GST API",                       "raised": "2026-09-13", "status": "open"},
    {"id": "FLG-8798", "type": "Attendance anomaly",  "severity": "serious",  "subject": "PRV-06 -- Batch 2026-A",      "detail": "Provider uploaded 100% attendance for an entire batch of 62 trainees.",        "source": "Anomaly detection",             "raised": "2026-09-12", "status": "open"},
    {"id": "FLG-8790", "type": "Certificate date",    "severity": "warning",  "subject": "SKL-MP-2026-07714",           "detail": "Certification date precedes course end date by 19 days.",                      "source": "Rule engine",                   "raised": "2026-09-11", "status": "open"},
]

VERIFY_REQUESTS: list[dict[str, Any]] = [
    {"id": "VR-4471", "trainee": "Anjali Verma",   "traineeId": "SKL-MP-2025-03102", "role": "Junior Data Analyst",     "since": "2026-04-01", "salary": 23500, "raised": "2026-09-16", "status": "pending",   "employerId": "EMP-110"},
    {"id": "VR-4468", "trainee": "Rohit Yadav",    "traineeId": "SKL-MP-2025-02755", "role": "Frontend Developer",      "since": "2026-03-18", "salary": 26000, "raised": "2026-09-16", "status": "pending",   "employerId": "EMP-101"},
    {"id": "VR-4465", "trainee": "Farhan Ansari",  "traineeId": "SKL-MP-2026-08120", "role": "Support Engineer",        "since": "2026-07-05", "salary": 19500, "raised": "2026-09-15", "status": "pending",   "employerId": "EMP-101"},
    {"id": "VR-4460", "trainee": "Kavita Solanki", "traineeId": "SKL-MP-2025-04412", "role": "QA Trainee",              "since": "2026-02-10", "salary": 18000, "raised": "2026-09-12", "status": "confirmed", "employerId": "EMP-101"},
    {"id": "VR-4452", "trainee": "Manish Dubey",   "traineeId": "SKL-MP-2024-01188", "role": "Apprentice -- Networking", "since": "2025-11-01", "salary": 14500, "raised": "2026-09-09", "status": "confirmed", "employerId": "EMP-101"},
    {"id": "VR-4448", "trainee": "Sneha Pandey",   "traineeId": "SKL-MP-2025-03980", "role": "Sales Executive",         "since": "2026-01-20", "salary": 17200, "raised": "2026-09-08", "status": "disputed",  "employerId": "EMP-101"},
]

JOB_POSTINGS: list[dict[str, Any]] = [
    {"id": "JOB-2210", "title": "Junior Frontend Developer", "openings":  8, "skills": ["JavaScript", "React", "Git"],          "district": "Indore", "salary": "Rs 22,000 - Rs 28,000", "posted": "2026-09-10", "applicants": 47, "status": "open",   "employerId": "EMP-101"},
    {"id": "JOB-2207", "title": "Data Analyst Trainee",      "openings":  5, "skills": ["SQL", "Power BI", "Excel"],            "district": "Indore", "salary": "Rs 20,000 - Rs 26,000", "posted": "2026-09-06", "applicants": 62, "status": "open",   "employerId": "EMP-101"},
    {"id": "JOB-2199", "title": "Field Solar Technician",    "openings": 12, "skills": ["Panel install", "Net metering"],       "district": "Ujjain", "salary": "Rs 17,000 - Rs 21,000", "posted": "2026-08-28", "applicants": 31, "status": "open",   "employerId": "EMP-106"},
    {"id": "JOB-2184", "title": "Apprentice -- IT Support",  "openings": 10, "skills": ["Networking", "Hardware", "Ticketing"], "district": "Bhopal", "salary": "Rs 12,000 stipend",     "posted": "2026-08-14", "applicants": 88, "status": "closed", "employerId": "EMP-110"},
]

AUDIT_LOG: list[dict[str, Any]] = [
    {"at": "2026-09-17 09:42", "actor": "r.mehta@mpssdm.gov.in", "action": "Approved provider re-accreditation", "target": "PRV-05 Pragati Training Hub", "ip": "10.24.8.31"},
    {"at": "2026-09-17 09:15", "actor": "system",                "action": "Nightly GST + EPFO cross-check completed (412 records)", "target": "Validation engine", "ip": "--"},
    {"at": "2026-09-16 18:03", "actor": "s.iyer@mpssdm.gov.in",  "action": "Exported district outcome report (CSV)", "target": "Indore, 2025-B", "ip": "10.24.8.77"},
    {"at": "2026-09-16 16:20", "actor": "r.mehta@mpssdm.gov.in", "action": "Merged duplicate trainee records", "target": "SKL-MP-2024-00913", "ip": "10.24.8.31"},
    {"at": "2026-09-16 11:47", "actor": "hr@aaravtech.in",       "action": "Confirmed 4 employment verifications", "target": "EMP-101", "ip": "103.68.22.14"},
    {"at": "2026-09-15 15:31", "actor": "system",                "action": "Launched follow-up campaign CMP-311", "target": "1,840 trainees", "ip": "--"},
    {"at": "2026-09-15 10:05", "actor": "a.khan@mpssdm.gov.in",  "action": "Revoked portal access (role change)", "target": "PRV-06 co-ordinator", "ip": "10.24.9.12"},
]

ADMIN_USER: dict[str, Any] = {
    "name": "Rohan Mehta", "initials": "RM",
    "role": "State Programme Administrator",
    "dept": "MP State Skill Development Mission",
    "id": "ADM-0042", "email": "r.mehta@mpssdm.gov.in", "phone": "+91 98260 44120",
    "jurisdiction": "All districts -- Madhya Pradesh",
    "since": "2024-02-11", "lastLogin": "2026-09-17 09:12 IST", "mfa": True,
    "permissions": [
        {"name": "View aggregate analytics",     "granted": True},
        {"name": "View trainee PII (consented)", "granted": True},
        {"name": "Approve / suspend providers",  "granted": True},
        {"name": "Resolve validation flags",     "granted": True},
        {"name": "Launch follow-up campaigns",   "granted": True},
        {"name": "Export raw microdata",         "granted": False},
        {"name": "Manage admin accounts",        "granted": True},
        {"name": "Edit consent records",         "granted": False},
    ],
}


class Store:
    """
    Single in-process store. Reads are lock-free; writes take `lock` so a burst
    of concurrent confirmations cannot interleave mid-update.
    """

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.trainees: list[dict[str, Any]] = build_cohort()
        self.by_id: dict[str, dict[str, Any]] = {t["id"]: t for t in self.trainees}

        self.districts = copy.deepcopy(DISTRICTS)
        self.courses = copy.deepcopy(COURSES)
        self.providers = copy.deepcopy(PROVIDERS)
        self.batches = copy.deepcopy(BATCHES)
        self.employers = copy.deepcopy(EMPLOYERS)
        self.reasons = copy.deepcopy(NON_PLACEMENT_REASONS)
        self.outcomes = copy.deepcopy(OUTCOMES)

        self.campaigns = copy.deepcopy(CAMPAIGNS)
        self.validation_queue = copy.deepcopy(VALIDATION_QUEUE)
        self.verify_requests = copy.deepcopy(VERIFY_REQUESTS)
        self.job_postings = copy.deepcopy(JOB_POSTINGS)
        self.audit_log = copy.deepcopy(AUDIT_LOG)

        self.admin_user = copy.deepcopy(ADMIN_USER)
        self.featured_trainee = copy.deepcopy(FEATURED_TRAINEE)
        self.employer_user = {
            **copy.deepcopy(self.employers[0]),
            "initials": "AT",
            "onboarded": "2024-06-02",
            "contactRole": "Head of Talent Acquisition",
            "address": "Plot 44, Electronic Complex, Pardeshipura, Indore 452010",
            "website": "aaravtech.in",
            "apiKey": "sk_emp_live_9f2a********3c71",
        }

        recount_hires(self.trainees, self.employers)

    # ---------- lookups ----------

    def trainee(self, trainee_id: str) -> dict[str, Any] | None:
        return self.by_id.get(trainee_id)

    def employer(self, employer_id: str) -> dict[str, Any] | None:
        return next((e for e in self.employers if e["id"] == employer_id), None)

    def provider(self, provider_id: str) -> dict[str, Any] | None:
        return next((p for p in self.providers if p["id"] == provider_id), None)

    def flag(self, flag_id: str) -> dict[str, Any] | None:
        return next((f for f in self.validation_queue if f["id"] == flag_id), None)

    def verify_request(self, request_id: str) -> dict[str, Any] | None:
        return next((v for v in self.verify_requests if v["id"] == request_id), None)

    def job(self, job_id: str) -> dict[str, Any] | None:
        return next((j for j in self.job_postings if j["id"] == job_id), None)

    def campaign(self, campaign_id: str) -> dict[str, Any] | None:
        return next((c for c in self.campaigns if c["id"] == campaign_id), None)

    # ---------- writes ----------

    def log(self, actor: str, action: str, target: str, ip: str = "--") -> dict[str, Any]:
        """Prepend an audit entry. The log is newest-first, as the admin page reads it."""
        from datetime import datetime, timezone

        entry = {
            "at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
            "actor": actor, "action": action, "target": target, "ip": ip,
        }
        self.audit_log.insert(0, entry)
        return entry

    def next_id(self, collection: list[dict[str, Any]], prefix: str) -> str:
        """Next sequential id for a collection whose ids look like PREFIX-1234."""
        nums = [
            int(item["id"].rsplit("-", 1)[-1])
            for item in collection
            if item["id"].rsplit("-", 1)[-1].isdigit()
        ]
        return f"{prefix}-{(max(nums) + 1) if nums else 1}"


store = Store()
