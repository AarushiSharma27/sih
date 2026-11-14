# SkillTrack

**Longitudinal Skilling Outcomes & Impact Measurement System** for the Madhya
Pradesh State Skill Development Mission.

Most skilling systems stop measuring at certification. SkillTrack is a
consent-based platform that keeps following each trainee for two years, through
employment, self-employment, wage progression and job retention. That way,
training providers, programmes and public spending can be judged on what
actually happened to trainees.

> Train → Track → Measure → Understand → Improve

## How it works

1. **Admin publishes courses** with the skills each one teaches, copied from the official
   qualification pack (QP/NSQF code and source link required).
2. **Trainees register** with consent, their course and certificate number. **Companies
   register** with their GSTIN.
3. **Admin verifies** each GSTIN (GST portal) and certificate (issuing body). Nothing
   unverified is matched or counted as verified.
4. **Verified companies post jobs** with a job description and required skills.
5. **Round 1 – certificate match:** trainees with a verified certificate are recommended open
   jobs whose required skills their course teaches, ranked by coverage.
6. **Round 2 – resume screening:** on applying, the resume is matched against the job's
   skills. At least 50% must appear (`PASS_MARK` in `backend/app/match.py`). Employers see
   only candidates who pass.
7. **Employer shortlists, rejects or hires.** A hire is recorded as a *verified placement*;
   trainees can also self-report their status.
8. **Dashboard** (admin): placement rate, verified placements, income, hiring pipeline, and
   skill gaps, where *industry demand* is the skills in open job descriptions from verified
   companies and *taught* is the course's published skill list.

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript (no build step) |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Data | SQLite (`backend/skilltrack.db`, override with `SKILLTRACK_DB`) |

## Getting started

Requires Python 3.10+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend
../.venv/bin/python -m app.db create-admin you@mpssdm.gov.in "Your Name"   # first admin
../.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000>, sign in as the admin and publish at least one course; trainees
cannot register until one exists. API docs: <http://localhost:8000/docs>.

## Pages

| Page | Who | Purpose |
| --- | --- | --- |
| `index.html` | everyone | Landing page with live platform counts |
| `login.html` | everyone | Sign in (trainees can use their SkillTrack ID or email) |
| `register.html` / `company.html` | everyone | Trainee / company registration |
| `dashboard.html`, `insights.html`, `reports.html` | admin | Outcome analytics, findings, exports |
| `admin.html` | admin | Verify GSTINs and certificates, publish courses, audit log |
| `employer.html` | employer | Post jobs, review screened applicants, confirm employment |
| `trainee.html`, `outcome.html` | trainee | Profile, resume, job matches, applications, status updates |
| `notifications.html` | all signed in | Role-specific alerts from real records |

All pages read real data through `assets/js/data.js`, which loads `GET /api/db` (scoped to
the signed-in role). Sections whose data is not collected yet (training providers, course
fees, wage history, follow-up campaigns) show an empty state.

## Demo data

All fictional (demo accounts use `.demo.skilltrack` and `example.com` emails), password `demo1234`:

```bash
cd backend
../.venv/bin/python -m app.demo            # 9 demo courses + 12 demo companies with 16 open jobs
../.venv/bin/python -m app.demo trainees   # 200 trainees from backend/demo_trainees.csv (certificates pending)
../.venv/bin/python -m app.demo remove     # delete every demo company and trainee
```

Demo course codes and source links are placeholders, not official qualification packs.

## Tests

```bash
.venv/bin/pip install pytest httpx
cd backend && ../.venv/bin/python -m pytest tests -q
```
