/* ==========================================================================
   employer.js — employer portal: verify, hire, post, report skill demand
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, inrK, pct, date, esc, avatar, toast } = UI;

  const CO = DB.EMPLOYER_USER;
  const hires = DB.trainees.filter((t) => t.employerId === CO.id);

  UI.renderShell({
    title: "Employer portal",
    crumb: CO.name + " · " + CO.district + " · GSTIN " + CO.gstin,
    user: { name: CO.contact, role: "Employer — " + CO.name }
  });
  UI.initTabs();
  UI.initDemoActions();

  /* ---------- hero ---------- */
  $("#companyHero").innerHTML = `
    <div class="card__body" style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      <span class="avatar avatar--lg" style="background:${UI.avatarColor(CO.name)}">${esc(CO.initials)}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div class="row">
          <h1 style="font-size:22px">${esc(CO.name)}</h1>
          ${CO.verified ? '<span class="chip chip--good">✓ Verified employer</span>'
                        : '<span class="chip chip--warning">Verification pending</span>'}
          <span class="chip">${esc(CO.sector)}</span>
          <span class="chip">${esc(CO.size)} employees</span>
        </div>
        <div class="row mt-12" style="gap:22px;font-size:13px">
          <div><div class="muted small">Employer ID</div><div class="tbl__id" style="font-size:13px">${CO.id}</div></div>
          <div><div class="muted small">GSTIN</div><div class="tnum">${esc(CO.gstin)}</div></div>
          <div><div class="muted small">Primary contact</div><div>${esc(CO.contact)} · ${esc(CO.contactRole)}</div></div>
          <div><div class="muted small">On platform since</div><div>${date(CO.onboarded)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" data-demo="Talent search opened — 214 certified trainees match your open roles.">⌕ Search talent pool</button>
        <button class="btn btn--primary" id="goPost">+ Post an opening</button>
      </div>
    </div>`;
  $("#goPost").addEventListener("click", () => {
    $$("#mainTabs .tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.tab === "jobs"));
    $$(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== "jobs"; });
    $("#jTitle").focus();
  });

  /* ---------- stat tiles ---------- */
  const hs = DB.summarise(hires);
  const pending = DB.VERIFY_REQUESTS.filter((r) => r.status === "pending").length;
  const openJobs = DB.JOB_POSTINGS.filter((j) => j.status === "open");
  $("#employerStats").innerHTML = [
    { l: "Hires from the platform", v: num(hires.length), m: "across " + new Set(hires.map((h) => h.course)).size + " courses", a: "var(--series-1)" },
    { l: "Pending verifications", v: String(pending), m: "blocking outcome counts", a: "var(--series-2)" },
    { l: "12-month retention", v: pct(hs.retention12m, 0), m: "of hires placed 12+ months ago", a: "var(--series-3)" },
    { l: "Open positions", v: String(openJobs.reduce((s, j) => s + j.openings, 0)), m: openJobs.length + " live postings", a: "var(--series-4)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");

  /* ======================================================================
     Verification requests
     ====================================================================== */
  const requests = DB.VERIFY_REQUESTS.map((r) => Object.assign({}, r));
  const RSTAT = {
    pending:   '<span class="chip chip--warning"><i class="dot"></i>Pending</span>',
    confirmed: '<span class="chip chip--good"><i class="dot"></i>Confirmed</span>',
    disputed:  '<span class="chip chip--critical"><i class="dot"></i>Disputed</span>'
  };
  function renderRequests() {
    $("#verifyTable tbody").innerHTML = requests.map((r) => `
      <tr>
        <td class="tbl__id">${r.id}</td>
        <td><div class="person">${avatar(r.trainee)}<div>
              <div class="person__name">${esc(r.trainee)}</div>
              <div class="person__meta">raised ${date(r.raised)}</div></div></div></td>
        <td class="tbl__id">${r.traineeId}</td>
        <td>${esc(r.role)}</td>
        <td class="tnum">${date(r.since)}</td>
        <td class="num">${inr(r.salary)}</td>
        <td>${RSTAT[r.status]}</td>
        <td class="text-right nowrap">
          ${r.status === "pending" ? `
            <button class="btn btn--sm btn--primary" data-act="confirm" data-id="${r.id}">Confirm</button>
            <button class="btn btn--sm btn--danger" data-act="dispute" data-id="${r.id}">Dispute</button>`
            : `<span class="muted small">${r.status === "confirmed" ? "counted as an outcome" : "with mission office"}</span>`}
        </td>
      </tr>`).join("");
    $("#confirmAll").disabled = !requests.some((r) => r.status === "pending");
  }
  $("#verifyTable").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const r = requests.find((x) => x.id === b.dataset.id);
    r.status = b.dataset.act === "confirm" ? "confirmed" : "disputed";
    renderRequests();
    toast(b.dataset.act === "confirm"
      ? `${r.trainee} confirmed — outcome now counts towards state placement statistics`
      : `${r.trainee} disputed — sent to the validation queue`, b.dataset.act === "confirm" ? "good" : "warn");
  });
  $("#confirmAll").addEventListener("click", () => {
    const n = requests.filter((r) => r.status === "pending").length;
    requests.forEach((r) => { if (r.status === "pending") r.status = "confirmed"; });
    renderRequests();
    toast(n + " employment records confirmed");
  });
  renderRequests();

  /* ---------- exit / revision form ---------- */
  $("#exTrainee").innerHTML = hires.slice(0, 40)
    .map((h) => `<option value="${h.id}">${esc(h.name)} — ${h.id}</option>`).join("");
  $("#exitForm").addEventListener("submit", (e) => {
    e.preventDefault();
    toast("Update submitted — retention and wage figures will refresh in tonight's run");
    e.target.reset();
  });

  /* ======================================================================
     Hires tab
     ====================================================================== */
  const byCourse = DB.breakdown(hires, "course");
  Viz.barV($("#chartHireCourse"), {
    items: byCourse.slice(0, 8).map((c) => ({ label: c.key.replace(/ \/.*/, ""), value: c.total })),
    height: 240, color: "var(--series-1)", valueLabels: true, valueName: "Hires", format: num
  });

  const milestones = [3, 6, 12, 24];
  const retSeries = milestones.map((m) => {
    const eligible = hires.filter((h) => h.monthsSince >= m);
    if (!eligible.length) return null;
    const still = eligible.filter((h) => h.retained12m !== false || m < 12).length;
    return Math.round((still / eligible.length) * 100);
  });
  const benchmark = milestones.map((m) => {
    const eligible = DB.trainees.filter((t) => t.outcome === "employed" && t.monthsSince >= m);
    if (!eligible.length) return null;
    const still = eligible.filter((t) => t.retained12m !== false || m < 12).length;
    return Math.round((still / eligible.length) * 100);
  });
  Viz.line($("#chartRetention"), {
    xLabels: milestones.map((m) => m + "m"),
    series: [
      { name: CO.name, color: "var(--series-1)", values: retSeries },
      { name: "State average", color: "var(--series-2)", values: benchmark, dashed: true }
    ],
    height: 240, yMax: 100, format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%", padLeft: 44
  });
  Viz.legend($("#retentionLegend"), [
    { label: CO.name, color: "var(--series-1)" },
    { label: "State average (all employers)", color: "var(--series-2)" }
  ]);

  let hireQuery = "", hirePage = 1;
  function renderHires() {
    let list = hires;
    if (hireQuery) {
      const q = hireQuery.toLowerCase();
      list = list.filter((h) => (h.name + " " + h.id).toLowerCase().includes(q));
    }
    const p = UI.paginate(list, 10, hirePage);
    hirePage = p.page;
    $("#hiresCount").textContent = num(list.length) + " employees hired through the platform";
    $("#hiresTable tbody").innerHTML = p.slice.length ? p.slice.map((h) => `
      <tr>
        <td><div class="person">${avatar(h.name)}<div>
              <div class="person__name">${esc(h.name)}</div>
              <div class="person__meta">${esc(h.district)} · ${h.batch}</div></div></div></td>
        <td class="tbl__id">${h.id}</td>
        <td>${esc(h.course)}</td>
        <td>${esc(h.provider)}</td>
        <td class="num">${h.score}</td>
        <td class="num">${inr(h.startingSalary)}</td>
        <td class="num">${inr(h.currentSalary)}</td>
        <td>${h.retained12m === null ? '<span class="chip">&lt; 12 months</span>'
              : h.retained12m ? '<span class="chip chip--good">Retained</span>'
                              : '<span class="chip chip--critical">Exited</span>'}</td>
        <td>${h.verified ? '<span class="chip chip--good">✓</span>' : '<span class="chip chip--warning">Pending</span>'}</td>
      </tr>`).join("")
      : `<tr><td colspan="9" class="tbl-empty">No matching employees.</td></tr>`;
    $("#hiresPager").innerHTML = UI.pagerHTML(p, "hire");
    const prev = $("#hirePrev"), next = $("#hireNext");
    if (prev) prev.onclick = () => { hirePage--; renderHires(); };
    if (next) next.onclick = () => { hirePage++; renderHires(); };
  }
  $("#hireSearch").addEventListener("input", (e) => { hireQuery = e.target.value; hirePage = 1; renderHires(); });
  $("#exportHires").addEventListener("click", () => UI.exportCSV("platform-hires.csv",
    ["Unique ID", "Name", "Course", "Provider", "District", "Batch", "Assessment", "Starting", "Current", "Retained 12m", "Verified"],
    hires.map((h) => [h.id, h.name, h.course, h.provider, h.district, h.batch, h.score,
      h.startingSalary, h.currentSalary, h.retained12m == null ? "n/a" : h.retained12m ? "Yes" : "No", h.verified ? "Yes" : "No"])));
  renderHires();

  /* ======================================================================
     Jobs tab
     ====================================================================== */
  const jobs = DB.JOB_POSTINGS.map((j) => Object.assign({}, j));
  function renderJobs() {
    $("#jobList").innerHTML = jobs.map((j) => `
      <div class="list-row">
        <div class="list-row__main">
          <div class="list-row__title">${esc(j.title)}
            <span class="chip ${j.status === "open" ? "chip--good" : ""}" style="margin-left:6px">${j.status}</span></div>
          <div class="list-row__sub">${j.openings} openings · ${esc(j.district)} · ${esc(j.salary)} · posted ${date(j.posted)}</div>
          <div class="row row--tight" style="margin-top:6px">
            ${j.skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div>
        </div>
        <div class="text-right">
          <div style="font-size:19px;font-weight:700">${j.applicants}</div>
          <div class="muted small">applicants</div>
        </div>
        <button class="btn btn--sm" data-demo="${j.applicants} matched trainees shown with certificate and assessment scores.">View matches</button>
      </div>`).join("");
  }
  $("#jDistrict").innerHTML = DB.DISTRICTS.map((d) =>
    `<option ${d.name === CO.district ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  $("#jobForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const skills = $("#jSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
    jobs.unshift({
      id: "JOB-" + (2211 + jobs.length), title: $("#jTitle").value || "Untitled role",
      openings: Number($("#jOpen").value) || 1, skills: skills.length ? skills : ["Not specified"],
      district: $("#jDistrict").value,
      salary: "₹" + Number($("#jMin").value || 0).toLocaleString("en-IN") + " – ₹" + Number($("#jMax").value || 0).toLocaleString("en-IN"),
      posted: "2026-09-17", applicants: 0, status: "open"
    });
    renderJobs();
    e.target.reset();
    $("#jDistrict").value = CO.district;
    toast("Opening published · skills added to the state skill-demand index");
  });
  renderJobs();

  /* ======================================================================
     Skill demand tab
     ====================================================================== */
  const sectorCourses = DB.skillGapRows().filter((g) => {
    const c = DB.COURSES.find((x) => x.name === g.course);
    return c && c.sector === CO.sector;
  });
  const gapRow = sectorCourses[0] || DB.skillGapRows()[0];

  $("#dCourse").innerHTML = DB.skillGapRows()
    .map((g) => `<option ${g.course === gapRow.course ? "selected" : ""}>${esc(g.course)}</option>`).join("");

  function renderSkillChoices(courseName) {
    const row = DB.skillGapRows().find((g) => g.course === courseName) || gapRow;
    $("#skillChoices").innerHTML = row.industry.map((s, i) => `
      <label class="skill-tag" style="cursor:pointer">
        <input type="checkbox" ${i < 4 ? "checked" : ""} style="margin:0">${esc(s)}
      </label>`).join("");
    return row;
  }
  function renderSectorGap(courseName) {
    const row = renderSkillChoices(courseName);
    Viz.barH($("#chartSectorGap"), {
      items: row.industry.map((s) => ({
        label: s,
        value: row.taught.includes(s) ? 100 : 0,
        color: row.taught.includes(s) ? "var(--series-3)" : "var(--series-8)"
      })),
      rowHeight: 30, labelWidth: 150, format: (v) => v + "%",
      valueName: "Curriculum coverage",
      endLabel: (d) => (d.value ? "Taught" : "Gap")
    });
    $("#sectorGapNote").innerHTML = `
      <div class="banner ${row.coverage < 70 ? "banner--warning" : "banner--good"}">
        <span class="banner__ico">${row.coverage < 70 ? "!" : "✓"}</span>
        <div><strong>${esc(row.course)} — ${pct(row.coverage, 0)} curriculum coverage</strong>
          ${row.gap.length
            ? "Providers do not currently teach: " + row.gap.map(esc).join(", ") +
              ". Your submission adds weight to the curriculum review request."
            : "Everything your sector asks for is already in the curriculum."}</div>
      </div>`;
  }
  $("#dCourse").addEventListener("change", (e) => renderSectorGap(e.target.value));
  renderSectorGap(gapRow.course);

  $("#demandForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const picked = $$("#skillChoices input:checked").length;
    toast(picked + " skills submitted for " + $("#dCourse").value + " — routed to the curriculum review committee");
  });

  /* ======================================================================
     Account tab
     ====================================================================== */
  $("#companyKV").innerHTML = `
    <dt>Legal name</dt><dd>${esc(CO.name)}</dd>
    <dt>Employer ID</dt><dd class="tbl__id">${CO.id}</dd>
    <dt>GSTIN</dt><dd class="tnum">${esc(CO.gstin)} ${CO.verified ? '<span class="chip chip--good">verified</span>' : '<span class="chip chip--warning">unverified</span>'}</dd>
    <dt>Sector</dt><dd>${esc(CO.sector)}</dd>
    <dt>Headcount band</dt><dd>${esc(CO.size)}</dd>
    <dt>District</dt><dd>${esc(CO.district)}</dd>
    <dt>Registered address</dt><dd>${esc(CO.address)}</dd>
    <dt>Website</dt><dd>${esc(CO.website)}</dd>
    <dt>Primary contact</dt><dd>${esc(CO.contact)} · ${esc(CO.contactRole)}</dd>
    <dt>Email</dt><dd>${esc(CO.email)}</dd>
    <dt>Phone</dt><dd>${esc(CO.phone)}</dd>
    <dt>Employer rating</dt><dd>${"★".repeat(Math.round(CO.rating))}${"☆".repeat(5 - Math.round(CO.rating))} <span class="muted small">(${CO.rating}/5, from ${num(hires.length)} placements)</span></dd>`;

  const users = [
    { name: CO.contact, role: "Owner — can confirm outcomes", email: CO.email, last: "2026-09-17 09:40" },
    { name: "Ishita Bhargava", role: "HR executive — can confirm outcomes", email: "ishita@aaravtech.in", last: "2026-09-16 17:02" },
    { name: "Nikhil Rao", role: "Read only", email: "nikhil@aaravtech.in", last: "2026-09-09 11:24" }
  ];
  $("#portalUsers").innerHTML = users.map((u) => `
    <div class="list-row">
      ${avatar(u.name)}
      <div class="list-row__main">
        <div class="list-row__title">${esc(u.name)}</div>
        <div class="list-row__sub">${esc(u.role)} · ${esc(u.email)}</div>
      </div>
      <div class="text-right"><div class="muted small">last active</div>
        <div class="small tnum">${esc(u.last)}</div></div>
    </div>`).join("");

  $("#apiBox").innerHTML = `
    <div class="field"><label>API key</label>
      <div class="row row--tight">
        <input class="input" value="${esc(CO.apiKey)}" readonly style="flex:1">
        <button class="btn btn--sm" data-demo="API key copied to clipboard.">Copy</button>
        <button class="btn btn--sm btn--danger" data-demo="Key rotated. The previous key stops working in 24 hours.">Rotate</button>
      </div>
      <span class="hint">Send joinings, exits and salary revisions to <code>POST /v1/employment-events</code>.</span>
    </div>
    <div class="banner">
      <span class="banner__ico">◔</span>
      <div><strong>Last sync</strong> 17 Sep 2026, 03:10 IST — 38 events received, 2 rejected (unknown trainee ID).</div>
    </div>`;
})();
