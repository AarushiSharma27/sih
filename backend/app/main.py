"""
main.py -- the SkillTrack API.

Serves the JSON API under /api and the existing static frontend at the root, so
`uvicorn app.main:app` is the only process needed to run the whole thing. The
static mount is last: it is a catch-all, and mounting it first would shadow
every API route behind it.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .routers import admin, analytics, employers, portal, reference, trainees
from .store import store

FRONTEND_DIR = Path(__file__).resolve().parents[2]

app = FastAPI(
    title="SkillTrack API",
    version="1.0.0",
    summary="Longitudinal skilling outcomes & impact measurement",
    description=(
        "Backend for the SkillTrack platform: a consent-based system that tracks "
        "trainees from enrolment through to long-term livelihood outcomes.\n\n"
        "The cohort is generated deterministically from the same seed the frontend "
        "uses, so the API and the in-browser mock agree record for record. Swap "
        "`app/store.py` for a database and the routes are unchanged."
    ),
)

# The frontend is served from this same origin, so CORS is only needed when it is
# run separately (e.g. a Vite dev server on another port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000", "http://127.0.0.1:8000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reference.router)
app.include_router(trainees.router)
app.include_router(analytics.router)
app.include_router(employers.router)
app.include_router(admin.router)
app.include_router(portal.router)


@app.get("/api/health", tags=["meta"], summary="Liveness and cohort size")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "cohort": len(store.trainees),
        "employers": len(store.employers),
        "openFlags": sum(1 for f in store.validation_queue if f["status"] == "open"),
    }


@app.get("/api", tags=["meta"], summary="API index")
def index() -> dict[str, object]:
    """A pointer to the docs and the main entry points, for anyone poking at the root."""
    return {
        "name": "SkillTrack API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "endpoints": [
            "/api/filters",
            "/api/trainees",
            "/api/analytics/summary",
            "/api/analytics/breakdown/{district|course|provider|batch|sector|gender|outcome}",
            "/api/analytics/follow-ups",
            "/api/analytics/wage-progression",
            "/api/analytics/roi",
            "/api/analytics/equity",
            "/api/employers/me",
            "/api/admin/validation-queue",
            "/api/portal/me",
        ],
    }


if FRONTEND_DIR.joinpath("index.html").exists():
    @app.get("/", include_in_schema=False)
    def home() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
