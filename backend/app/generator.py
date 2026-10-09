"""
generator.py -- rebuilds the cohort that assets/js/data.js builds in the browser.

The port is deliberately literal. Every `rand()` in the JS happens here in the
same order, including the ones hidden inside conditional expressions, because a
single extra or missing draw desynchronises the stream and every record after it
diverges. `tests/test_parity.py` pins this against the real JS output.

Where the JS relies on a language quirk the Python differs on, the quirk is
reproduced explicitly and commented rather than "cleaned up".
"""

from __future__ import annotations

import math
from typing import Any

from .reference import (
    BATCHES,
    COHORT_SIZE,
    COURSES,
    DISTRICTS,
    EMPLOYERS,
    FIRST_F,
    FIRST_M,
    FOLLOW_DUE_MONTHS,
    FOLLOW_WAVES,
    LAST,
    NON_PLACEMENT_REASONS,
    PROVIDERS,
    SEED,
)
from .rng import Draw, Mulberry32, js_round, weighted_index

# Response decays with every wave -- people change numbers and move away.
_RESP = [82, 71, 58, 44]
_ASSIST = [10, 14, 17, 19]
_LOST = [8, 15, 25, 37]


def _make_trainee(d: Draw, i: int) -> dict[str, Any]:
    gender = d.pick_w([("F", 44), ("M", 55), ("O", 1)])
    first = d.pick(FIRST_F) if gender == "F" else d.pick(FIRST_M)
    name = first + " " + d.pick(LAST)

    dist = DISTRICTS[d.pick_w(weighted_index(x["weight"] for x in DISTRICTS))]
    district = dist["name"]
    course = COURSES[d.pick_w(weighted_index(x["weight"] for x in COURSES))]
    provider = PROVIDERS[d.pick_w(weighted_index(10 - i for i in range(len(PROVIDERS))))]
    batch = BATCHES[d.pick_w(weighted_index([14, 18, 22, 24, 22]))]

    attendance = min(100, js_round(d.int(66, 99) * (0.95 + provider["quality"] * 0.05)))
    score = min(99, js_round(d.int(42, 96) * (0.92 + provider["quality"] * 0.08)))
    certified = attendance >= 70 and score >= 45

    # One quality index drives the outcome mix: provider x course x attendance x
    # certification. q ~ 1 reproduces the programme-wide target mix; a weak
    # provider or an uncertified trainee drops well below it.
    q = (
        0.995
        * provider["quality"]
        * course["quality"]
        * dist["demand"]
        * (0.955 if gender == "F" else 1)  # the real placement gap, not a data artefact
        * (0.90 + attendance / 800)
        * (1.02 if certified else 0.80)
    )
    outcome = d.pick_w([
        ("employed",   70 * math.pow(q, 1.6)),
        ("self",       12 * (2 - q)),
        ("apprentice",  8 * q),
        ("notplaced",  10 * math.pow(max(0.2, 2 - q), 4)),
    ])

    placed = outcome != "notplaced"
    # The JS draws this unconditionally, even for unplaced trainees -- keep it.
    base = (
        course["wage"]
        * (0.84 + d.rand() * 0.52)
        * (0.62 if outcome == "apprentice" else 0.92 if outcome == "self" else 1)
    )
    starting = js_round(base / 100) * 100 if placed else 0

    # Wage progression grows with months since placement.
    months = batch["ageMonths"]
    growth = 1 + (months / 12) * (0.06 + d.rand() * 0.10) if placed else 1
    current = js_round((starting * growth) / 100) * 100 if placed else 0

    retained12m = (
        d.rand() < (0.74 * (0.85 + provider["quality"] * 0.15))
        if placed and months >= 12
        else None
    )
    relevance = (
        d.pick_w([(5, 48), (4, 32), (3, 14), (2, 4), (1, 2)])
        if placed
        else d.pick_w([(5, 10), (4, 20), (3, 32), (2, 24), (1, 14)])
    )

    employer = None
    if outcome in ("employed", "apprentice"):
        pool = [e for e in EMPLOYERS if e["sector"] == course["sector"]]
        employer = pool[math.floor(d.rand() * len(pool))] if pool else d.pick(EMPLOYERS)

    consent = d.rand() < 0.968
    contact_valid = d.rand() < 0.89

    # A trainee whose contact details already failed is far harder to reach.
    follow: dict[str, str] = {}
    for idx, wave in enumerate(FOLLOW_WAVES):
        if months < FOLLOW_DUE_MONTHS[idx]:
            follow[wave] = "scheduled"
            continue
        penalty = 1 if contact_valid else 0.28
        follow[wave] = d.pick_w([
            ("responded",   _RESP[idx] * penalty),
            ("assisted",    _ASSIST[idx]),
            ("no-response", _LOST[idx] * (1 if contact_valid else 3.4)),
        ])

    # These draws sit inside the JS object literal, so they come last and in
    # property order: age, then the three phone segments, then email.
    age = d.int(18, 34)
    phone = f"+91 {d.int(70, 99)}0{d.int(10, 99)} {d.int(10000, 99999)}"
    email = f"{first.lower()}{d.int(10, 99)}@example.in"
    reason = (
        d.pick_w([(r["code"], r["weight"]) for r in NON_PLACEMENT_REASONS])
        if outcome == "notplaced"
        else None
    )
    verified = (d.rand() < 0.81) if placed else None

    return {
        "id": "SKL-MP-" + batch["id"][:4] + "-" + str(100000 + i)[1:],
        "name": name,
        "gender": gender,
        "age": age,
        "phone": phone,
        "email": email,
        "district": district,
        "course": course["name"],
        "courseCode": course["code"],
        "sector": course["sector"],
        "provider": provider["name"],
        "providerId": provider["id"],
        "batch": batch["id"],
        "enrolled": batch["start"],
        "attendance": attendance,
        "score": score,
        "certified": certified,
        "outcome": outcome,
        "employer": employer["name"] if employer else None,
        "employerId": employer["id"] if employer else None,
        "startingSalary": starting,
        "currentSalary": current,
        "retained12m": retained12m,
        "relevance": relevance,
        "reason": reason,
        "monthsSince": months,
        "follow": follow,
        "consent": consent,
        "contactValid": contact_valid,
        "verified": verified,
    }


