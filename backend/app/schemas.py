"""
schemas.py -- request and response models.

Response models are typed where the shape is fixed and the docs benefit; the
aggregate endpoints return plain dicts, since their keys are driven by the
dimension being grouped on and pinning them here would only duplicate
analytics.py. Field names stay camelCase to match what the frontend already
reads off `DB.*`.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Outcome = Literal["employed", "self", "apprentice", "notplaced"]
Gender = Literal["F", "M", "O"]
FollowStatus = Literal["responded", "assisted", "no-response", "scheduled"]


class Trainee(BaseModel):
    id: str
    name: str
    gender: Gender
    age: int
    # Withheld unless the caller passes includePii — see routers/trainees.py.
    phone: str | None = None
    email: str | None = None
    district: str
    course: str
    courseCode: str
    sector: str
    provider: str
    providerId: str
    batch: str
    enrolled: str
    attendance: int
    score: int
    certified: bool
    outcome: Outcome
    employer: str | None
    employerId: str | None
    startingSalary: int
    currentSalary: int
    retained12m: bool | None
    relevance: int
    reason: str | None
    monthsSince: int
    follow: dict[str, FollowStatus]
    consent: bool
    contactValid: bool
    verified: bool | None


class TraineePage(BaseModel):
    """A slice of the registry, plus the totals for the whole filtered set."""

    total: int = Field(description="Rows matching the filter, before paging")
    limit: int
    offset: int
    rows: list[Trainee]


class OutcomeCounts(BaseModel):
    employed: int
    self: int
    apprentice: int
    notplaced: int


class Summary(BaseModel):
    total: int
    counts: OutcomeCounts
    employmentRate: float
    selfRate: float
    apprenticeRate: float
    notPlacedRate: float
    placementRate: float
    avgStartingSalary: float
    avgWageGrowth: float
    retention12m: float
    relevance: float
    certification: float
    consentRate: float
    responseRate: float


class FollowWave(BaseModel):
    wave: str
    responded: int
    assisted: int
    noResponse: int
    scheduled: int
    due: int


class WagePoint(BaseModel):
    label: str
    value: int | None
    n: int
    base: int | None = None


class ReasonCount(BaseModel):
    code: str
    label: str
    value: int


class SkillGap(BaseModel):
    course: str
    industry: list[str]
    taught: list[str]
    gap: list[str]
    demandIndex: int
    coverage: float


class Filters(BaseModel):
    """Everything needed to populate the filter bar in one request."""

    courses: list[dict[str, Any]]
    districts: list[dict[str, Any]]
    providers: list[dict[str, Any]]
    batches: list[dict[str, Any]]
    outcomes: dict[str, dict[str, str]]
    genders: list[dict[str, str]]


# ---------- write payloads ----------


class SurveyAnswer(BaseModel):
    """One trainee's response to a follow-up wave."""

    wave: Literal["3m", "6m", "12m", "24m"]
    stillEmployed: bool | None = None
    currentSalary: int | None = Field(default=None, ge=0, le=10_000_000)
    relevance: int | None = Field(default=None, ge=1, le=5)
    assisted: bool = Field(
        default=False,
        description="True when a field officer captured this on the trainee's behalf",
    )


class VerifyDecision(BaseModel):
    status: Literal["confirmed", "disputed"]
    note: str | None = Field(default=None, max_length=500)


class FlagResolution(BaseModel):
    status: Literal["resolved", "dismissed"]
    note: str | None = Field(default=None, max_length=500)
    actor: str = "r.mehta@mpssdm.gov.in"


class CampaignCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    channel: str = Field(min_length=2, max_length=60)
    batch: str | None = Field(default=None, description="Batch id to target, or None for all")
    district: str | None = None
    wave: Literal["3m", "6m", "12m", "24m"] = "6m"


class JobCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    openings: int = Field(ge=1, le=10000)
    skills: list[str] = Field(default_factory=list, max_length=20)
    district: str
    salary: str = Field(min_length=1, max_length=60)
    employerId: str = "EMP-101"
