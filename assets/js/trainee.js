/* ==========================================================================
   trainee.js — the signed-in trainee's own profile, jobs and applications.
   Everything shown comes from DB.TRAINEE_USER (GET /api/db) or the trainee API.
   ========================================================================== */
(function () {
  "use strict";
  const { $, esc, inr, pct, date, toast, initials } = UI;

  const P = DB.TRAINEE_USER;
  const placed = P.outcomeReported && P.outcome !== "notplaced";
  const reasonLabel = (code) => (DB.NON_PLACEMENT_REASONS.find((r) => r.code === code) || { label: code ? "Other" : "Not reported" }).label;
  const tags = (list, cls) => list.map((s) => `<span class="skill-tag ${cls || ""}">${esc(s)}</span>`).join(" ");
  const empty = (t) => `<div class="tbl-empty">${esc(t)}</div>`;
  const CERT = {
    1:  ['<span class="chip chip--good">✓ Certificate verified</span>', "verified by the mission office"],
    0:  ['<span class="chip chip--warning">Certificate pending</span>', "waiting for the mission office to verify"],
    "-1": ['<span class="chip chip--critical">Certificate not verified</span>', "contact the mission office"]
  };
  const STAGE = { screened_in: ["Passed screening", "chip--info"], screened_out: ["Did not pass screening", "chip--critical"],
    shortlisted: ["Shortlisted", "chip--warning"], rejected: ["Not selected", "chip--critical"], hired: ["Hired", "chip--good"] };
  function addMonths(iso, m) {
    const d = new Date(iso + "T00:00:00");
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  }

  UI.renderShell({ title: "Trainee profile", crumb: P.id + " · " + P.course, user: { name: P.name, role: "Trainee" } });
  UI.initDemoActions();

  const OUT = UI.OUTCOME_META[P.outcome];

  /* ---------- hero ---------- */
  $("#profileHero").innerHTML = `
    <div class="card__body" style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      <span class="avatar avatar--lg" style="background:${UI.avatarColor(P.name)}">${esc(P.initials || initials(P.name))}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div class="row">
          <h1 style="font-size:22px">${esc(P.name)}</h1>
          ${P.outcomeReported ? `<span class="chip ${OUT.chip}"><i class="dot"></i>${OUT.label}</span>` : '<span class="chip">Outcome not reported</span>'}
          ${CERT[P.certStatus][0]}
          <span class="chip chip--brand">Consent active</span>
        </div>
        <div class="row mt-12" style="gap:22px;font-size:13px">
          <div><div class="muted small">Unique ID</div><div class="tbl__id" style="font-size:13px">${esc(P.id)}</div></div>
          <div><div class="muted small">Course</div><div>${esc(P.course)} <span class="muted">(${esc(P.courseCode)})</span></div></div>
          <div><div class="muted small">Certificate</div><div>${esc(P.certId)}</div></div>
          <div><div class="muted small">Certified on</div><div>${date(P.certDate)}</div></div>
          <div><div class="muted small">District</div><div>${esc(P.district)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a class="btn" href="notifications.html">Notifications</a>
        <a class="btn btn--primary" href="outcome.html">Update my outcome</a>
      </div>
    </div>`;

  /* ---------- follow-up: open when a due wave has no response, or nothing was ever reported ---------- */
  const dueWave = ["3m", "6m", "12m", "24m"].find((w) => P.follow[w] === "no-response");
  if (dueWave || !P.outcomeReported) {
    $("#surveyMount").innerHTML = `
      <div class="card" style="border-color:var(--warning)">
        <div class="card__head" style="background:var(--warning-soft)">
          <div><h3>⏱ ${dueWave ? "Your " + dueWave.replace("m", "-month") + " follow-up is due" : "Tell us your current status"}</h3>
            <div class="card__sub">About 40 seconds · keeps your outcome record current</div></div>
        </div>
        <div class="card__body">
          <form class="grid grid--3" id="surveyForm" style="align-items:end">
            <div class="field"><label for="sOutcome">Are you currently working?</label>
              <select class="select" id="sOutcome">
                <option value="employed">Yes — employed</option><option value="self">Yes — self-employed</option>
                <option value="apprentice">Yes — apprenticeship</option><option value="notplaced">No — not working</option></select></div>
            <div class="field" data-placed><label for="sEmployer">Employer / business name</label>
              <input class="input" id="sEmployer" value="${esc(P.employer || "")}"></div>
            <div class="field" data-placed><label for="sSalary">Monthly take-home income</label>
              <input class="input" id="sSalary" inputmode="numeric" placeholder="₹ per month" value="${P.currentSalary || ""}"></div>
            <div class="field" data-placed><label for="sRel">How relevant was your training to this work?</label>
              <select class="select" id="sRel"><option value="5">5 — Highly relevant</option><option value="4">4 — Relevant</option>
                <option value="3">3 — Somewhat</option><option value="2">2 — Barely</option><option value="1">1 — Not at all</option></select></div>
            <div class="field" data-unplaced hidden><label for="sReason">Main reason</label>
              <select class="select" id="sReason">${DB.NON_PLACEMENT_REASONS.filter((r) => r.code !== "NOREPORT")
                .map((r) => `<option value="${r.code}">${esc(r.label)}</option>`).join("")}</select></div>
          </form>
          <div class="row mt-16">
            <button class="btn btn--primary" id="submitSurvey">Submit response</button>
            <span class="muted small">Your answers are visible to the mission office; wage figures are never shown against your name publicly.</span>
          </div>
        </div>
      </div>`;
    if (P.outcomeReported) $("#sOutcome").value = P.outcome;
    const syncFields = () => {
      const working = $("#sOutcome").value !== "notplaced";
      document.querySelectorAll("#surveyForm [data-placed]").forEach((n) => { n.hidden = !working; });
      document.querySelectorAll("#surveyForm [data-unplaced]").forEach((n) => { n.hidden = working; });
    };
    $("#sOutcome").addEventListener("change", syncFields);
    syncFields();
    $("#submitSurvey").addEventListener("click", async () => {
      const outcome = $("#sOutcome").value, working = outcome !== "notplaced";
      const salary = $("#sSalary").value.replace(/[^\d]/g, "");
      const r = await API.saveOutcome({
        outcome,
        employer_name: working ? $("#sEmployer").value.trim() || null : null,
        salary: working && salary ? Number(salary) : null,
        relevance: working ? Number($("#sRel").value) : null,
        reason: working ? null : $("#sReason").value
      });
      if (!r.ok) return toast(r.error, "bad");
      toast("Follow-up response saved");
      location.reload();
    });
  }

  /* ---------- stat tiles ---------- */
  const apps = P.applications || [];
  $("#traineeStats").innerHTML = [
    { l: "Certificate", v: { 1: "Verified", 0: "Pending", "-1": "Rejected" }[P.certStatus], m: CERT[P.certStatus][1], a: "var(--series-1)" },
    { l: "Job applications", v: String(apps.length), m: apps.filter((a) => a.stage !== "screened_out").length + " passed resume screening", a: "var(--series-3)" },
    { l: "Current monthly income", v: placed && P.currentSalary ? inr(P.currentSalary) : "—",
      m: placed ? (P.verified ? "verified by employer" : "self-reported") : "no income recorded", a: "var(--series-4)" },
    { l: "Months since certification", v: String(P.monthsSince), m: "of the 24-month tracking window", a: "var(--series-7)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");

  /* ---------- journey: server stages + follow-up waves dated from certification ---------- */
  const FNOTE = { responded: "Status updated after this milestone.", "no-response": "No status update since this milestone." };
  const journey = P.journey.concat([["3-month", 3], ["6-month", 6], ["12-month", 12], ["24-month", 24]].map(([label, m]) => {
    const st = P.follow[m + "m"];
    return { stage: label + " follow-up", date: addMonths(P.certDate, m),
      status: st === "scheduled" ? "upcoming" : st === "responded" ? "done" : "blocked", note: FNOTE[st] || "Scheduled." };
  }));
  const DOT = { done: "var(--good)", active: "var(--warning)", upcoming: "var(--baseline)", blocked: "var(--critical)" };
  $("#journeyProgress").textContent = journey.filter((j) => j.status === "done").length + " of " + journey.length + " stages complete";
  $("#journey").innerHTML = journey.map((j) => `
    <div class="tl-item ${j.status === "done" || j.status === "blocked" ? "tl-item--done" : ""}" style="--dot:${DOT[j.status]}">
      <div class="tl-item__time">${date(j.date)}</div>
      <div class="tl-item__title">${esc(j.stage)}
        ${j.status === "active" ? '<span class="chip chip--warning" style="margin-left:6px">Action needed</span>' : ""}
        ${j.status === "blocked" ? '<span class="chip chip--critical" style="margin-left:6px">Attention</span>' : ""}
        ${j.status === "upcoming" ? '<span class="chip" style="margin-left:6px">Scheduled</span>' : ""}
      </div>
      <div class="tl-item__body">${esc(j.note)}</div>
    </div>`).join("");

  /* ---------- employment record ---------- */
  $("#verifyChip").innerHTML = !placed
    ? '<span class="chip chip--critical">No placement on record</span>'
    : P.verified ? '<span class="chip chip--good">✓ Employer verified</span>'
                 : '<span class="chip chip--warning">Self-reported</span>';

  $("#employmentKV").innerHTML = placed ? `
    <dt>Status</dt><dd>${OUT.label}</dd>
    <dt>Employer</dt><dd>${esc(P.employer || "—")}</dd>
    <dt>Last updated</dt><dd>${date(P.outcomeUpdated)}</dd>
    <dt>Monthly income</dt><dd class="tnum">${P.currentSalary ? inr(P.currentSalary) + " / month" : "—"}</dd>
    <dt>Training relevance</dt><dd>${P.relevance ? "★".repeat(P.relevance) + "☆".repeat(5 - P.relevance) + ` <span class="muted small">(${P.relevance}/5)</span>` : "—"}</dd>`
    : `<dt>Status</dt><dd>${P.outcomeReported ? "Not working" : "Not reported yet"}</dd>
       <dt>Reason reported</dt><dd>${esc(reasonLabel(P.reason))}</dd>`;

  $("#employmentFoot").innerHTML = placed
    ? `<span>${P.verified ? "Confirmed by your employer on SkillTrack." : "Your employer can confirm this from the employer portal once their company is on SkillTrack."}</span>`
    : `<span>Report a job as soon as you start. Hires made through SkillTrack are recorded automatically.</span>`;

  // one data point per status update; a line needs two
  if (P.wageHistory.length > 1) {
    Viz.line($("#chartWage"), {
      xLabels: P.wageHistory.map((w) => w.label),
      series: [{ name: "Monthly wage", color: "var(--series-1)", values: P.wageHistory.map((w) => w.amount) }],
      height: 200, area: true, format: inr, tickFormat: UI.inrK, valueLabels: false, padLeft: 56
    });
  } else {
    $("#chartWage").innerHTML = `<div class="tbl-empty">${P.wageHistory.length
      ? "Reported " + inr(P.wageHistory[0].amount) + "/month. Progression appears after your next update."
      : "No income reported yet."}</div>`;
  }

  /* ---------- skills ---------- */
  $("#skillMeters").innerHTML = P.skills.length ? P.skills.map((s, i) => `
    <div class="meter-row" style="--accent:var(--series-${(i % 3) + 1})">
      <span class="meter-row__label">${esc(s.name)}</span>
      <span class="meter-row__val">${s.level === 100 ? "Certified" : "Self-declared"}</span>
      <span class="meter"><span style="width:${s.level}%"></span></span>
    </div>`).join("") : empty("No skills on record.");

  const gapRow = DB.skillGapRows().find((g) => g.course === P.course);
  const gaps = gapRow ? gapRow.gap : [];
  $("#gapTags").innerHTML = !gapRow ? '<span class="small muted">No open jobs related to your course yet, so there is nothing to compare against.</span>'
    : gaps.length ? tags(gaps, "skill-tag--gap") : '<span class="chip chip--good">Your course covers what open jobs ask for</span>';

  // other published courses that teach at least one of the gap skills
  const lower = gaps.map((g) => g.toLowerCase());
  const recs = DB.COURSES.filter((c) => c.name !== P.course)
    .map((c) => ({ c, closes: c.skills.filter((s) => lower.includes(s.toLowerCase())) }))
    .filter((r) => r.closes.length).sort((a, b) => b.closes.length - a.closes.length).slice(0, 3);
  $("#recommended").innerHTML = recs.length ? recs.map((r) => `
    <div class="list-row" style="padding:10px 0;border-bottom:1px solid var(--gridline)">
      <div class="list-row__main">
        <div class="list-row__title">${esc(r.c.name)} <span class="muted small">(${esc(r.c.code)})</span></div>
        <div class="list-row__sub">Teaches ${esc(r.closes.join(", "))}</div>
      </div>
    </div>`).join("") : '<div class="small muted">No published course covers your gap skills yet.</div>';

  /* ---------- consent (recorded at registration; changes go through the mission office) ---------- */
  $("#consentBox").innerHTML = [
    ["Track my employment outcomes", "Lets the mission measure whether the training worked."],
    ["Share my profile with companies I apply to", "Only companies whose jobs you apply to see your profile and resume."]
  ].map(([l, n]) => `<div><div style="font-weight:580">✓ ${esc(l)}</div>
      <div class="small muted" style="margin-top:4px">${esc(n)}</div></div>`).join("") +
    `<div class="small muted">To withdraw consent, contact the mission office.</div>`;
  $("#consentFoot").textContent = "Consent recorded " + date(P.journey[0].date);

  /* ---------- contact details (read-only: no self-service edit endpoint yet) ---------- */
  $("#contactForm").outerHTML = `<dl class="kv">
    <dt>Phone</dt><dd>${esc(P.phone)}</dd>
    <dt>Email</dt><dd>${esc(P.email)}</dd>
    <dt>Address / city</dt><dd>${esc(P.address)}</dd></dl>
    <div class="small muted mt-12">To change these, contact the mission office.</div>`;

  /* ---------- follow-up schedule ---------- */
  const waveMeta = { "3m": "3 months", "6m": "6 months", "12m": "12 months", "24m": "24 months" };
  const FSTAT = {
    responded:     ['<span class="chip chip--good">✓ Updated</span>', "Status updated after this milestone"],
    "no-response": ['<span class="chip chip--critical">Open</span>', "Awaiting your update"],
    scheduled:     ['<span class="chip">Scheduled</span>', "Due {d}"]
  };
  $("#followList").innerHTML = Object.keys(waveMeta).map((w) => `
    <div class="list-row">
      <div class="list-row__main">
        <div class="list-row__title">${waveMeta[w]} check</div>
        <div class="list-row__sub">${FSTAT[P.follow[w]][1].replace("{d}", date(addMonths(P.certDate, parseInt(w, 10))))}</div>
      </div>
      ${FSTAT[P.follow[w]][0]}
    </div>`).join("");

  /* ---------- notifications (derived) ---------- */
  const notes = [{ at: P.journey[0].date, kind: { 1: "good", 0: "warning", "-1": "warning" }[P.certStatus], text: "Certificate: " + CERT[P.certStatus][1] + "." }]
    .concat(apps.slice(0, 4).map((a) => ({ at: a.created, kind: a.stage === "screened_out" || a.stage === "rejected" ? "warning" : "info",
      text: `${a.title} at ${a.company}: ${STAGE[a.stage][0]}.` })));
  const NK = { good: "chip--good", warning: "chip--warning", info: "chip--info" };
  $("#notifications").innerHTML = notes.map((n) => `
    <div class="list-row">
      <span class="chip ${NK[n.kind]}"><i class="dot"></i></span>
      <div class="list-row__main">
        <div class="list-row__sub" style="color:var(--text-primary);font-size:13px">${esc(n.text)}</div>
        <div class="list-row__sub">${date(n.at)}</div>
      </div>
    </div>`).join("");

  /* ---------- applications ---------- */
  $("#apps").innerHTML = apps.length ? `<div class="table-wrap"><table><thead><tr><th>Job</th><th>Company</th>
      <th class="text-right">Certificate match</th><th class="text-right">Resume match</th><th>Missing skills</th><th>Status</th></tr></thead><tbody>` +
    apps.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.company)}</td>
      <td class="text-right tnum">${pct(a.cert_score * 100, 0)}</td><td class="text-right tnum">${pct(a.resume_score * 100, 0)}</td>
      <td>${tags(a.missing, "skill-tag--gap") || "—"}</td>
      <td><span class="chip ${STAGE[a.stage][1]}">${STAGE[a.stage][0]}</span></td></tr>`).join("") + "</tbody></table></div>"
    : empty("No applications yet. Apply to a recommended job above.");

  /* ---------- recommended jobs (round 1: certificate match) ---------- */
  async function loadJobs() {
    const r = await API.recommended();
    if (!r.ok) { $("#jobs").innerHTML = empty(r.error); return; }
    const { certVerified, jobs } = r.data;
    $("#jobs").innerHTML = !certVerified ? empty("Job recommendations start once your certificate is verified.")
      : !jobs.length ? empty("No verified company has an open role that needs skills from your course. Check back later.")
      : jobs.map((j) => `<div class="list-row"><div class="list-row__main">
          <div class="list-row__title">${esc(j.title)} · ${esc(j.company)}</div>
          <div class="list-row__sub">${esc(j.district)} · ${j.openings} opening(s)${j.salary_min ? " · " + inr(j.salary_min) + (j.salary_max ? "–" + inr(j.salary_max) : "") + "/month" : ""}
            · your certificate covers ${pct(j.certScore * 100, 0)} of required skills</div>
          <div class="mt-12">${j.skills.map((s) => tags([s], j.fromCertificate.includes(s) ? "skill-tag--have" : "")).join(" ")}</div>
          <details class="mt-12 small"><summary>Job description</summary><p style="white-space:pre-wrap">${esc(j.description)}</p></details>
        </div>
        <button class="btn ${j.applied ? "" : "btn--primary"}" data-apply="${j.id}" ${j.applied ? "disabled" : ""}>${j.applied ? "Applied" : "Apply"}</button></div>`).join("");
  }
  loadJobs();

  /* round 2 (resume screening) runs on the server when you apply */
  $("#jobs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-apply]"); if (!b) return;
    b.disabled = true;
    const r = await API.apply(b.dataset.apply);
    if (!r.ok) { toast(r.error, "bad"); b.disabled = false; return; }
    toast(r.data.stage === "screened_in" ? "Applied. Your resume passed screening."
      : "Applied, but your resume did not pass screening. Missing: " + r.data.missing.join(", "), r.data.stage === "screened_in" ? "" : "warn");
    setTimeout(() => location.reload(), 1200);
  });

  /* ---------- resume ---------- */
  $("#resume").value = P.resume || "";
  $("#resumeFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (f) $("#resume").value = await f.text();
  });
  $("#saveResume").addEventListener("click", async () => {
    const r = await API.saveResume($("#resume").value);
    toast(r.ok ? "Resume saved" : r.error, r.ok ? "" : "bad");
  });
})();