# The featured trainee, spliced into the cohort so the registry, the employer's
# hire list and the district totals all agree with the trainee profile page.
FEATURED_TRAINEE: dict[str, Any] = {
    "id": "SKL-MP-2025-03102",
    "initials": "AV",
    "name": "Anjali Verma",
    "gender": "F",
    "age": 23,
    "phone": "+91 94250 31182",
    "altPhone": "+91 78690 22014",
    "email": "anjali.verma@example.in",
    "district": "Indore",
    "address": "Scheme 78, Vijay Nagar, Indore 452010",
    "aadhaarMasked": "XXXX XXXX 4417",
    "course": "Data Analytics",
    "courseCode": "DAT",
    "provider": "Skill Sagar Institute",
    "providerId": "PRV-01",
    "batch": "2025-A",
    "enrolled": "2025-01-20",
    "completed": "2025-07-18",
    "attendance": 92,
    "score": 84,
    "certified": True,
    "certId": "CERT-DAT-2025-11840",
    "certDate": "2025-07-25",
    "outcome": "employed",
    "employer": "DataBridge Analytics",
    "employerId": "EMP-110",
    "role": "Junior Data Analyst",
    "employedSince": "2026-04-01",
    "startingSalary": 21000,
    "currentSalary": 23500,
    "relevance": 4,
    "verified": True,
    "consent": True,
    "skills": [
        {"name": "Excel", "level": 90},
        {"name": "Python", "level": 78},
        {"name": "SQL", "level": 72},
        {"name": "Statistics", "level": 68},
        {"name": "Power BI", "level": 45},
        {"name": "Cloud", "level": 22},
    ],
    "wageHistory": [
        {"label": "At placement", "month": "Apr 2026", "amount": 21000},
        {"label": "3-month",      "month": "Jul 2026", "amount": 21000},
        {"label": "6-month",      "month": "Oct 2026", "amount": 23500},
        {"label": "Projected 12m", "month": "Apr 2027", "amount": 26000, "projected": True},
    ],
    "journey": [
        {"stage": "Registration & consent", "date": "2025-01-12", "status": "done",     "note": "Unique ID SKL-MP-2025-03102 issued. Consent granted for outcome tracking (24 months)."},
        {"stage": "Enrolment",              "date": "2025-01-20", "status": "done",     "note": "Data Analytics (6 months) at Skill Sagar Institute, Indore centre."},
        {"stage": "Attendance",             "date": "2025-07-18", "status": "done",     "note": "92% attendance across 148 session days."},
        {"stage": "Assessment",             "date": "2025-07-20", "status": "done",     "note": "Final assessment score 84/100 -- Grade A."},
        {"stage": "Certification",          "date": "2025-07-25", "status": "done",     "note": "NSQF Level 4 certificate CERT-DAT-2025-11840 issued."},
        {"stage": "Placement linkage",      "date": "2026-04-01", "status": "done",     "note": "Joined DataBridge Analytics as Junior Data Analyst. Verified by employer on 2026-04-09."},
        {"stage": "6-month follow-up",      "date": "2026-10-01", "status": "active",   "note": "Outcome survey open -- 2 questions pending your response."},
        {"stage": "12-month follow-up",     "date": "2027-04-01", "status": "upcoming", "note": "Retention and wage progression check."},
        {"stage": "24-month follow-up",     "date": "2028-04-01", "status": "upcoming", "note": "Long-term livelihood outcome check."},
    ],
    "pendingSurvey": [
        {"q": "Are you still working at DataBridge Analytics?", "type": "yesno"},
        {"q": "What is your current monthly take-home salary?", "type": "amount"},
        {"q": "How relevant was your training to this job?",    "type": "scale"},
    ],
    "notifications": [
        {"at": "2026-09-16", "text": "Your 6-month outcome survey is open. Responding keeps your record verified.", "kind": "warning"},
        {"at": "2026-09-02", "text": "DataBridge Analytics confirmed your employment record.", "kind": "good"},
        {"at": "2026-08-19", "text": "New course recommended: Power BI Specialist (fills 2 of your skill gaps).", "kind": "info"},
    ],
}

