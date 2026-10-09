"""
deps.py -- shared FastAPI dependencies.

The filter set is identical on every analytics endpoint, so it is declared once
here and injected. Declaring it as a dependency rather than repeating the six
query parameters keeps the generated OpenAPI docs consistent too.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Query

from .analytics import filter_trainees
from .store import Store, store


def get_store() -> Store:
    return store


StoreDep = Annotated[Store, Depends(get_store)]


def filter_params(
    course: Annotated[str | None, Query(description='Course name, or "all"')] = None,
    district: Annotated[str | None, Query(description='District name, or "all"')] = None,
    batch: Annotated[str | None, Query(description='Batch id, e.g. "2025-A"')] = None,
    provider: Annotated[str | None, Query(description="Training provider name")] = None,
    outcome: Annotated[str | None, Query(description="employed | self | apprentice | notplaced")] = None,
    gender: Annotated[str | None, Query(description="F | M | O")] = None,
    q: Annotated[str | None, Query(description="Free text over name, id, district, course")] = None,
) -> dict[str, Any]:
    return {
        "course": course, "district": district, "batch": batch,
        "provider": provider, "outcome": outcome, "gender": gender, "q": q,
    }


FilterDep = Annotated[dict[str, Any], Depends(filter_params)]


def get_filtered(filters: FilterDep, db: StoreDep) -> list[dict[str, Any]]:
    """The filtered cohort — what every analytics endpoint actually aggregates."""
    return filter_trainees(db.trainees, filters)


FilteredDep = Annotated[list[dict[str, Any]], Depends(get_filtered)]
