"""
The employer portal — hires, employment verification and job postings.

Verification is the part that matters: a placement the employer confirms is
worth more than one a trainee self-reports, and the confirm/dispute endpoints
here write straight through to the trainee record.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..analytics import summarise
from ..deps import StoreDep
from ..schemas import JobCreate, VerifyDecision

router = APIRouter(prefix="/api/employers", tags=["employers"])


@router.get("", summary="All employers")
def list_employers(db: StoreDep, sector: str | None = None, district: str | None = None) -> list[dict[str, Any]]:
    rows = db.employers
    if sector:
        rows = [e for e in rows if e["sector"] == sector]
    if district:
        rows = [e for e in rows if e["district"] == district]
    return rows


@router.get("/me", summary="The signed-in employer's own profile")
def get_me(db: StoreDep) -> dict[str, Any]:
    """
    Stands in for the authenticated employer. With real auth this reads the
    subject off the token instead of defaulting to EMP-101.
    """
    return db.employer_user


@router.get("/{employer_id}", summary="One employer")
def get_employer(employer_id: str, db: StoreDep) -> dict[str, Any]:
    employer = db.employer(employer_id)
    if not employer:
        raise HTTPException(status_code=404, detail=f"No employer {employer_id}")
    return employer


@router.get("/{employer_id}/hires", summary="Trainees hired by this employer")
def get_hires(employer_id: str, db: StoreDep, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    if not db.employer(employer_id):
        raise HTTPException(status_code=404, detail=f"No employer {employer_id}")
    hires = [t for t in db.trainees if t["employerId"] == employer_id]
    return {
        "total": len(hires),
        "summary": summarise(hires),
        "rows": [
            {k: v for k, v in t.items() if k not in ("phone", "email")}
            for t in hires[offset : offset + limit]
        ],
    }


@router.get("/{employer_id}/verifications", summary="Verification requests for this employer")
def get_verifications(employer_id: str, db: StoreDep, status: str | None = None) -> list[dict[str, Any]]:
    rows = [v for v in db.verify_requests if v["employerId"] == employer_id]
    if status:
        rows = [v for v in rows if v["status"] == status]
    return rows


@router.post("/verifications/{request_id}", summary="Confirm or dispute an employment record")
def decide_verification(request_id: str, decision: VerifyDecision, db: StoreDep) -> dict[str, Any]:
    """
    Confirming marks the underlying trainee record verified; disputing clears the
    flag so the record drops back to self-reported and re-enters the queue.
    """
    with db.lock:
        request = db.verify_request(request_id)
        if not request:
            raise HTTPException(status_code=404, detail=f"No verification request {request_id}")
        if request["status"] != "pending":
            raise HTTPException(
                status_code=409,
                detail=f"Request {request_id} was already {request['status']}.",
            )

        request["status"] = decision.status
        request["note"] = decision.note
        trainee = db.trainee(request["traineeId"])
        if trainee:
            trainee["verified"] = decision.status == "confirmed"

        employer = db.employer(request["employerId"])
        db.log(
            actor=employer["email"] if employer else "employer",
            action=f"{decision.status.capitalize()} employment verification",
            target=f"{request['traineeId']} — {request['role']}",
        )
        return request


@router.get("/{employer_id}/jobs", summary="Job postings by this employer")
def get_jobs(employer_id: str, db: StoreDep, status: str | None = None) -> list[dict[str, Any]]:
    rows = [j for j in db.job_postings if j["employerId"] == employer_id]
    if status:
        rows = [j for j in rows if j["status"] == status]
    return rows


@router.post("/jobs", status_code=201, summary="Post a job")
def create_job(payload: JobCreate, db: StoreDep) -> dict[str, Any]:
    from datetime import date

    with db.lock:
        if not db.employer(payload.employerId):
            raise HTTPException(status_code=404, detail=f"No employer {payload.employerId}")
        job = {
            "id": db.next_id(db.job_postings, "JOB"),
            **payload.model_dump(),
            "posted": date.today().isoformat(),
            "applicants": 0,
            "status": "open",
        }
        db.job_postings.insert(0, job)
        db.log(actor=payload.employerId, action="Posted a job", target=job["id"])
        return job


@router.get("/{employer_id}/candidates", summary="Certified trainees matching an open role")
def get_candidates(
    employer_id: str, db: StoreDep, job_id: str | None = None, limit: int = 25
) -> list[dict[str, Any]]:
    """
    Match on district and sector, certified trainees only, best score first.

    Deliberately narrow: the point of the portal is to surface people the
    employer can actually hire nearby, not to rank the whole cohort.
    """
    employer = db.employer(employer_id)
    if not employer:
        raise HTTPException(status_code=404, detail=f"No employer {employer_id}")

    district = employer["district"]
    if job_id:
        job = db.job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"No job {job_id}")
        district = job["district"]

    pool = [
        t for t in db.trainees
        if t["certified"] and t["sector"] == employer["sector"]
        and t["district"] == district and t["outcome"] == "notplaced"
    ]
    pool.sort(key=lambda t: (t["score"], t["attendance"]), reverse=True)
    return [
        {k: v for k, v in t.items() if k not in ("phone", "email")}
        for t in pool[:limit]
    ]
