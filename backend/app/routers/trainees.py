"""The trainee registry — filtered, sorted, paged."""

from __future__ import annotations

import csv
import io
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..deps import FilteredDep, StoreDep
from ..schemas import Trainee, TraineePage

router = APIRouter(prefix="/api/trainees", tags=["trainees"])

SORTABLE = {
    "name", "id", "district", "course", "provider", "batch", "outcome",
    "attendance", "score", "startingSalary", "currentSalary", "relevance", "age",
}

# Columns that identify a person. Withheld unless the caller explicitly asks for
# them, so a casual registry fetch does not spray PII across the network.
PII_FIELDS = ("phone", "email")


def _strip_pii(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Null the identifying columns rather than dropping the keys, so the response
    shape does not change with `includePii` and a client can bind to it once.
    """
    return [{**t, **{k: None for k in PII_FIELDS}} for t in rows]


@router.get("", response_model=TraineePage, summary="Filtered trainee registry")
def list_trainees(
    rows: FilteredDep,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort: Annotated[str, Query(description=f"One of: {', '.join(sorted(SORTABLE))}")] = "id",
    order: Annotated[str, Query(pattern="^(asc|desc)$")] = "asc",
    includePii: Annotated[bool, Query(description="Include phone and email")] = False,
) -> dict[str, Any]:
    """
    `total` is the size of the whole filtered set, not of `rows` — the UI needs
    it to render "showing 50 of 4,182" without a second count request.
    """
    if sort not in SORTABLE:
        raise HTTPException(status_code=400, detail=f"Cannot sort by {sort!r}")

    ordered = sorted(rows, key=lambda t: t[sort], reverse=(order == "desc"))
    page = ordered[offset : offset + limit]
    return {
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "rows": page if includePii else _strip_pii(page),
    }


@router.get("/export.csv", summary="Export the filtered registry as CSV")
def export_csv(rows: FilteredDep, includePii: bool = False) -> StreamingResponse:
    """
    Streams rather than building the file in memory — an unfiltered export is
    10,000 rows, and the admin page offers exactly that button.
    """
    cleaned = rows if includePii else _strip_pii(rows)
    columns = [c for c in cleaned[0].keys() if c != "follow"] if cleaned else []

    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columns + ["follow3m", "follow6m", "follow12m", "follow24m"])
        yield buffer.getvalue()
        for t in cleaned:
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow(
                [t[c] for c in columns] + [t["follow"][w] for w in ("3m", "6m", "12m", "24m")]
            )
            yield buffer.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="trainees.csv"'},
    )


@router.get("/{trainee_id}", response_model=Trainee, summary="One trainee")
def get_trainee(trainee_id: str, db: StoreDep) -> dict[str, Any]:
    trainee = db.trainee(trainee_id)
    if not trainee:
        raise HTTPException(status_code=404, detail=f"No trainee {trainee_id}")
    if not trainee["consent"]:
        # Consent is what makes longitudinal tracking lawful; without it the
        # record still counts in aggregates but is not individually readable.
        raise HTTPException(
            status_code=403,
            detail="This trainee has not consented to individual record access.",
        )
    return trainee
