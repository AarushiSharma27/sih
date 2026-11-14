"""
match.py -- the two hiring rounds.

Round 1 (recommendation): skills the trainee's *verified certificate* course
teaches vs the skills the job description requires.
Round 2 (resume screening): skills actually found in the trainee's resume text vs
the same required skills. Passing needs PASS_MARK of the required skills.
"""

from __future__ import annotations

import re

PASS_MARK = 0.5


def norm(skills: list[str]) -> list[str]:
    """Split on ; or , as well, trim, drop blanks and case-duplicates, keep the first spelling."""
    seen, out = set(), []
    for s in (part for item in skills for part in re.split(r"[;,]", item)):
        s = s.strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def cert_match(course_skills: list[str], job_skills: list[str]) -> float:
    have = {s.lower() for s in course_skills}
    return sum(s.lower() in have for s in job_skills) / len(job_skills) if job_skills else 0.0


def in_text(skill: str, text: str) -> bool:
    # word-ish boundaries so "C" does not match every word with a c, but "C++" / "Node.js" still work
    return re.search(r"(?<![\w+#.])" + re.escape(skill) + r"(?![\w+#])", text, re.IGNORECASE) is not None


def screen_resume(resume: str, job_skills: list[str]) -> tuple[float, list[str], list[str]]:
    matched = [s for s in job_skills if in_text(s, resume)]
    missing = [s for s in job_skills if s not in matched]
    return (len(matched) / len(job_skills) if job_skills else 0.0), matched, missing


if __name__ == "__main__":
    assert cert_match(["Excel", "SQL"], ["sql", "Power BI"]) == 0.5
    assert screen_resume("Built dashboards in Power BI and SQL.", ["SQL", "Power BI", "Python"])[0] == 2 / 3
    assert not in_text("C", "Certified in Excel") and in_text("C++", "Wrote C++ daily")
    assert norm([" Excel", "excel", "", "SQL"]) == ["Excel", "SQL"]
    assert norm(["Excel; SQL; Power BI", "sql"]) == ["Excel", "SQL", "Power BI"]
    print("ok")
