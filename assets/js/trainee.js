/* ==========================================================================
   trainee.js — trainee profile / self-service portal
   Opens the featured record by default, or ?id=<uniqueId> from the registry.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, inrK, pct, date, esc, avatar, toast, initials } = UI;

  /* ---------- resolve which trainee to show ---------- */
  const wanted = UI.readParams().id;
  const featured = DB.TRAINEE_USER;
  let P;

  if (!wanted || wanted === featured.id) {
    P = featured;
  } else {
    const t = DB.trainees.find((x) => x.id === wanted);
    P = t ? buildProfile(t) : featured;
    if (!t) toast("Record " + wanted + " not found — showing the sample profile", "warn");
  }

  /** Synthesize a full profile view from a registry record. */
  function buildProfile(t) {
    const course = DB.COURSES.find((c) => c.name === t.course) || DB.COURSES[0];
    const gapRow = DB.skillGapRows().find((g) => g.course === t.course);
    const taught = gapRow ? gapRow.taught : ["Core skills"];
    const industry = gapRow ? gapRow.industry : taught;
    const end = addMonths(t.enrolled, course.duration);
    const placedOn = addMonths(t.enrolled, course.duration + 2);
    const placed = t.outcome !== "notplaced";

    return {
      id: t.id, initials: initials(t.name), name: t.name, gender: t.gender, age: t.age,
      phone: t.phone, altPhone: "—", email: t.email,
      district: t.district, address: t.district + ", Madhya Pradesh",
      aadhaarMasked: "XXXX XXXX " + t.id.slice(-4),
      course: t.course, courseCode: t.courseCode,
      provider: t.provider, providerId: t.providerId,
      batch: t.batch, enrolled: t.enrolled, completed: end,
      attendance: t.attendance, score: t.score, certified: t.certified,
      certId: t.certified ? "CERT-" + t.courseCode + "-" + t.batch + "-" + t.id.slice(-5) : null,
      certDate: t.certified ? end : null,
      outcome: t.outcome, employer: t.employer, employerId: t.employerId,
      role: placed ? roleFor(t) : null,
      employedSince: placed ? placedOn : null,
      startingSalary: t.startingSalary, currentSalary: t.currentSalary,
      relevance: t.relevance, verified: t.verified, consent: t.consent,
      reason: t.reason, monthsSince: t.monthsSince,
      skills: industry.slice(0, 6).map((s, i) => ({
        name: s, level: taught.includes(s) ? Math.max(40, t.score - i * 4) : Math.max(8, 30 - i * 5)
      })),
      wageHistory: placed ? [
        { label: "At placement", month: date(placedOn), amount: t.startingSalary },
        { label: "6-month",  month: date(addMonths(placedOn, 6)),  amount: Math.round((t.startingSalary + (t.currentSalary - t.startingSalary) * 0.45) / 100) * 100 },
        { label: "Current",  month: "Sep 2026", amount: t.currentSalary },
        { label: "Projected 12m", month: date(addMonths(placedOn, 12)), amount: Math.round(t.currentSalary * 1.08 / 100) * 100, projected: true }
      ] : [],
      journey: journeyFor(t, course, end, placedOn),
      pendingSurvey: dueSurvey(t),
      notifications: [
        { at: "2026-09-16", kind: placed ? "good" : "warning",
          text: placed ? "Your employment record is on file. Report any change in job or salary."
                       : "You are marked as not yet placed. New openings matching your course are listed in the employer portal." },
        { at: "2026-09-02", kind: "info", text: "Follow-up survey window for your batch opens this month." }
      ],
      followRaw: t.follow
    };
  }

  function roleFor(t) {
    const map = {
      "Web Development": "Junior Web Developer", "Data Analytics": "Data Analyst Trainee",
      "Electrician": "Site Electrician", "Welding Technician": "Welder — Grade II",
      "Healthcare Assistant": "Patient Care Assistant", "Retail Sales Associate": "Sales Associate",
      "Automotive Service Tech": "Service Technician", "Beauty & Wellness": "Beauty Therapist",
      "Solar PV Technician": "Solar Installation Technician", "Apparel / Machine Operator": "Machine Operator"
    };
    const base = map[t.course] || "Trainee";
    return t.outcome === "apprentice" ? "Apprentice — " + base
         : t.outcome === "self" ? "Self-employed — " + base : base;
  }

  function addMonths(iso, m) {
    const d = new Date(iso + "T00:00:00");
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  }

  function journeyFor(t, course, end, placedOn) {
    const placed = t.outcome !== "notplaced";
    const j = [
      { stage: "Registration & consent", date: t.enrolled, status: "done",
        note: `Unique ID ${t.id} issued. ${t.consent ? "Consent granted for outcome tracking (24 months)." : "Consent withdrawn — only aggregate, de-identified data is retained."}` },
      { stage: "Enrolment", date: t.enrolled, status: "done",
        note: `${t.course} (${course.duration} months) at ${t.provider}, ${t.district} centre.` },
      { stage: "Attendance", date: end, status: "done", note: `${t.attendance}% attendance recorded across the course.` },
      { stage: "Assessment", date: end, status: "done", note: `Final assessment score ${t.score}/100.` },
      { stage: "Certification", date: end, status: t.certified ? "done" : "blocked",
        note: t.certified ? "NSQF certificate issued." : "Not certified — attendance or assessment threshold not met." }
    ];
    if (placed) {
      j.push({ stage: "Placement linkage", date: placedOn, status: "done",
        note: `${t.outcome === "self" ? "Started own work" : "Joined " + (t.employer || "an employer")} as ${roleFor(t)}. ` +
              (t.verified ? "Verified by employer." : "Employer verification pending.") });
    } else {
      j.push({ stage: "Placement linkage", date: placedOn, status: "blocked",
        note: "No placement recorded. Reason reported: " +
              (DB.NON_PLACEMENT_REASONS.find((r) => r.code === t.reason) || {}).label + "." });
    }
    [["3-month follow-up", 3], ["6-month follow-up", 6], ["12-month follow-up", 12], ["24-month follow-up", 24]].forEach(([label, m]) => {
      const due = t.monthsSince >= m;
      const key = m + "m";
      const st = t.follow[key];
      j.push({ stage: label, date: addMonths(placedOn, m),
        status: !due ? "upcoming" : st === "no-response" ? "blocked" : "done",
        note: !due ? "Scheduled." : st === "responded" ? "Responded via app / SMS."
              : st === "assisted" ? "Captured through an assisted call." : "No response — assisted call queued." });
    });
    return j;
  }

  function dueSurvey(t) {
    const open = ["3m", "6m", "12m", "24m"].find((w) => t.follow[w] === "no-response");
    if (!open) return null;
    return [
      { q: "Are you currently working?", type: "yesno" },
      { q: "What is your current monthly take-home salary?", type: "amount" },
      { q: "How relevant was your training to this work?", type: "scale" }
    ];
  }

  /* ---------- shell ---------- */
  UI.renderShell({
    title: "Trainee profile",
    crumb: P.id + " · " + P.course,
    user: { name: P.name, role: "Trainee" }
  });
  UI.initDemoActions();

  const OUT = UI.OUTCOME_META[P.outcome];

  /* ---------- hero ---------- */
  $("#profileHero").innerHTML = `
    <div class="card__body" style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      <span class="avatar avatar--lg" style="background:${UI.avatarColor(P.name)}">${esc(P.initials || initials(P.name))}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div class="row">
          <h1 style="font-size:22px">${esc(P.name)}</h1>
          <span class="chip ${OUT.chip}"><i class="dot"></i>${OUT.label}</span>
          ${P.certified ? '<span class="chip chip--good">✓ Certified</span>' : '<span class="chip chip--warning">Not certified</span>'}
          ${P.consent ? '<span class="chip chip--brand">Consent active</span>' : '<span class="chip chip--critical">Consent withdrawn</span>'}
        </div>
        <div class="row mt-12" style="gap:22px;font-size:13px">
          <div><div class="muted small">Unique ID</div><div class="tbl__id" style="font-size:13px">${P.id}</div></div>
          <div><div class="muted small">Course</div><div>${esc(P.course)}</div></div>
          <div><div class="muted small">Provider</div><div>${esc(P.provider)}</div></div>
          <div><div class="muted small">Batch</div><div>${esc(P.batch)}</div></div>
          <div><div class="muted small">District</div><div>${esc(P.district)}</div></div>
          <div><div class="muted small">Aadhaar (masked)</div><div>${esc(P.aadhaarMasked)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" data-demo="Skill passport PDF generated — includes certificate, assessment and verified employment history.">⭳ Skill passport</button>
        <a class="btn" href="notifications.html">Notifications</a>
        <a class="btn btn--primary" href="outcome.html?id=${encodeURIComponent(P.id)}">Update my outcome</a>
      </div>
    </div>`;

  /* ---------- pending survey ---------- */
  if (P.pendingSurvey && P.pendingSurvey.length) {
    $("#surveyMount").innerHTML = `
      <div class="card" style="border-color:var(--warning)">
        <div class="card__head" style="background:var(--warning-soft)">
          <div><h3>⏱ Your follow-up survey is open</h3>
            <div class="card__sub">3 questions · about 40 seconds · keeps your outcome record verified</div></div>
        </div>
        <div class="card__body">
          <form class="grid grid--3" id="surveyForm" style="align-items:end">
            ${P.pendingSurvey.map((q, i) => `
              <div class="field">
                <label for="sq${i}">${esc(q.q)}</label>
                ${q.type === "yesno"
                  ? `<select class="select" id="sq${i}"><option>Yes — same employer</option><option>Yes — different employer</option><option>No — not working</option></select>`
                  : q.type === "amount"
                  ? `<input class="input" id="sq${i}" inputmode="numeric" placeholder="₹ per month" value="${P.currentSalary || ""}">`
                  : `<select class="select" id="sq${i}"><option>5 — Highly relevant</option><option>4 — Relevant</option><option>3 — Somewhat</option><option>2 — Barely</option><option>1 — Not at all</option></select>`}
              </div>`).join("")}
          </form>
          <div class="row mt-16">
            <button class="btn btn--primary" id="submitSurvey">Submit response</button>
            <button class="btn btn--ghost" data-demo="Reminder snoozed for 7 days.">Remind me later</button>
            <span class="muted small">Your answers are visible to the mission office in aggregate; wage figures are never shown against your name publicly.</span>
          </div>
        </div>
      </div>`;
    $("#submitSurvey").addEventListener("click", () => {
      $("#surveyMount").innerHTML = `
        <div class="banner banner--good">
          <span class="banner__ico">✓</span>
          <div><strong>Follow-up recorded — thank you.</strong>
          Your record is verified for this wave. The next check is scheduled automatically.</div>
        </div>`;
      toast("Follow-up response saved");
    });
  }

  /* ---------- stat tiles ---------- */
  const placed = P.outcome !== "notplaced";
  const growth = placed && P.startingSalary ? ((P.currentSalary - P.startingSalary) / P.startingSalary) * 100 : 0;
  $("#traineeStats").innerHTML = [
    { l: "Attendance", v: P.attendance + "%", m: "course requirement: 70%", a: "var(--series-1)" },
    { l: "Assessment score", v: P.score + "/100", m: P.certified ? "certified" : "below certification threshold", a: "var(--series-3)" },
    { l: "Current monthly wage", v: placed ? inr(P.currentSalary) : "—",
      m: placed ? `<span class="delta ${growth >= 0 ? "delta--up" : "delta--down"}">▲ ${growth.toFixed(0)}%</span> since placement` : "no wage recorded",
      a: "var(--series-4)" },
    { l: "Months tracked", v: String(P.monthsSince != null ? P.monthsSince : 20), m: "of the 24-month tracking window", a: "var(--series-7)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");

  /* ---------- journey timeline ---------- */
  const DOT = { done: "var(--good)", active: "var(--warning)", upcoming: "var(--baseline)", blocked: "var(--critical)" };
  const doneCount = P.journey.filter((j) => j.status === "done").length;
  $("#journeyProgress").textContent = doneCount + " of " + P.journey.length + " stages complete";
  $("#journey").innerHTML = P.journey.map((j) => `
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
                 : '<span class="chip chip--warning">Verification pending</span>';

  $("#employmentKV").innerHTML = placed ? `
    <dt>Status</dt><dd>${OUT.label}</dd>
    <dt>Employer</dt><dd>${esc(P.employer || "Self-employed")}</dd>
    <dt>Role</dt><dd>${esc(P.role || "—")}</dd>
    <dt>Working since</dt><dd>${date(P.employedSince)}</dd>
    <dt>Starting salary</dt><dd class="tnum">${inr(P.startingSalary)} / month</dd>
    <dt>Current salary</dt><dd class="tnum">${inr(P.currentSalary)} / month</dd>
    <dt>Training relevance</dt><dd>${"★".repeat(P.relevance)}${"☆".repeat(5 - P.relevance)} <span class="muted small">(${P.relevance}/5)</span></dd>
    <dt>Retention</dt><dd>${P.monthsSince >= 12 ? "Retained past 12 months" : "Within first 12 months"}</dd>`
    : `<dt>Status</dt><dd>Not placed</dd>
       <dt>Reason reported</dt><dd>${esc((DB.NON_PLACEMENT_REASONS.find((r) => r.code === P.reason) || { label: "Not reported" }).label)}</dd>
       <dt>Support offered</dt><dd>Bridge module + interview readiness sprint</dd>
       <dt>Open roles nearby</dt><dd>7 matching your course in ${esc(P.district)}</dd>`;

  $("#employmentFoot").innerHTML = placed
    ? `<span>Linked to employer record ${esc(P.employerId || "—")}. Any change you report is sent to the employer for confirmation before it updates outcome statistics.</span>`
    : `<span>You will be contacted at the next follow-up wave. Update your contact details to make sure the call reaches you.</span>`;

  if (placed && P.wageHistory.length) {
    Viz.line($("#chartWage"), {
      xLabels: P.wageHistory.map((w) => w.label),
      series: [{
        name: "Monthly wage", color: "var(--series-1)",
        values: P.wageHistory.map((w) => w.amount)
      }],
      height: 200, area: true, format: inr, tickFormat: inrK, valueLabels: false, padLeft: 56
    });
    $("#wageLegend").innerHTML =
      `<div class="small muted mt-12">Dotted final point is a projection from the cohort's average progression curve.
       Cohort average at this stage: <b class="tnum">${inr(DB.summarise(DB.trainees.filter((t) => t.course === P.course)).avgStartingSalary)}</b> at placement.</div>`;
  } else {
    $("#chartWage").innerHTML = `<div class="tbl-empty">No wage history yet — it starts at your first verified placement.</div>`;
  }

  /* ---------- skills ---------- */
  const gapRow = DB.skillGapRows().find((g) => g.course === P.course);
  $("#skillMeters").innerHTML = P.skills.map((s, i) => `
    <div class="meter-row" style="--accent:var(--series-${(i % 3) + 1})">
      <span class="meter-row__label">${esc(s.name)}</span>
      <span class="meter-row__val">${s.level}%</span>
      <span class="meter"><span style="width:${s.level}%"></span></span>
    </div>`).join("");

  $("#gapTags").innerHTML = gapRow && gapRow.gap.length
    ? gapRow.gap.map((g) => `<span class="skill-tag skill-tag--gap">${esc(g)}</span>`).join("")
    : '<span class="chip chip--good">Your course covers current industry demand</span>';

  const recs = (gapRow ? gapRow.gap : []).slice(0, 3).map((g, i) => ({
    name: g + " — short module", weeks: 3 + i, mode: i % 2 ? "Weekend batch" : "Online + lab",
    centre: P.provider
  }));
  $("#recommended").innerHTML = recs.length ? recs.map((r) => `
    <div class="list-row" style="padding:10px 0;border-bottom:1px solid var(--gridline)">
      <div class="list-row__main">
        <div class="list-row__title">${esc(r.name)}</div>
        <div class="list-row__sub">${r.weeks} weeks · ${esc(r.mode)} · ${esc(r.centre)}</div>
      </div>
      <button class="btn btn--sm" data-demo="Seat request sent to ${esc(r.centre)}.">Request seat</button>
    </div>`).join("")
    : '<div class="small muted">No bridge modules needed right now.</div>';

  /* ---------- consent ---------- */
  const CONSENTS = [
    { id: "track", label: "Track my employment outcomes", on: P.consent,
      note: "Lets the mission measure whether the training worked. Without this your record is counted only as an anonymous total." },
    { id: "contact", label: "Contact me for follow-ups", on: P.consent,
      note: "SMS, WhatsApp and app notifications at 3m, 6m, 1y and 2y." },
    { id: "employer", label: "Share my record with verified employers", on: true,
      note: "Employers you apply to can see your certificate and assessment score — never your wage history." },
    { id: "research", label: "Use my anonymised data for research", on: false,
      note: "De-identified records only; cannot be traced back to you." }
  ];
  $("#consentBox").innerHTML = CONSENTS.map((c) => `
    <div>
      <label class="switch">
        <input type="checkbox" id="c-${c.id}" ${c.on ? "checked" : ""}>
        <span class="switch__track"></span>
        <span style="font-weight:580">${esc(c.label)}</span>
      </label>
      <div class="small muted" style="margin-top:4px;padding-left:45px">${esc(c.note)}</div>
    </div>`).join("") +
    `<button class="btn btn--danger btn--sm" id="revokeAll" style="align-self:flex-start">Withdraw all consent</button>`;

  $("#consentBox").addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox]")) {
      toast("Consent preference saved — takes effect immediately");
    }
  });
  $("#revokeAll").addEventListener("click", () => {
    $$("#consentBox input[type=checkbox]").forEach((c) => { c.checked = false; });
    toast("All consent withdrawn. Your record will be de-identified within 30 days.", "warn");
  });

  /* ---------- contact form ---------- */
  $("#contactForm").innerHTML = `
    <div class="field"><label for="ctPhone">Primary phone</label>
      <input class="input" id="ctPhone" value="${esc(P.phone)}">
      <span class="hint">Most follow-ups fail because this number changed.</span></div>
    <div class="field"><label for="ctAlt">Alternate phone (family / friend)</label>
      <input class="input" id="ctAlt" value="${esc(P.altPhone || "")}" placeholder="+91 …"></div>
    <div class="field"><label for="ctEmail">Email</label>
      <input class="input" id="ctEmail" value="${esc(P.email)}"></div>
    <div class="field"><label for="ctAddr">Current address / city</label>
      <input class="input" id="ctAddr" value="${esc(P.address)}">
      <span class="hint">Tell us if you move for work — it changes which district your outcome counts in.</span></div>
    <button class="btn btn--primary" type="submit">Save contact details</button>`;
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Contact details updated · OTP sent to verify the new number");
  });

  /* ---------- follow-up schedule ---------- */
  const waveMeta = { "3m": "3 months", "6m": "6 months", "12m": "12 months", "24m": "24 months" };
  const raw = P.followRaw || { "3m": "responded", "6m": "no-response", "12m": "scheduled", "24m": "scheduled" };
  const FSTAT = {
    responded:     ['<span class="chip chip--good">✓ Responded</span>', "Captured via app"],
    assisted:      ['<span class="chip chip--warning">Assisted call</span>', "Captured by the call centre"],
    "no-response": ['<span class="chip chip--critical">Open</span>', "Awaiting your response"],
    scheduled:     ['<span class="chip">Scheduled</span>', "Not yet due"]
  };
  $("#followList").innerHTML = Object.keys(waveMeta).map((w) => `
    <div class="list-row">
      <div class="list-row__main">
        <div class="list-row__title">${waveMeta[w]} check</div>
        <div class="list-row__sub">${FSTAT[raw[w]][1]}</div>
      </div>
      ${FSTAT[raw[w]][0]}
    </div>`).join("");

  /* ---------- notifications ---------- */
  const NK = { good: "chip--good", warning: "chip--warning", info: "chip--info" };
  $("#notifications").innerHTML = P.notifications.map((n) => `
    <div class="list-row">
      <span class="chip ${NK[n.kind]}"><i class="dot"></i></span>
      <div class="list-row__main">
        <div class="list-row__sub" style="color:var(--text-primary);font-size:13px">${esc(n.text)}</div>
        <div class="list-row__sub">${date(n.at)}</div>
      </div>
    </div>`).join("");
})();
