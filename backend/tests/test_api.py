"""
Endpoint tests.

These cover the contract the frontend depends on (shapes, paging, filter
pass-through) and the write paths, where the interesting failures live: a
double-confirmed verification or a survey answered before its wave is due would
both corrupt the longitudinal picture.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["cohort"] == 10000


def test_filters_payload_is_complete(client):
    body = client.get("/api/filters").json()
    assert len(body["courses"]) == 10
    assert len(body["districts"]) == 8
    assert len(body["providers"]) == 6
    assert set(body["outcomes"]) == {"employed", "self", "apprentice", "notplaced"}


def test_registry_pages_and_reports_full_total(client):
    body = client.get("/api/trainees", params={"limit": 25}).json()
    assert body["total"] == 10000
    assert len(body["rows"]) == 25
    # PII is withheld unless asked for, but the key stays for a stable shape.
    assert body["rows"][0]["phone"] is None
    assert body["rows"][0]["email"] is None

    with_pii = client.get("/api/trainees", params={"limit": 1, "includePii": True}).json()
    assert with_pii["rows"][0]["phone"].startswith("+91")


def test_registry_filter_narrows_total(client):
    body = client.get("/api/trainees", params={"district": "Indore", "limit": 5}).json()
    assert body["total"] < 10000
    assert all(r["district"] == "Indore" for r in body["rows"])


def test_registry_rejects_unknown_sort(client):
    assert client.get("/api/trainees", params={"sort": "salary"}).status_code == 400


def test_unknown_trainee_is_404(client):
    assert client.get("/api/trainees/SKL-MP-9999-00001").status_code == 404


def test_summary_matches_breakdown_totals(client):
    summary = client.get("/api/analytics/summary", params={"course": "Data Analytics"}).json()
    rows = client.get(
        "/api/analytics/breakdown/district", params={"course": "Data Analytics"}
    ).json()
    assert sum(r["total"] for r in rows) == summary["total"]


def test_unknown_breakdown_dimension_is_400(client):
    assert client.get("/api/analytics/breakdown/planet").status_code == 400


def test_wage_progression_is_monotonic_in_coverage(client):
    points = client.get("/api/analytics/wage-progression").json()
    counts = [p["n"] for p in points]
    # Later buckets can only include trainees tracked at least that long.
    assert counts == sorted(counts, reverse=True)


def test_roi_orders_by_cost_per_placement(client):
    rows = client.get("/api/analytics/roi").json()
    costs = [r["costPerPlacement"] for r in rows if r["costPerPlacement"] is not None]
    assert costs == sorted(costs)


def test_csv_export_has_a_header_and_rows(client):
    r = client.get("/api/trainees/export.csv", params={"district": "Satna", "batch": "2024-A"})
    assert r.status_code == 200
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("id,name,gender")
    assert "follow24m" in lines[0]
    assert len(lines) > 1


def test_verification_confirm_then_reject_duplicate(client):
    pending = client.get("/api/employers/EMP-101/verifications", params={"status": "pending"}).json()
    request_id = pending[0]["id"]

    ok = client.post(f"/api/employers/verifications/{request_id}", json={"status": "confirmed"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "confirmed"

    # The decision writes through to the trainee record.
    trainee = client.get(f"/api/portal/{pending[0]['traineeId']}").json()
    assert trainee["verified"] is True

    again = client.post(f"/api/employers/verifications/{request_id}", json={"status": "disputed"})
    assert again.status_code == 409


def test_flag_resolution_is_audited(client):
    flag = client.get("/api/admin/validation-queue").json()[0]
    r = client.post(
        f"/api/admin/validation-queue/{flag['id']}",
        json={"status": "resolved", "note": "Merged duplicate records."},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    log = client.get("/api/admin/audit-log", params={"limit": 5}).json()
    assert any(flag["subject"] in entry["target"] for entry in log)

    # It leaves the open queue.
    open_ids = [f["id"] for f in client.get("/api/admin/validation-queue").json()]
    assert flag["id"] not in open_ids


def test_survey_rejects_a_wave_that_is_not_due(client):
    # The featured trainee's 12m wave is still scheduled.
    r = client.post(
        "/api/portal/SKL-MP-2025-03102/survey",
        json={"wave": "12m", "stillEmployed": True},
    )
    assert r.status_code == 409


def test_survey_records_a_due_wave(client):
    r = client.post(
        "/api/portal/SKL-MP-2025-03102/survey",
        json={"wave": "6m", "currentSalary": 25000, "relevance": 5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "responded"
    assert body["record"]["currentSalary"] == 25000
    assert body["record"]["relevance"] == 5


def test_survey_validates_relevance_range(client):
    r = client.post(
        "/api/portal/SKL-MP-2025-03102/survey", json={"wave": "6m", "relevance": 9}
    )
    assert r.status_code == 422


def test_campaign_audience_is_computed_not_supplied(client):
    r = client.post(
        "/api/admin/campaigns",
        json={"name": "6-month check — Satna", "channel": "SMS", "district": "Satna", "wave": "6m"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"].startswith("CMP-")
    assert body["audience"] > 0
    assert body["sent"] == body["audience"]
    assert body["responded"] == 0


def test_job_posting_round_trips(client):
    r = client.post(
        "/api/employers/jobs",
        json={
            "title": "Junior SQL Analyst", "openings": 3, "skills": ["SQL"],
            "district": "Indore", "salary": "Rs 20,000", "employerId": "EMP-101",
        },
    )
    assert r.status_code == 201
    job_id = r.json()["id"]
    jobs = client.get("/api/employers/EMP-101/jobs").json()
    assert job_id in [j["id"] for j in jobs]


def test_frontend_is_served_at_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "SkillTrack" in r.text
