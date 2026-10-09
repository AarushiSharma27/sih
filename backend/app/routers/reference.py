"""Reference data — the lookup lists the UI builds its filter controls from."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..analytics import skill_gap_rows
from ..deps import StoreDep
from ..schemas import Filters, SkillGap

router = APIRouter(prefix="/api", tags=["reference"])


@router.get("/filters", response_model=Filters, summary="Everything the filter bar needs")
def get_filters(db: StoreDep) -> dict[str, Any]:
    """
    One call instead of five. The UI populates every select from this, so the
    option lists cannot drift apart from the data the cohort was built with.
    """
    return {
        "courses": db.courses,
        "districts": db.districts,
        "providers": db.providers,
        "batches": db.batches,
        "outcomes": db.outcomes,
        "genders": [
            {"value": "F", "label": "Female"},
            {"value": "M", "label": "Male"},
            {"value": "O", "label": "Other"},
        ],
    }


@router.get("/districts", summary="Districts with coordinates and demand index")
def get_districts(db: StoreDep) -> list[dict[str, Any]]:
    return db.districts


@router.get("/courses", summary="Course catalogue")
def get_courses(db: StoreDep) -> list[dict[str, Any]]:
    return db.courses


@router.get("/providers", summary="Training providers")
def get_providers(db: StoreDep) -> list[dict[str, Any]]:
    return db.providers


@router.get("/providers/{provider_id}", summary="One provider")
def get_provider(provider_id: str, db: StoreDep) -> dict[str, Any]:
    provider = db.provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail=f"No provider {provider_id}")
    return provider


@router.get("/batches", summary="Training batches")
def get_batches(db: StoreDep) -> list[dict[str, Any]]:
    return db.batches


@router.get("/outcomes", summary="Outcome categories and their display colours")
def get_outcomes(db: StoreDep) -> dict[str, dict[str, str]]:
    return db.outcomes


@router.get("/non-placement-reasons", summary="Reason codes for non-placement")
def get_reasons(db: StoreDep) -> list[dict[str, Any]]:
    return db.reasons


@router.get("/skill-gaps", response_model=list[SkillGap], summary="Curriculum vs industry demand")
def get_skill_gaps() -> list[dict[str, Any]]:
    """Worst-covered course first — this ordering is what the admin page renders."""
    return skill_gap_rows()
