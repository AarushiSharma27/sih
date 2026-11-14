/* ==========================================================================
   admin.js — admin console: follow-ups, validation, courses, profile, audit
   Everything is read from DB (real records, /api/db); writes go through API.
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, pct, date, esc, avatar, toast } = UI;

  const A = DB.ADMIN_USER;
  const all = DB.trainees;
  const sum = DB.summarise(all);
  const reloadSoon = () => setTimeout(() => location.reload(), 700);
  const errText = (e) => (Array.isArray(e) ? e.map((x) => x.msg).join("; ") : e);

  UI.renderShell({
    title: "Admin console",
    crumb: A.dept + " · " + A.jurisdiction,
    user: { name: A.name, role: A.role }
  });
  UI.initTabs();

  /* deep links: admin.html#followups / #validation / #providers / #courses */
  const HASH_TAB = { "#followups": "followups", "#validation": "validation", "#providers": "providers", "#courses": "courses" };
  if (HASH_TAB[location.hash]) {
    const t = HASH_TAB[location.hash];
    $$("#mainTabs .tab").forEach((b) => b.classList.toggle("tab--active", b.dataset.tab === t));
    $$(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== t; });
  }

  /* ---------- hero ---------- */
  $("#adminHero").innerHTML = `
    <div class="card__body" style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
      <span class="avatar avatar--lg" style="background:${UI.avatarColor(A.name)}">${esc(A.initials)}</span>
      <div style="flex:1 1 320px;min-width:0">
        <div class="row">
          <h1 style="font-size:22px">${esc(A.name)}</h1>
          <span class="chip chip--brand">${esc(A.role)}</span>
          ${A.mfa ? '<span class="chip chip--good">✓ MFA enabled</span>' : '<span class="chip chip--critical">MFA off</span>'}
        </div>
        <div class="row mt-12" style="gap:22px;font-size:13px">
          <div><div class="muted small">Admin ID</div><div class="tbl__id" style="font-size:13px">${A.id}</div></div>
          <div><div class="muted small">Department</div><div>${esc(A.dept)}</div></div>
          <div><div class="muted small">Jurisdiction</div><div>${esc(A.jurisdiction)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px">
        <a class="btn" href="dashboard.html">▦ Open dashboard</a>
        <a class="btn btn--primary" href="/api/admin/export.csv">⭳ Export trainees (CSV)</a>
      </div>
    </div>`;

  /* ---------- stat tiles ---------- */
  const flags = DB.VALIDATION_QUEUE.map((f) => Object.assign({ status: "open" }, f));
  const nonResp = all.filter((t) => Object.values(t.follow).includes("no-response"));
  $("#adminStats").innerHTML = [
    { l: "Registered trainees", v: num(sum.total), m: num(all.filter((t) => t.certified).length) + " with verified certificates", a: "var(--series-7)" },
    { l: "Follow-up response", v: sum.responseRate ? pct(sum.responseRate, 0) : "—", m: "of follow-up waves that are due", a: "var(--series-1)" },
    { l: "Records needing review", v: num(flags.length), m: "registrations and disputed claims", a: "var(--series-2)" },
    { l: "Overdue status updates", v: num(nonResp.length), m: "trainees with a missed follow-up wave", a: "var(--series-8)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");
  if (flags.length) { $("#flagBadge").textContent = flags.length; $("#flagBadge").hidden = false; }

  /* ======================================================================
     Follow-ups (derived from when trainees last updated their status)
     ====================================================================== */
  const waves = DB.followUpWaves(all);
  if (waves.some((w) => w.due)) {
    Viz.line($("#chartDecay"), {
      xLabels: ["3 months", "6 months", "12 months", "24 months"],
      series: [
        { name: "Updated status", color: "var(--series-1)",
          values: waves.map((w) => w.due ? Math.round((w.responded / w.due) * 100) : null) },
        { name: "No update", color: "var(--series-8)",
          values: waves.map((w) => w.due ? Math.round((w.noResponse / w.due) * 100) : null) }
      ],
      height: 240, yMax: 100, format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%", padLeft: 44
    });
    Viz.legend($("#decayLegend"), [
      { label: "Updated status", color: "var(--series-1)" },
      { label: "No update", color: "var(--series-8)" }
    ]);
  } else {
    $("#chartDecay").innerHTML = `<div class="empty"><div class="empty__title">No follow-up wave is due yet</div>
      <div class="empty__body">The first wave falls due 3 months after a trainee's certificate date.</div></div>`;
  }

  $("#campaignTable tbody").innerHTML = `<tr><td colspan="8" class="tbl-empty">No campaigns yet.</td></tr>`;

  $("#nonRespTable tbody").innerHTML = nonResp.length ? nonResp.slice(0, 8).map((t) => {
    const wave = ["24m", "12m", "6m", "3m"].find((w) => t.follow[w] === "no-response");
    return `<tr>
      <td><div class="person">${avatar(t.name)}<div>
            <div class="person__name">${esc(t.name)}</div>
            <div class="person__meta">${esc(t.course)}</div></div></div></td>
      <td class="tbl__id">${t.id}</td>
      <td>${esc(t.district)}</td>
      <td>${wave}</td>
      <td class="tnum">${esc(t.phone)}</td>
      <td>${t.outcomeUpdated ? date(t.outcomeUpdated) : "never"}</td></tr>`;
  }).join("") : `<tr><td colspan="6" class="tbl-empty">Nobody has missed a follow-up wave.</td></tr>`;
  $("#nonRespFoot").innerHTML = `<span>${num(nonResp.length)} trainees have missed at least one wave${nonResp.length > 8 ? " — showing 8; export for the full list" : ""}.</span>`;
  $("#exportNonResp").addEventListener("click", () => UI.exportCSV("non-respondents.csv",
    ["Unique ID", "Name", "Course", "District", "Phone", "Email", "Last update"],
    nonResp.map((t) => [t.id, t.name, t.course, t.district, t.phone, t.email, t.outcomeUpdated || ""])));

  /* ======================================================================
     Data validation: approve / reject goes to the real verification endpoints
     ====================================================================== */
  const SEV_ORDER = { critical: 0, serious: 1, warning: 2 };
  const count = (kind) => flags.filter((f) => f.status === "open" && f.kind === kind).length;
  $("#validationStats").innerHTML = [
    { l: "Companies to verify", v: count("company"), m: "GSTIN not yet checked", a: "var(--series-2)" },
    { l: "Certificates to verify", v: count("certificate"), m: "not yet checked with the issuing body", a: "var(--series-1)" },
    { l: "Disputed employment claims", v: count("claim"), m: "employer said the trainee does not work there", a: "var(--series-8)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${num(t.v)}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");

  function renderFlags() {
    const sev = $("#sevFilter").value;
    const list = flags
      .filter((f) => f.status === "open" && (sev === "all" || f.severity === sev))
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

    $("#flagList").innerHTML = list.length ? list.map((f) => `
      <div class="list-row">
        <span class="chip ${UI.SEVERITY_CHIP[f.severity]}"><i class="dot"></i>${f.severity}</span>
        <div class="list-row__main">
          <div class="list-row__title">${esc(f.type)} <span class="tbl__id">· ${f.id}</span></div>
          <div class="list-row__sub" style="color:var(--text-secondary)">${esc(f.detail)}</div>
          <div class="list-row__sub">${esc(f.subject)} · source: ${esc(f.source)} · raised ${date(f.raised)}
            ${f.file ? ` · <a href="${f.file}" target="_blank" rel="noopener">Open uploaded certificate ↗</a>` : ""}</div>
        </div>
        <div class="row row--tight nowrap">
          ${f.kind === "claim"
            ? `<button class="btn btn--sm" data-flag="dismiss" data-id="${f.id}" title="Hides it on this page only; nothing is saved">Dismiss (this view)</button>`
            : `<button class="btn btn--sm btn--primary" data-flag="approve" data-id="${f.id}"
                 ${f.kind === "certificate" && !f.file ? 'disabled title="No certificate uploaded yet — nothing to verify"' : ""}>Verify</button>
               <button class="btn btn--sm btn--danger" data-flag="reject" data-id="${f.id}">Reject</button>`}
        </div>
      </div>`).join("")
      : `<div class="tbl-empty">Nothing waiting for review.</div>`;
    $("#flagFoot").innerHTML = `<span>${flags.filter((f) => f.status === "open").length} open. Verifications are written to the audit log.</span>`;
  }
  $("#flagList").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-flag]");
    if (!b) return;
    const f = flags.find((x) => x.id === b.dataset.id);
    if (b.dataset.flag === "dismiss") { f.status = "dismissed"; renderFlags(); return; }
    const ok = b.dataset.flag === "approve";
    if (!ok && f.kind === "company" && !confirm("Rejecting deletes this company's account. Continue?")) return;
    let note = "";
    if (f.kind === "certificate") {
      // the note is stored with the record: what the certificate was checked against
      note = prompt(ok ? "Where did you confirm this certificate? (e.g. Skill India Digital, roll no. and name match)"
                       : "Why is it rejected? (e.g. number not found on NCVT MIS)");
      if (note == null) return;
      if (note.trim().length < 10) { toast("Write at least 10 characters about what you checked", "warn"); return; }
    }
    b.disabled = true;
    const r = f.kind === "company" ? await API.verifyCompany(f.ref, ok) : await API.verifyCert(f.ref, ok, note.trim());
    if (!r.ok) { toast(errText(r.error), "bad"); b.disabled = false; return; }
    toast(f.type.replace(" unverified", "") + (ok ? " verified" : " rejected"), ok ? "good" : "warn");
    reloadSoon();
  });
  $("#sevFilter").addEventListener("change", renderFlags);
  renderFlags();

  /* ======================================================================
     Courses
     ====================================================================== */
  $("#courseTable").innerHTML = DB.COURSES.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>Course</th><th>Code</th><th>Sector</th><th>Skills taught</th><th class="num">Trainees</th><th>Source</th></tr></thead><tbody>` +
    DB.COURSES.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td class="tbl__id">${esc(c.code)}</td><td>${esc(c.sector)}</td>
      <td><div class="row row--tight">${c.skills.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div></td>
      <td class="num">${num(all.filter((t) => t.course === c.name).length)}</td>
      <td><a href="${esc(c.source_url)}" target="_blank" rel="noopener">QP ↗</a></td></tr>`).join("") + "</tbody></table></div>"
    : `<div class="card__body"><div class="empty"><div class="empty__title">No courses published yet</div>
        <div class="empty__body">Trainees cannot register until at least one course is published.</div></div></div>`;

  $("#courseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    const r = await API.addCourse({ name: v("#coName"), qp_code: v("#coQp"), sector: v("#coSector"), source_url: v("#coSrc"),
      skills: v("#coSkills").split(",").map((s) => s.trim()).filter(Boolean) });
    if (!r.ok) { toast(errText(r.error), "bad"); return; }
    toast("Course published", "good");
    location.hash = "#courses";
    reloadSoon();
  });

  /* ======================================================================
     Profile & access
     ====================================================================== */
  $("#adminKV").innerHTML = `
    <dt>Name</dt><dd>${esc(A.name)}</dd>
    <dt>Admin ID</dt><dd class="tbl__id">${A.id}</dd>
    <dt>Role</dt><dd>${esc(A.role)}</dd>
    <dt>Department</dt><dd>${esc(A.dept)}</dd>
    <dt>Jurisdiction</dt><dd>${esc(A.jurisdiction)}</dd>
    <dt>Official email</dt><dd>${esc(A.email)}</dd>
    <dt>Active since</dt><dd>${date(A.since)}</dd>`;

  $("#permList").innerHTML = A.permissions.map((p) => `
    <div class="list-row">
      <span class="chip ${p.granted ? "chip--good" : "chip--critical"}">${p.granted ? "✓" : "✕"}</span>
      <div class="list-row__main">
        <div class="list-row__title">${esc(p.name)}</div>
        <div class="list-row__sub">${p.granted ? "Granted by role" : "Not available to this role"}</div>
      </div>
    </div>`).join("");

  /* ======================================================================
     Audit
     ====================================================================== */
  $("#auditTable tbody").innerHTML = DB.AUDIT_LOG.length ? DB.AUDIT_LOG.map((a) => `
    <tr>
      <td class="tnum nowrap">${esc(a.at)}</td>
      <td>${esc(a.actor)}</td>
      <td>${esc(a.action)}</td>
      <td>${esc(a.target)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="tbl-empty">No activity recorded yet.</td></tr>`;
  $("#exportAudit").addEventListener("click", () => UI.exportCSV("audit-log.csv",
    ["Timestamp", "Actor", "Action", "Target"],
    DB.AUDIT_LOG.map((a) => [a.at, a.actor, a.action, a.target])));
})();
