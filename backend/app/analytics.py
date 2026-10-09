"""
analytics.py -- the aggregation helpers every page filters through.

Ported from the query helpers at the bottom of assets/js/data.js so a chart fed
by the API draws the same shape as one fed by the in-browser mock. Percentages
are returned as 0-100 floats, unrounded: rounding is a presentation decision and
belongs to whatever is drawing the number.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

from .reference import FOLLOW_WAVES, NON_PLACEMENT_REASONS, SKILL_GAPS

Trainee = dict[str, Any]


def filter_trainees(rows: Sequence[Trainee], f: dict[str, Any] | None = None) -> list[Trainee]:
    """
    Apply the standard filter set. A missing key, or the literal "all", means
    "do not filter on this dimension" -- the same contract the UI selects use.
    """
    f = f or {}

    def keep(t: Trainee) -> bool:
        for key in ("course", "district", "batch", "provider", "outcome", "gender"):
            want = f.get(key)
            if want and want != "all" and t[key] != want:
                return False
        q = f.get("q")
        if q:
            hay = f"{t['name']} {t['id']} {t['district']} {t['course']}".lower()
            if q.lower() not in hay:
                return False
        return True

    return [t for t in rows if keep(t)]


def summarise(rows: Sequence[Trainee]) -> dict[str, Any]:
    """Headline KPIs for a set of trainees."""
    n = len(rows) or 1
    by = {"employed": 0, "self": 0, "apprentice": 0, "notplaced": 0}
    salary_sum = salary_n = rel_sum = ret_y = ret_n = 0
    certified = consented = growth_sum = growth_n = respond = respond_n = 0

    for t in rows:
        by[t["outcome"]] += 1
        if t["startingSalary"]:
            salary_sum += t["startingSalary"]
            salary_n += 1
        if t["currentSalary"] and t["startingSalary"]:
            growth_sum += t["currentSalary"] - t["startingSalary"]
            growth_n += 1
        rel_sum += t["relevance"]
        if t["retained12m"] is True:
            ret_y += 1
        if t["retained12m"] is False:
            ret_n += 1
        if t["certified"]:
            certified += 1
        if t["consent"]:
            consented += 1
        for v in t["follow"].values():
            if v == "scheduled":
                continue
            respond_n += 1
            if v in ("responded", "assisted"):
                respond += 1

    placed = by["employed"] + by["self"] + by["apprentice"]
    return {
        "total": len(rows),
        "counts": by,
        "employmentRate": by["employed"] / n * 100,
        "selfRate": by["self"] / n * 100,
        "apprenticeRate": by["apprentice"] / n * 100,
        "notPlacedRate": by["notplaced"] / n * 100,
        "placementRate": placed / n * 100,
        "avgStartingSalary": salary_sum / salary_n if salary_n else 0,
        "avgWageGrowth": growth_sum / growth_n if growth_n else 0,
        "retention12m": (ret_y / (ret_y + ret_n) * 100) if (ret_y + ret_n) else 0,
        "relevance": (rel_sum / n) / 5 * 100,
        "certification": certified / n * 100,
        "consentRate": consented / n * 100,
        "responseRate": (respond / respond_n * 100) if respond_n else 0,
    }


def group_by(rows: Iterable[Trainee], key: str) -> dict[Any, list[Trainee]]:
    out: dict[Any, list[Trainee]] = {}
    for t in rows:
        out.setdefault(t[key], []).append(t)
    return out


def breakdown(rows: Sequence[Trainee], key: str) -> list[dict[str, Any]]:
    """
    One summary record per distinct value of `key`, largest group first.

    Unlike the JS original this does not attach the member rows -- a district
    breakdown would otherwise serialise the whole cohort on every request. Fetch
    /api/trainees with the matching filter when the rows themselves are needed.
    """
    out = [{"key": k, **summarise(group)} for k, group in group_by(rows, key).items()]
    out.sort(key=lambda r: r["total"], reverse=True)
    return out


def follow_up_waves(rows: Sequence[Trainee]) -> list[dict[str, Any]]:
    """Response status across the 3m/6m/12m/24m waves."""
    waves = []
    for w in FOLLOW_WAVES:
        responded = assisted = no = scheduled = 0
        for t in rows:
            v = t["follow"][w]
            if v == "responded":
                responded += 1
            elif v == "assisted":
                assisted += 1
            elif v == "no-response":
                no += 1
            else:
                scheduled += 1
        waves.append({
            "wave": w,
            "responded": responded,
            "assisted": assisted,
            "noResponse": no,
            "scheduled": scheduled,
            "due": responded + assisted + no,
        })
    return waves


def wage_progression(rows: Sequence[Trainee]) -> list[dict[str, Any]]:
    """
    Average wage by months-since-training.

    Each trainee's observed growth is spread linearly across the months they have
    actually been tracked, then projected onto the bucket -- so a 2024 trainee
    contributes to the 24-month point and a 2026 one does not.
    """
    buckets = [
        ("At placement", 0), ("3 months", 3), ("6 months", 6),
        ("12 months", 12), ("24 months", 24),
    ]
    placed = [t for t in rows if t["startingSalary"] > 0]
    if not placed:
        return [{"label": label, "value": 0, "n": 0} for label, _ in buckets]

    start_avg = sum(t["startingSalary"] for t in placed) / len(placed)
    out = []
    for label, months in buckets:
        eligible = [t for t in placed if t["monthsSince"] >= months]
        if not eligible:
            out.append({"label": label, "value": None, "n": 0})
            continue
        total = 0.0
        for t in eligible:
            span = min(t["monthsSince"], months)
            rate = (t["currentSalary"] / t["startingSalary"] - 1) / max(t["monthsSince"], 1)
            total += t["startingSalary"] * (1 + rate * span)
        out.append({
            "label": label,
            "value": round(total / len(eligible)),
            "n": len(eligible),
            "base": round(start_avg),
        })
    return out


def reason_breakdown(rows: Sequence[Trainee]) -> list[dict[str, Any]]:
    """Why the unplaced were not placed, commonest first."""
    counts: dict[str, int] = {}
    for t in rows:
        if t["reason"]:
            counts[t["reason"]] = counts.get(t["reason"], 0) + 1
    out = [
        {"code": r["code"], "label": r["label"], "value": counts.get(r["code"], 0)}
        for r in NON_PLACEMENT_REASONS
    ]
    out.sort(key=lambda r: r["value"], reverse=True)
    return out


def skill_gap_rows() -> list[dict[str, Any]]:
    """Curriculum coverage against industry demand, worst-covered first."""
    out = []
    for s in SKILL_GAPS:
        gap = [k for k in s["industry"] if k not in s["taught"]]
        out.append({
            **s,
            "gap": gap,
            "coverage": (len(s["industry"]) - len(gap)) / len(s["industry"]) * 100,
        })
    out.sort(key=lambda r: r["coverage"])
    return out
