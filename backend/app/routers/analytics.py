"""
Aggregate analytics — the numbers behind every KPI tile and chart.

Every endpoint here takes the same filter set, so a dashboard can pass one
filter state to all of them and get a mutually consistent picture.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from ..analytics import (
    breakdown,
    follow_up_waves,
    reason_breakdown,
    summarise,
    wage_progression,
)
from ..deps import FilteredDep, StoreDep
from ..schemas import FollowWave, ReasonCount, Summary, WagePoint

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Dimensions a breakdown can group on, mapped to the trainee field.
DIMENSIONS = {
    "district": "district",
    "course": "course",
    "provider": "provider",
    "batch": "batch",
    "sector": "sector",
    "gender": "gender",
    "outcome": "outcome",
}


@router.get("/summary", response_model=Summary, summary="Headline KPIs")
def get_summary(rows: FilteredDep) -> dict[str, Any]:
    """Placement, wage, retention, relevance, certification and response rates."""
    return summarise(rows)


@router.get("/breakdown/{dimension}", summary="KPIs grouped by a dimension")
def get_breakdown(
    dimension: str,
    rows: FilteredDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[dict[str, Any]]:
    """Largest group first. Use this for the district, course and provider tables."""
    field = DIMENSIONS.get(dimension)
    if not field:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown dimension {dimension!r}. Try one of: {', '.join(DIMENSIONS)}",
        )
    return breakdown(rows, field)[:limit]


@router.get("/follow-ups", response_model=list[FollowWave], summary="Follow-up response funnel")
def get_follow_ups(rows: FilteredDep) -> list[dict[str, Any]]:
    """
    Response status at each wave. `due` excludes trainees whose batch has not yet
    reached that wave, so the response rate is not diluted by the not-yet-asked.
    """
    return follow_up_waves(rows)


@router.get("/wage-progression", response_model=list[WagePoint], summary="Average wage over time")
def get_wage_progression(rows: FilteredDep) -> list[dict[str, Any]]:
    return wage_progression(rows)


@router.get("/non-placement", response_model=list[ReasonCount], summary="Why trainees were not placed")
def get_non_placement(rows: FilteredDep) -> list[dict[str, Any]]:
    return reason_breakdown(rows)


@router.get("/map", summary="District outcomes with coordinates")
def get_map(rows: FilteredDep, db: StoreDep) -> list[dict[str, Any]]:
    """
    District breakdown joined to lat/lon so the map layer needs a single call.
    Districts with no matching trainees are omitted rather than drawn at zero.
    """
    coords = {d["name"]: d for d in db.districts}
    out = []
    for row in breakdown(rows, "district"):
        d = coords.get(row["key"])
        if not d:
            continue
        out.append({**row, "lat": d["lat"], "lon": d["lon"], "demand": d["demand"]})
    return out


@router.get("/provider-performance", summary="Provider league table")
def get_provider_performance(rows: FilteredDep, db: StoreDep) -> list[dict[str, Any]]:
    """
    Placement outcomes per provider, joined to accreditation and rating — the
    view the admin page uses to decide who gets re-accredited.
    """
    meta = {p["name"]: p for p in db.providers}
    out = []
    for row in breakdown(rows, "provider"):
        p = meta.get(row["key"], {})
        out.append({
            **row,
            "providerId": p.get("id"),
            "accredited": p.get("accredited"),
            "rating": p.get("rating"),
            "centres": p.get("centres"),
            "city": p.get("city"),
        })
    out.sort(key=lambda r: r["placementRate"], reverse=True)
    return out


@router.get("/roi", summary="Cost per placement, by course")
def get_roi(rows: FilteredDep, db: StoreDep) -> list[dict[str, Any]]:
    """
    Programme spend against placements and first-year wages.

    Cost is course fee times everyone trained — the unplaced cost money too, and
    a cost-per-placement that ignores them flatters the weakest courses most.
    """
    fees = {c["name"]: c for c in db.courses}
    out = []
    for row in breakdown(rows, "course"):
        course = fees.get(row["key"])
        if not course:
            continue
        placed = row["total"] - row["counts"]["notplaced"]
        spend = course["fee"] * row["total"]
        annual_wages = row["avgStartingSalary"] * 12 * placed
        out.append({
            "course": row["key"],
            "sector": course["sector"],
            "trained": row["total"],
            "placed": placed,
            "fee": course["fee"],
            "spend": spend,
            "costPerPlacement": (spend / placed) if placed else None,
            "avgStartingSalary": row["avgStartingSalary"],
            "firstYearWages": annual_wages,
            "wageToCostRatio": (annual_wages / spend) if spend else None,
            "placementRate": row["placementRate"],
        })
    out.sort(key=lambda r: r["costPerPlacement"] if r["costPerPlacement"] is not None else float("inf"))
    return out


@router.get("/equity", summary="Outcome gaps by gender and district")
def get_equity(rows: FilteredDep) -> dict[str, Any]:
    """
    The gaps the programme is measured on. `gap` is in percentage points, always
    computed against the best-performing group rather than the average, so a
    uniformly poor cohort does not read as equitable.
    """
    def gaps(dimension: str) -> dict[str, Any]:
        groups = breakdown(rows, dimension)
        if not groups:
            return {"groups": [], "gap": 0.0}
        best = max(g["placementRate"] for g in groups)
        return {
            "groups": [
                {
                    "key": g["key"],
                    "total": g["total"],
                    "placementRate": g["placementRate"],
                    "avgStartingSalary": g["avgStartingSalary"],
                    "gap": best - g["placementRate"],
                }
                for g in groups
            ],
            "gap": best - min(g["placementRate"] for g in groups),
        }

    return {"gender": gaps("gender"), "district": gaps("district")}
