# SkillTrack API

FastAPI backend for the SkillTrack frontend — longitudinal skilling outcomes for
the MP State Skill Development Mission.

## Run

```bash
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

- Frontend: <http://localhost:8000>
- Interactive docs: <http://localhost:8000/docs>
- OpenAPI schema: <http://localhost:8000/openapi.json>

The API serves the static frontend from the repo root as well, so this is the
only process you need. The static mount is registered last so it cannot shadow
`/api/*`.

## Tests

```bash
python -m pytest backend/tests -q
```

The parity test shells out to `node` to regenerate the cohort from the real
`assets/js/data.js` and compares it record for record. It skips if `node` is not
on PATH; everything else runs regardless.

## How the data works

The frontend builds a 10,000-trainee cohort in the browser from a seeded
mulberry32 PRNG. `app/rng.py` is a bit-exact port of that generator — JavaScript
32-bit semantics (`Math.imul`, `>>>`, `Math.round`'s half-up rounding) and all —
and `app/generator.py` replays the same draws in the same order. The result is
that **the API serves the identical 10,000 records the browser generates**, so
you can move a page onto the API one fetch at a time without any number on
screen shifting.

That parity is fragile by nature: one added or removed `rand()` call on either
side desynchronises the stream and every later record diverges. `tests/test_parity.py`
exists to catch exactly that.

## Layout

| File | Responsibility |
| --- | --- |
| `app/rng.py` | mulberry32 + JS integer/rounding semantics |
| `app/reference.py` | districts, courses, providers, batches, employers, skill gaps |
| `app/generator.py` | cohort construction, featured-profile splice, hire counts |
| `app/analytics.py` | filter / summarise / breakdown / waves / wage / reasons |
| `app/store.py` | in-memory store, operational collections, audit log |
| `app/schemas.py` | Pydantic request & response models |
| `app/deps.py` | shared filter dependency |
| `app/routers/` | reference, trainees, analytics, employers, admin, portal |

## Endpoints

Every analytics endpoint accepts the same filters as query parameters:
`course`, `district`, `batch`, `provider`, `outcome`, `gender`, `q`. Omitting one
(or passing `all`) means "don't filter on it" — the same contract the UI selects
use. Pass one filter state to all of them and the numbers stay mutually
consistent.

### Reference
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/filters` | Everything the filter bar needs, in one call |
| GET | `/api/districts` · `/api/courses` · `/api/providers` · `/api/batches` | Lookup lists |
| GET | `/api/outcomes` · `/api/non-placement-reasons` | Categories |
| GET | `/api/skill-gaps` | Curriculum coverage vs industry demand |

### Registry
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/trainees` | Filtered, sorted, paged. `total` is the full filtered size |
| GET | `/api/trainees/{id}` | 403 if the trainee withheld consent |
| GET | `/api/trainees/export.csv` | Streamed export of the filtered set |

Phone and email come back `null` unless you pass `includePii=true`. The keys are
always present, so the response shape doesn't change with the flag.

### Analytics
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/analytics/summary` | Headline KPIs |
| GET | `/api/analytics/breakdown/{dimension}` | `district`, `course`, `provider`, `batch`, `sector`, `gender`, `outcome` |
| GET | `/api/analytics/follow-ups` | Response funnel across the 3m/6m/12m/24m waves |
| GET | `/api/analytics/wage-progression` | Average wage by months since training |
| GET | `/api/analytics/non-placement` | Reason codes, commonest first |
| GET | `/api/analytics/map` | District breakdown joined to lat/lon |
| GET | `/api/analytics/provider-performance` | Provider league table |
| GET | `/api/analytics/roi` | Cost per placement by course |
| GET | `/api/analytics/equity` | Outcome gaps by gender and district |

### Employer portal
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/employers/me` | The signed-in employer |
| GET | `/api/employers/{id}/hires` | Their hires, plus a summary |
| GET | `/api/employers/{id}/verifications` | Verification requests |
| POST | `/api/employers/verifications/{id}` | Confirm or dispute; writes through to the trainee record |
| GET | `/api/employers/{id}/jobs` · POST `/api/employers/jobs` | Job postings |
| GET | `/api/employers/{id}/candidates` | Certified, unplaced, same district and sector |

### Admin
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/validation-queue` | Open flags, critical first |
| POST | `/api/admin/validation-queue/{id}` | Resolve or dismiss; audited |
| GET | `/api/admin/data-quality` | Consent, contactability, verification, response |
| GET | `/api/admin/campaigns` · POST | Launch a follow-up campaign |
| GET | `/api/admin/consent` | Consent coverage by district |
| GET | `/api/admin/audit-log` | Newest first |

### Trainee portal
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/portal/me` | Full profile: skills, wage history, journey, pending survey |
| GET | `/api/portal/me/recommendations` | Courses that close this trainee's skill gaps |
| POST | `/api/portal/{id}/survey` | Answer a follow-up wave |

## Design notes

**Consent is enforced, not decorative.** `/api/trainees/{id}` returns 403 for a
trainee who withheld consent, and campaigns only target consenting trainees.
Unconsented records still count in aggregates — that's the point of aggregates —
but they aren't individually readable.

**Campaign audiences are computed, never supplied.** `POST /api/admin/campaigns`
derives its audience from the live cohort. A campaign whose stated reach doesn't
match who actually got contacted is how response-rate reporting goes wrong.

**Waves that aren't due are rejected.** Answering the 12m survey at month 6
returns 409 rather than being silently accepted into the wrong wave.

**Repeat decisions are rejected.** Confirming an already-decided verification, or
resolving an already-closed flag, returns 409 instead of overwriting.

## Going to production

`app/store.py` is the seam. It builds everything in memory at import and holds
it for the process lifetime — writes are real and visible to later reads, but do
not survive a restart. Replace it with a database layer exposing the same
accessors and the routers are unchanged.

You'd also want, in rough order: authentication (the `*/me` endpoints currently
default to a fixed subject instead of reading a token), per-role authorisation
over the PII and export routes, and rate limiting on the public survey endpoint.
