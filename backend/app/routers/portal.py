"""
The trainee's own portal — their record, their journey, their survey.

This is the only place a trainee writes to their own outcome data, and it is
what keeps the longitudinal picture alive: every wave answered here is a record
that does not decay into "no-response".
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..analytics import skill_gap_rows
from ..deps import StoreDep
from ..schemas import SurveyAnswer

router = APIRouter(prefix="/api/portal", tags=["trainee portal"])


@router.get("/me", summary="The signed-in trainee's full profile")
def get_me(db: StoreDep) -> dict[str, Any]:
    """
    The featured profile, with skills, wage history, journey and pending survey.
    With real auth this resolves the trainee from the token.
    """
    return db.featured_trainee


@router.get("/me/recommendations", summary="Courses that would close this trainee's skill gaps")
def get_recommendations(db: StoreDep) -> list[dict[str, Any]]:
    """
    Compares what the trainee has against what industry asks for in their course,
    then ranks other courses by how many of the missing skills they teach.
    """
    me = db.featured_trainee
    held = {s["name"] for s in me.get("skills", []) if s["level"] >= 50}
    gaps = skill_gap_rows()

    mine = next((g for g in gaps if g["course"] == me["course"]), None)
    missing = [k for k in (mine["industry"] if mine else []) if k not in held]

    out = []
    for g in gaps:
        if g["course"] == me["course"]:
            continue
        closes = [k for k in g["taught"] if k in missing]
        if closes:
            out.append({
                "course": g["course"],
                "demandIndex": g["demandIndex"],
                "closesGaps": closes,
                "gapsClosed": len(closes),
            })
    out.sort(key=lambda r: (r["gapsClosed"], r["demandIndex"]), reverse=True)
    return out


@router.get("/{trainee_id}", summary="A trainee's own record")
def get_trainee(trainee_id: str, db: StoreDep) -> dict[str, Any]:
    if trainee_id == db.featured_trainee["id"]:
        return db.featured_trainee
    trainee = db.trainee(trainee_id)
    if not trainee:
        raise HTTPException(status_code=404, detail=f"No trainee {trainee_id}")
    return trainee


@router.post("/{trainee_id}/survey", summary="Answer a follow-up survey wave")
def submit_survey(trainee_id: str, answer: SurveyAnswer, db: StoreDep) -> dict[str, Any]:
    """
    Records the response and updates the outcome it reports on.

    A wave that is not yet due is rejected rather than silently accepted — an
    early answer would land in the wrong wave and distort the funnel.
    """
    with db.lock:
        trainee = db.trainee(trainee_id)
        if not trainee:
            raise HTTPException(status_code=404, detail=f"No trainee {trainee_id}")
        if not trainee["consent"]:
            raise HTTPException(
                status_code=403, detail="This trainee has not consented to outcome tracking."
            )

        current = trainee["follow"].get(answer.wave)
        if current == "scheduled":
            raise HTTPException(
                status_code=409,
                detail=f"The {answer.wave} wave is not due yet for this trainee.",
            )

        trainee["follow"][answer.wave] = "assisted" if answer.assisted else "responded"

        if answer.currentSalary is not None and trainee["startingSalary"] > 0:
            trainee["currentSalary"] = answer.currentSalary
        if answer.relevance is not None:
            trainee["relevance"] = answer.relevance
        if answer.stillEmployed is not None and answer.wave in ("12m", "24m"):
            trainee["retained12m"] = answer.stillEmployed

        db.log(
            actor=trainee_id,
            action=f"Submitted {answer.wave} follow-up response",
            target=trainee["district"],
        )
        return {
            "trainee": trainee_id,
            "wave": answer.wave,
            "status": trainee["follow"][answer.wave],
            "record": trainee,
        }
