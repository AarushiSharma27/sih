"""
Parity and behaviour tests.

The parity test is the important one: it regenerates the cohort in Node from the
real assets/js/data.js and asserts the Python port matches record for record. If
a draw is ever added, removed or reordered in either implementation, the two
streams desynchronise and this fails loudly rather than quietly serving a
different 10,000 people than the UI shows.

Run:  python -m pytest backend/tests -q      (needs node on PATH for parity)
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analytics import filter_trainees, follow_up_waves, summarise, wage_progression
from app.generator import build_cohort

ROOT = Path(__file__).resolve().parents[2]

DUMP_JS = """
const fs = require('fs'), path = require('path');
global.window = global;
eval(fs.readFileSync(path.join(process.argv[2], 'assets/js/data.js'), 'utf8'));
fs.writeFileSync(process.argv[3], JSON.stringify(global.DB.trainees));
"""


@pytest.fixture(scope="module")
def js_cohort() -> list[dict]:
    if not shutil.which("node"):
        pytest.skip("node not on PATH — cannot cross-check against the JS generator")
    with tempfile.TemporaryDirectory() as tmp:
        script, out = Path(tmp) / "dump.js", Path(tmp) / "trainees.json"
        script.write_text(DUMP_JS, encoding="utf-8")
        subprocess.run(
            ["node", str(script), str(ROOT), str(out)],
            check=True, capture_output=True,
        )
        return json.loads(out.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def py_cohort() -> list[dict]:
    return build_cohort()


def test_cohort_matches_javascript_exactly(js_cohort, py_cohort):
    assert len(py_cohort) == len(js_cohort) == 10000
    mismatched = [i for i, (a, b) in enumerate(zip(js_cohort, py_cohort)) if a != b]
    assert not mismatched, (
        f"{len(mismatched)} record(s) diverge from the JS generator, "
        f"first at index {mismatched[0] if mismatched else '-'}"
    )


def test_featured_trainee_is_spliced_in(py_cohort):
    featured = next(t for t in py_cohort if t["id"] == "SKL-MP-2025-03102")
    assert featured["name"] == "Anjali Verma"
    assert featured["employer"] == "DataBridge Analytics"
    assert featured["currentSalary"] == 23500


def test_summary_rates_are_consistent(py_cohort):
    s = summarise(py_cohort)
    assert s["total"] == 10000
    assert sum(s["counts"].values()) == 10000
    # The four outcome rates partition the cohort.
    total_rate = (
        s["employmentRate"] + s["selfRate"] + s["apprenticeRate"] + s["notPlacedRate"]
    )
    assert total_rate == pytest.approx(100.0)
    assert s["placementRate"] == pytest.approx(100 - s["notPlacedRate"])


def test_empty_selection_does_not_divide_by_zero():
    s = summarise([])
    assert s["total"] == 0
    assert s["placementRate"] == 0
    assert s["avgStartingSalary"] == 0
    assert wage_progression([])[0]["value"] == 0


def test_filters_narrow_the_cohort(py_cohort):
    indore = filter_trainees(py_cohort, {"district": "Indore"})
    assert 0 < len(indore) < len(py_cohort)
    assert all(t["district"] == "Indore" for t in indore)
    # "all" is a pass-through, not a literal match.
    assert len(filter_trainees(py_cohort, {"district": "all"})) == len(py_cohort)


def test_follow_up_waves_account_for_every_trainee(py_cohort):
    for wave in follow_up_waves(py_cohort):
        counted = (
            wave["responded"] + wave["assisted"] + wave["noResponse"] + wave["scheduled"]
        )
        assert counted == len(py_cohort)
        assert wave["due"] == counted - wave["scheduled"]
