# SkillTrack

**Longitudinal Skilling Outcomes & Impact Measurement System** for the Madhya
Pradesh State Skill Development Mission.

Most skilling systems stop measuring at certification. SkillTrack is a
consent-based platform that keeps following each trainee for two years, through
employment, self-employment, wage progression and job retention. That way,
training providers, programmes and public spending can be judged on what
actually happened to trainees.

> Train → Track → Measure → Understand → Improve

## Features

- **Outcome dashboard**: placement, wage and retention KPIs, filterable by
  course, district, batch, provider, outcome and gender.
- **Follow-up waves**: surveys at 3, 6, 12 and 24 months, with response funnels
  and wage progression over time.
- **Insights & reports**: provider league table, cost per placement (ROI),
  equity gaps by gender and district, reasons for non-placement and skill gaps.
- **Trainee portal**: profile, outcome updates, follow-up surveys and course
  recommendations.
- **Employer portal**: verify employment claims, post jobs and find matching
  certified candidates.
- **Admin console**: data-validation queue, data-quality scorecard, consent
  coverage, follow-up campaigns and an audit log.
- **Consent enforced in the API**: records of trainees who withheld consent
  cannot be read individually. They still count in aggregates.

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript (no build step) |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Data | A seeded 10,000-trainee cohort, generated identically in the browser and the API |

## Getting started

Requires Python 3.10+.

```bash
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Then open:

- App: <http://localhost:8000>
- API docs (Swagger): <http://localhost:8000/docs>

The backend also serves the frontend, so this is the only process you need.

**Frontend only:** you can also open `index.html` directly or serve the repo
root with any static server. The pages generate their data in the browser and
fall back to a local simulation when the API isn't reachable.

### Signing in (demo)

On `login.html`, pick a role (Trainee, Training provider, Employer or
Administrator) and enter an ID in the format shown, e.g. `SKL-MP-2025-03102`
for a trainee. This is a demo build, so any non-empty password is accepted.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Landing page |
| `login.html` / `register.html` | Role-based sign-in, trainee registration |
| `dashboard.html` | Programme outcome dashboard |
| `insights.html` | Insights & recommended actions |
| `reports.html` | Reports and exports |
| `trainee.html` / `outcome.html` | Trainee profile, outcome updates |
| `employer.html` | Employer portal |
| `admin.html` | Admin console |
| `notifications.html` | Notifications |

## Project structure

```
.
├── *.html              # One file per page
├── assets/
│   ├── css/styles.css
│   └── js/             # Per-page scripts plus data.js (cohort), api.js (API client), charts.js
└── backend/
    ├── app/            # FastAPI app: routers, analytics, data generator, in-memory store
    ├── tests/          # API and browser/backend data-parity tests
    └── requirements.txt
```

## Tests

```bash
pip install pytest
python -m pytest backend/tests -q
```

The parity test needs `node` on your PATH and is skipped without it.

## More detail

See [`backend/README.md`](backend/README.md) for the full API endpoint list, how
the shared data generation works, design notes and production next steps.
