/* ==========================================================================
   employer.js — employer portal: verify claims, see hires, post jobs, screen applicants
   Everything comes from DB (real records, /api/db) and writes go through API.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, pct, date, esc, avatar, toast } = UI;

  const CO = DB.EMPLOYER_USER;
  const hires = DB.trainees.filter((t) => t.employerId === CO.id);
  const reloadSoon = () => setTimeout(() => location.reload(), 700);
  const emptyState = (title, body) =>
    `<div class="empty"><div class="empty__title">${esc(title)}</div>${body ? `<div class="empty__body">${esc(body)}</div>` : ""}</div>`;

  UI.renderShell({
    title: "Employer portal",
    crumb: CO.name + " · " + CO.district + " · GSTIN " + CO.gstin,
    user: { name: CO.contact, role: "Employer — " + CO.name }
  });
  UI.initTabs();

  if (!CO.verified) {
    $("#verifyBanner").innerHTML = `<div class="banner banner--warning" style="margin-bottom:16px"><span class="banner__ico">!</span>
      <div><strong>GSTIN verification pending.</strong> The mission office is checking ${esc(CO.gstin)} on the GST portal.
        You can post jobs now; they go live to trainees after verification.</div></div>`;
  }

  /* ---------- hero ---------- */
  $("#companyHero").innerHTML = `
    <div class="card__body" style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      <span class="avatar avatar--lg" style="background:${UI.avatarColor(CO.name)}">${esc(CO.initials)}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div class="row">
          <h1 style="font-size:22px">${esc(CO.name)}</h1>
          ${CO.verified ? '<span class="chip chip--good">✓ Verified employer</span>'
                        : '<span class="chip chip--warning">Verification pending</span>'}
        </div>
        <div class="row mt-12" style="gap:22px;font-size:13px">
          <div><div class="muted small">Employer ID</div><div class="tbl__id" style="font-size:13px">${CO.id}</div></div>
          <div><div class="muted small">GSTIN</div><div class="tnum">${esc(CO.gstin)}</div></div>
          <div><div class="muted small">Primary contact</div><div>${esc(CO.contact)}</div></div>
          <div><div class="muted small">On platform since</div><div>${date(CO.onboarded)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px"><button class="btn btn--primary" id="goPost">+ Post an opening</button></div>
    </div>`;
  $("#goPost").addEventListener("click", () => {
    $$("#mainTabs .tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.tab === "jobs"));
    $$(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== "jobs"; });
    $("#jTitle").focus();
  });

  /* ---------- stat tiles ---------- */
  const pending = DB.VERIFY_REQUESTS.filter((r) => r.status === "pending").length;
  const openJobs = DB.JOB_POSTINGS.filter((j) => j.status === "open");
  const applicants = DB.JOB_POSTINGS.reduce((s, j) => s + j.applicants, 0);
  $("#employerStats").innerHTML = [
    { l: "Hires from the platform", v: num(hires.length), m: "across " + new Set(hires.map((h) => h.course)).size + " courses", a: "var(--series-1)" },
    { l: "Pending verifications", v: num(pending), m: "employment claims to confirm", a: "var(--series-2)" },
    { l: "Applications received", v: num(applicants), m: "across all your postings", a: "var(--series-3)" },
    { l: "Open positions", v: num(openJobs.reduce((s, j) => s + j.openings, 0)), m: openJobs.length + " live postings", a: "var(--series-4)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");
  if (pending) { $("#verifyBadge").textContent = pending; $("#verifyBadge").hidden = false; }

  /* ======================================================================
     Verification requests: trainees who said they work here
     ====================================================================== */
  const RSTAT = {
    pending:   '<span class="chip chip--warning"><i class="dot"></i>Pending</span>',
    confirmed: '<span class="chip chip--good"><i class="dot"></i>Confirmed</span>',
    disputed:  '<span class="chip chip--critical"><i class="dot"></i>Disputed</span>'
  };
  const requests = DB.VERIFY_REQUESTS;
  $("#verifyTable tbody").innerHTML = requests.length ? requests.map((r) => `
    <tr>
      <td class="tbl__id">${r.id}</td>
      <td><div class="person">${avatar(r.trainee)}<div>
            <div class="person__name">${esc(r.trainee)}</div>
            <div class="person__meta">reported ${date(r.raised)}</div></div></div></td>
      <td class="tbl__id">${r.traineeId}</td>
      <td>${esc(r.role)}</td>
      <td class="tnum">${date(r.since)}</td>
      <td class="num">${r.salary ? inr(r.salary) : "—"}</td>
      <td>${RSTAT[r.status]}</td>
      <td class="text-right nowrap">
        ${r.status === "pending" ? `
          <button class="btn btn--sm btn--primary" data-act="confirm" data-uid="${r.uid}">Confirm</button>
          <button class="btn btn--sm btn--danger" data-act="dispute" data-uid="${r.uid}">Dispute</button>`
          : `<span class="muted small">${r.status === "confirmed" ? "counted as a verified outcome" : "with mission office"}</span>`}
      </td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="tbl-empty">No trainee has listed ${esc(CO.name)} as their employer yet.</td></tr>`;
  $("#confirmAll").disabled = !pending;

  $("#verifyTable").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    b.disabled = true;
    const r = await API.decideClaim(b.dataset.uid, b.dataset.act === "confirm");
    if (!r.ok) { toast(r.error, "bad"); b.disabled = false; return; }
    toast(b.dataset.act === "confirm" ? "Employment confirmed" : "Claim disputed — sent to the mission office", b.dataset.act === "confirm" ? "good" : "warn");
    reloadSoon();
  });
  $("#confirmAll").addEventListener("click", async () => {
    $("#confirmAll").disabled = true;
    const todo = requests.filter((r) => r.status === "pending");
    const results = await Promise.all(todo.map((r) => API.decideClaim(r.uid, true)));
    const failed = results.filter((r) => !r.ok).length;
    toast(failed ? `${todo.length - failed} confirmed, ${failed} failed` : todo.length + " employment records confirmed", failed ? "warn" : "good");
    reloadSoon();
  });

  /* ======================================================================
     Hires tab
     ====================================================================== */
  const byCourse = DB.breakdown(hires, "course");
  if (byCourse.length) {
    Viz.barV($("#chartHireCourse"), {
      items: byCourse.slice(0, 8).map((c) => ({ label: c.key, value: c.total })),
      height: 240, color: "var(--series-1)", valueLabels: true, valueName: "Hires", format: num
    });
  } else $("#chartHireCourse").innerHTML = emptyState("No hires yet", "Hires appear when you hire an applicant or confirm a trainee's employment claim.");

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
              <div class="person__meta">${esc(h.district)}</div></div></div></td>
        <td class="tbl__id">${h.id}</td>
        <td>${esc(h.course)}</td>
        <td>${esc(h.jobRole || "—")}</td>
        <td class="num">${h.currentSalary ? inr(h.currentSalary) : "—"}</td>
        <td>${h.verified ? '<span class="chip chip--good">✓</span>' : '<span class="chip chip--warning">Pending</span>'}</td>
      </tr>`).join("")
      : `<tr><td colspan="6" class="tbl-empty">No matching employees.</td></tr>`;
    $("#hiresPager").innerHTML = UI.pagerHTML(p, "hire");
    const prev = $("#hirePrev"), next = $("#hireNext");
    if (prev) prev.onclick = () => { hirePage--; renderHires(); };
    if (next) next.onclick = () => { hirePage++; renderHires(); };
  }
  $("#hireSearch").addEventListener("input", (e) => { hireQuery = e.target.value; hirePage = 1; renderHires(); });
  $("#exportHires").addEventListener("click", () => UI.exportCSV("platform-hires.csv",
    ["Unique ID", "Name", "Course", "District", "Role", "Monthly salary", "Verified"],
    hires.map((h) => [h.id, h.name, h.course, h.district, h.jobRole, h.currentSalary, h.verified ? "Yes" : "No"])));
  renderHires();

  /* ======================================================================
     Jobs tab + applicants (round 2 results)
     ====================================================================== */
  $("#jobList").innerHTML = DB.JOB_POSTINGS.length ? DB.JOB_POSTINGS.map((j) => `
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
      <div class="stack" style="gap:6px">
        <button class="btn btn--sm" data-view="${j.rawId}" data-title="${esc(j.title)}">View applicants</button>
        ${j.status === "open" ? `<button class="btn btn--sm btn--ghost" data-close="${j.rawId}">Close</button>` : ""}
      </div>
    </div>`).join("")
    : `<div class="card__body">${emptyState("No openings posted yet", "Post one with the form alongside.")}</div>`;

  let openJob = null;
  const tags = (list, cls) => list.map((s) => `<span class="skill-tag ${cls || ""}">${esc(s)}</span>`).join(" ");
  async function loadApplicants() {
    const r = await API.applicants(openJob);
    if (!r.ok) { toast(r.error, "bad"); return; }
    $("#applicants").innerHTML = r.data.length ? r.data.map((a) => `<div class="list-row"><div class="list-row__main">
        <div class="list-row__title">${esc(a.name)} <span class="chip">${esc(a.stage.replace("_", " "))}</span></div>
        <div class="list-row__sub">${esc(a.course)} · certificate ${esc(a.certificate_no)} · ${esc(a.district)} · ${esc(a.email)} · ${esc(a.phone)}</div>
        <div class="small mt-12">Certificate match ${pct(a.cert_score * 100, 0)} · Resume match ${pct(a.resume_score * 100, 0)}</div>
        <div class="mt-12">${tags(a.matched, "skill-tag--have")} ${tags(a.missing, "skill-tag--gap")}</div>
        <details class="mt-12 small"><summary>Resume</summary><p style="white-space:pre-wrap">${esc(a.resume_text)}</p></details></div>
        ${a.stage === "hired" ? "" : `<div class="stack" style="gap:6px">
          <button class="btn btn--sm" data-stage="shortlisted" data-app="${a.id}">Shortlist</button>
          <button class="btn btn--sm btn--primary" data-stage="hired" data-app="${a.id}">Hire</button>
          <button class="btn btn--sm btn--danger" data-stage="rejected" data-app="${a.id}">Reject</button></div>`}</div>`).join("")
      : emptyState("No candidates have passed screening yet", "");
  }
  $("#jobList").addEventListener("click", async (e) => {
    const v = e.target.closest("[data-view]"), c = e.target.closest("[data-close]");
    if (v) {
      openJob = v.dataset.view;
      $("#appTitle").textContent = "Applicants · " + v.dataset.title;
      $("#applicantsCard").hidden = false;
      await loadApplicants();
      $("#applicantsCard").scrollIntoView({ behavior: "smooth" });
    }
    if (c) {
      const r = await API.post(`/api/employer/jobs/${c.dataset.close}/close`);
      if (!r.ok) { toast(r.error, "bad"); return; }
      toast("Job closed"); reloadSoon();
    }
  });
  $("#applicants").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-stage]");
    if (!b) return;
    const body = { stage: b.dataset.stage };
    if (body.stage === "hired") {
      const s = prompt("Monthly salary offered (₹)");
      if (!s) return;
      body.salary = Number(s);
    }
    const r = await API.decide(b.dataset.app, body);
    if (!r.ok) { toast(r.error, "bad"); return; }
    toast(body.stage === "hired" ? "Hired — recorded as a verified placement" : "Updated", "good");
    if (body.stage === "hired") reloadSoon(); else loadApplicants();
  });

  $("#jDistrict").innerHTML = DB.DISTRICTS.map((d) =>
    `<option ${d.name === CO.district ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  $("#jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = (id) => ($(id).value ? Number($(id).value) : null);
    const r = await API.postJob({
      title: $("#jTitle").value.trim(), description: $("#jDesc").value.trim(),
      skills: $("#jSkills").value.split(",").map((s) => s.trim()).filter(Boolean),
      district: $("#jDistrict").value, salary_min: n("#jMin"), salary_max: n("#jMax"), openings: n("#jOpen") || 1
    });
    if (!r.ok) { toast(Array.isArray(r.error) ? r.error.map((x) => x.msg).join("; ") : r.error, "bad"); return; }
    toast(CO.verified ? "Opening published" : "Opening saved — goes live once your company is verified", "good");
    reloadSoon();
  });

  /* ======================================================================
     Skill gap tab (real: open JDs vs published course skills)
     ====================================================================== */
  const gapRows = DB.skillGapRows();
  function renderSectorGap(courseName) {
    const row = gapRows.find((g) => g.course === courseName);
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
          ${row.gap.length ? "Asked for in job descriptions but not taught: " + row.gap.map(esc).join(", ") + "."
                           : "Everything employers ask for is already in the curriculum."}</div>
      </div>`;
  }
  if (gapRows.length) {
    $("#dCourse").innerHTML = gapRows.map((g) => `<option>${esc(g.course)}</option>`).join("");
    $("#dCourse").addEventListener("change", (e) => renderSectorGap(e.target.value));
    renderSectorGap(gapRows[0].course);
  } else {
    $("#dCourse").closest(".field").hidden = true;
    $("#chartSectorGap").innerHTML = emptyState("No skill-gap data yet", "It appears once verified companies post jobs that relate to a published course.");
  }

  /* ======================================================================
     Account tab
     ====================================================================== */
  $("#companyKV").innerHTML = `
    <dt>Legal name</dt><dd>${esc(CO.name)}</dd>
    <dt>Employer ID</dt><dd class="tbl__id">${CO.id}</dd>
    <dt>GSTIN</dt><dd class="tnum">${esc(CO.gstin)} ${CO.verified ? '<span class="chip chip--good">verified</span>' : '<span class="chip chip--warning">unverified</span>'}</dd>
    <dt>District</dt><dd>${esc(CO.district)}</dd>
    <dt>Website</dt><dd>${esc(CO.website || "—")}</dd>
    <dt>Primary contact</dt><dd>${esc(CO.contact)}</dd>
    <dt>Email</dt><dd>${esc(CO.email)}</dd>
    <dt>On platform since</dt><dd>${date(CO.onboarded)}</dd>`;
})();
