"""
The administrator console — data quality, follow-up campaigns and the audit log.

The validation queue is the operational heart of it: outcome data that nobody
checks is worth very little, so flags raised by the rule engine are resolved
here and every resolution is logged.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..analytics import filter_trainees, summarise
from ..deps import StoreDep
from ..schemas import CampaignCreate, FlagResolution

router = APIRouter(prefix="/api/admin", tags=["admin"])

SEVERITY_ORDER = {"critical": 0, "serious": 1, "warning": 2}


@router.get("/me", summary="The signed-in administrator")
def get_me(db: StoreDep) -> dict[str, Any]:
    return db.admin_user


@router.get("/validation-queue", summary="Open data-quality flags")
def get_queue(
    db: StoreDep,
    status: str | None = Query(default="open", description='"open", "resolved", "dismissed", or omit for all'),
    severity: str | None = None,
) -> list[dict[str, Any]]:
    """Critical first — the queue is worked top-down."""
    rows = db.validation_queue
    if status:
        rows = [f for f in rows if f["status"] == status]
    if severity:
        rows = [f for f in rows if f["severity"] == severity]
    return sorted(rows, key=lambda f: (SEVERITY_ORDER.get(f["severity"], 9), f["raised"]))


@router.post("/validation-queue/{flag_id}", summary="Resolve or dismiss a flag")
def resolve_flag(flag_id: str, resolution: FlagResolution, db: StoreDep) -> dict[str, Any]:
    with db.lock:
        flag = db.flag(flag_id)
        if not flag:
            raise HTTPException(status_code=404, detail=f"No flag {flag_id}")
        if flag["status"] != "open":
            raise HTTPException(
                status_code=409, detail=f"Flag {flag_id} is already {flag['status']}."
            )

        flag["status"] = resolution.status
        flag["note"] = resolution.note
        flag["resolvedBy"] = resolution.actor
        flag["resolvedAt"] = date.today().isoformat()
        db.log(
            actor=resolution.actor,
            action=f"{resolution.status.capitalize()} data-quality flag ({flag['type']})",
            target=flag["subject"],
        )
        return flag


@router.get("/data-quality", summary="Data-quality scorecard")
def get_data_quality(db: StoreDep) -> dict[str, Any]:
    """
    The four numbers that decide whether the analytics can be trusted: how many
    records carry consent, reachable contact details, employer verification, and
    a follow-up response.
    """
    rows = db.trainees
    n = len(rows) or 1
    placed = [t for t in rows if t["outcome"] != "notplaced"]
    summary = summarise(rows)
    open_flags = [f for f in db.validation_queue if f["status"] == "open"]

    return {
        "cohortSize": len(rows),
        "consentRate": summary["consentRate"],
        "contactValidRate": sum(1 for t in rows if t["contactValid"]) / n * 100,
        "verifiedRate": (
            sum(1 for t in placed if t["verified"]) / len(placed) * 100 if placed else 0
        ),
        "responseRate": summary["responseRate"],
        "openFlags": len(open_flags),
        "flagsBySeverity": {
            sev: sum(1 for f in open_flags if f["severity"] == sev)
            for sev in ("critical", "serious", "warning")
        },
    }


@router.get("/campaigns", summary="Follow-up campaigns")
def get_campaigns(db: StoreDep, status: str | None = None) -> list[dict[str, Any]]:
    rows = db.campaigns
    if status:
        rows = [c for c in rows if c["status"] == status]
    return rows


@router.post("/campaigns", status_code=201, summary="Launch a follow-up campaign")
def create_campaign(payload: CampaignCreate, db: StoreDep) -> dict[str, Any]:
    """
    The audience is computed from the live cohort, not supplied by the caller —
    a campaign whose stated reach does not match who actually gets contacted is
    how response-rate reporting goes wrong.
    """
    with db.lock:
        audience = filter_trainees(
            db.trainees, {"batch": payload.batch, "district": payload.district}
        )
        # Only people who consented to tracking and are due this wave.
        targets = [
            t for t in audience
            if t["consent"] and t["follow"].get(payload.wave) != "scheduled"
        ]
        campaign = {
            "id": db.next_id(db.campaigns, "CMP"),
            "name": payload.name,
            "channel": payload.channel,
            "wave": payload.wave,
            "audience": len(targets),
            "sent": len(targets),
            "responded": 0,
            "status": "running",
            "started": date.today().isoformat(),
        }
        db.campaigns.insert(0, campaign)
        db.log(
            actor=db.admin_user["email"],
            action=f"Launched follow-up campaign {campaign['id']}",
            target=f"{len(targets):,} trainees",
        )
        return campaign


@router.get("/audit-log", summary="Audit trail, newest first")
def get_audit_log(db: StoreDep, limit: int = Query(default=50, ge=1, le=500)) -> list[dict[str, Any]]:
    return db.audit_log[:limit]


@router.get("/consent", summary="Consent coverage by district")
def get_consent(db: StoreDep) -> list[dict[str, Any]]:
    """Consent is the legal basis for the whole tracking programme — report it per district."""
    out = []
    for d in db.districts:
        rows = [t for t in db.trainees if t["district"] == d["name"]]
        if not rows:
            continue
        granted = sum(1 for t in rows if t["consent"])
        out.append({
            "district": d["name"],
            "total": len(rows),
            "granted": granted,
            "withheld": len(rows) - granted,
            "consentRate": granted / len(rows) * 100,
        })
    out.sort(key=lambda r: r["consentRate"])
    return out