# Index 3102 is where the JS splices the featured profile in.
FEATURED_INDEX = 3102


def _splice_featured(trainees: list[dict[str, Any]]) -> None:
    t = FEATURED_TRAINEE
    trainees[FEATURED_INDEX].update({
        "id": t["id"], "name": t["name"], "gender": "F", "age": t["age"],
        "phone": t["phone"], "email": t["email"], "district": t["district"],
        "course": t["course"], "courseCode": t["courseCode"], "sector": "IT-ITeS",
        "provider": t["provider"], "providerId": t["providerId"],
        "batch": t["batch"], "enrolled": t["enrolled"],
        "attendance": t["attendance"], "score": t["score"], "certified": True,
        "outcome": "employed", "employer": t["employer"], "employerId": t["employerId"],
        "startingSalary": t["startingSalary"], "currentSalary": t["currentSalary"],
        "retained12m": None, "relevance": t["relevance"], "reason": None,
        "monthsSince": 20,
        "follow": {"3m": "responded", "6m": "no-response", "12m": "scheduled", "24m": "scheduled"},
        "consent": True, "contactValid": True, "verified": True,
    })


def recount_hires(trainees: list[dict[str, Any]], employers: list[dict[str, Any]]) -> None:
    """Employer hire counts are derived, never stored -- recompute after any change."""
    counts: dict[str, int] = {}
    for t in trainees:
        if t["employerId"]:
            counts[t["employerId"]] = counts.get(t["employerId"], 0) + 1
    for e in employers:
        e["hires"] = counts.get(e["id"], 0)


def build_cohort(size: int = COHORT_SIZE, seed: int = SEED) -> list[dict[str, Any]]:
    """Generate the full cohort, featured profile spliced in."""
    draw = Draw(Mulberry32(seed))
    trainees = [_make_trainee(draw, i) for i in range(size)]
    if size > FEATURED_INDEX:
        _splice_featured(trainees)
    return trainees
