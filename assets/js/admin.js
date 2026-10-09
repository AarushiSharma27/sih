/* ==========================================================================
   admin.js — admin console: follow-ups, validation, providers, profile, audit
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, inrK, pct, date, esc, avatar, toast } = UI;

  const A = DB.ADMIN_USER;
  const all = DB.trainees;
  const sum = DB.summarise(all);

  UI.renderShell({
    title: "Admin console",
    crumb: A.dept + " · " + A.jurisdiction,
    user: { name: A.name, role: A.role }
  });
  UI.initTabs();
  UI.initDemoActions();

  /* deep links: admin.html#followups / #validation / #providers */
  const HASH_TAB = { "#followups": "followups", "#validation": "validation", "#providers": "providers" };
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
          <div><div class="muted small">Last login</div><div class="tnum">${esc(A.lastLogin)}</div></div>
        </div>
      </div>
      <div class="row" style="gap:8px">
        <a class="btn" href="dashboard.html">▦ Open dashboard</a>
        <button class="btn btn--primary" data-demo="Quarterly outcome report queued — you will be emailed when it is ready.">⭳ Quarterly report</button>
      </div>
    </div>`;

  /* ---------- stat tiles ---------- */
  const pendingFlags = DB.VALIDATION_QUEUE.length;
  const running = DB.CAMPAIGNS.filter((c) => c.status === "running");
  const nonResp = all.filter((t) => Object.values(t.follow).includes("no-response"));
  $("#adminStats").innerHTML = [
    { l: "Trainees under tracking", v: num(sum.total), m: pct(sum.consentRate, 1) + " with active consent", a: "var(--series-7)" },
    { l: "Follow-up response", v: pct(sum.responseRate, 0), m: running.length + " campaigns running now", a: "var(--series-1)" },
    { l: "Records needing review", v: String(pendingFlags), m: "flagged inconsistencies", a: "var(--series-2)" },
    { l: "Unreachable trainees", v: num(nonResp.length), m: "queued for assisted calling", a: "var(--series-8)" }
  ].map((t) => `
    <div class="stat" style="--accent:${t.a}">
      <div class="stat__label">${t.l}</div>
      <div class="stat__value">${t.v}</div>
      <div class="stat__meta muted">${t.m}</div>
    </div>`).join("");

  /* ======================================================================
     Follow-up engine
     ====================================================================== */
  const CHANNELS = [
    { name: "App push",      rate: 81, cost: 0.1 },
    { name: "WhatsApp",      rate: 74, cost: 0.4 },
    { name: "SMS",           rate: 58, cost: 0.2 },
    { name: "IVR call",      rate: 46, cost: 1.1 },
    { name: "Email",         rate: 34, cost: 0.05 },
    { name: "Assisted call", rate: 88, cost: 18.0 }
  ];
  Viz.barV($("#chartChannel"), {
    items: CHANNELS.map((c) => ({ label: c.name, value: c.rate, note: "₹" + c.cost.toFixed(2), noteLabel: "Cost / contact" })),
    height: 240, color: "var(--series-1)", valueLabels: true,
    valueName: "Response rate", format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%"
  });

  const waves = DB.followUpWaves(all);
  Viz.line($("#chartDecay"), {
    xLabels: ["3 months", "6 months", "12 months", "24 months"],
    series: [
      { name: "Responded on their own", color: "var(--series-1)",
        values: waves.map((w) => w.due ? Math.round((w.responded / w.due) * 100) : null) },
      { name: "Reached only via assisted call", color: "var(--series-4)",
        values: waves.map((w) => w.due ? Math.round((w.assisted / w.due) * 100) : null) },
      { name: "Lost to follow-up", color: "var(--series-8)",
        values: waves.map((w) => w.due ? Math.round((w.noResponse / w.due) * 100) : null) }
    ],
    height: 240, yMax: 100, format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%", padLeft: 44
  });
  Viz.legend($("#decayLegend"), [
    { label: "Responded on their own", color: "var(--series-1)" },
    { label: "Reached via assisted call", color: "var(--series-4)" },
    { label: "Lost to follow-up", color: "var(--series-8)" }
  ]);

  const campaigns = DB.CAMPAIGNS.map((c) => Object.assign({}, c));
  const CSTAT = {
    running:   '<span class="chip chip--warning"><i class="dot"></i>Running</span>',
    completed: '<span class="chip chip--good"><i class="dot"></i>Completed</span>',
    draft:     '<span class="chip"><i class="dot"></i>Draft</span>'
  };
  function renderCampaigns() {
    $("#campaignTable tbody").innerHTML = campaigns.map((c) => {
      const rate = c.sent ? (c.responded / c.sent) * 100 : 0;
      return `<tr>
        <td><strong>${esc(c.name)}</strong><div class="tbl__id">${c.id}</div></td>
        <td>${esc(c.channel)}</td>
        <td class="num">${num(c.audience)}</td>
        <td class="num">${num(c.responded)}</td>
        <td class="num">
          <div class="meter-row" style="--accent:${rate >= 70 ? "var(--good)" : rate >= 50 ? "var(--warning)" : "var(--critical)"};margin:0">
            <span class="meter-row__label"></span><span class="meter-row__val">${pct(rate, 0)}</span>
            <span class="meter"><span style="width:${rate}%"></span></span>
          </div></td>
        <td class="tnum">${date(c.started)}</td>
        <td>${CSTAT[c.status]}</td>
        <td class="text-right nowrap">
          ${c.status === "running"
            ? `<button class="btn btn--sm" data-demo="Reminder sent to ${num(c.audience - c.responded)} non-respondents.">Nudge</button>
               <button class="btn btn--sm btn--danger" data-stop="${c.id}">Stop</button>`
            : `<button class="btn btn--sm" data-demo="Campaign results exported.">Results</button>`}
        </td></tr>`;
    }).join("");
  }
  $("#campaignTable").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-stop]");
    if (!b) return;
    const c = campaigns.find((x) => x.id === b.dataset.stop);
    c.status = "completed";
    renderCampaigns();
    toast(c.name + " stopped");
  });
  renderCampaigns();

  $("#cBatch").innerHTML = DB.BATCHES.map((b) => `<option value="${b.id}">${esc(b.label)}</option>`).join("");
  function updateAudience() {
    const b = $("#cBatch").value;
    const rows = all.filter((t) => t.batch === b && t.consent);
    const unreachable = rows.filter((t) => !t.contactValid).length;
    $("#audiencePreview").innerHTML = `
      <span class="banner__ico">◎</span>
      <div><strong>${num(rows.length)} trainees with active consent</strong>
        ${num(unreachable)} have a contact number that failed the last delivery check —
        they will be routed straight to assisted calling.</div>`;
  }
  $("#cBatch").addEventListener("change", updateAudience);
  updateAudience();

  $("#campaignForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const b = $("#cBatch").value;
    const audience = all.filter((t) => t.batch === b && t.consent).length;
    campaigns.unshift({
      id: "CMP-" + (312 + campaigns.length), name: $("#cWave").value + " — " + b,
      channel: $("#cChannel").value, audience, sent: audience, responded: 0,
      status: "running", started: "2026-09-17"
    });
    renderCampaigns();
    toast("Campaign launched to " + num(audience) + " trainees");
  });
  $("#newCampaign").addEventListener("click", () => $("#cBatch").scrollIntoView({ behavior: "smooth", block: "center" }));

  const nonRespList = nonResp.slice(0, 8);
  $("#nonRespTable tbody").innerHTML = nonRespList.map((t) => {
    const wave = ["24m", "12m", "6m", "3m"].find((w) => t.follow[w] === "no-response");
    return `<tr>
      <td><div class="person">${avatar(t.name)}<div>
            <div class="person__name">${esc(t.name)}</div>
            <div class="person__meta">${esc(t.course)}</div></div></div></td>
      <td class="tbl__id">${t.id}</td>
      <td>${esc(t.district)}</td>
      <td>${wave}</td>
      <td>${t.contactValid
            ? '<span class="chip chip--warning">Ringing, no answer</span>'
            : '<span class="chip chip--critical">Number invalid</span>'}</td>
      <td class="text-right nowrap">
        <button class="btn btn--sm" data-demo="Assisted call scheduled for ${esc(t.name)} within 48 hours.">Schedule call</button>
      </td></tr>`;
  }).join("");
  $("#nonRespFoot").innerHTML =
    `<span>${num(nonResp.length)} trainees are currently non-responsive across all waves — showing the 8 oldest.
     Assisted calling recovers about 88% of them at ₹18 per contact.</span>`;
  $("#exportNonResp").addEventListener("click", () => UI.exportCSV("non-respondents.csv",
    ["Unique ID", "Name", "Course", "District", "Phone", "Contact valid"],
    nonResp.slice(0, 2000).map((t) => [t.id, t.name, t.course, t.district, t.phone, t.contactValid ? "Yes" : "No"])));

  /* ======================================================================
     Data validation
     ====================================================================== */
  const flags = DB.VALIDATION_QUEUE.map((f) => Object.assign({ status: "open" }, f));
  const SEV_ORDER = { critical: 0, serious: 1, warning: 2 };

  function renderValidationStats() {
    const open = flags.filter((f) => f.status === "open");
    const tiles = [
      { l: "Open flags", v: String(open.length), m: open.filter((f) => f.severity === "critical").length + " critical", a: "var(--series-8)" },
      { l: "Auto-resolved this month", v: "1,284", m: "by API cross-check, no human touch", a: "var(--series-3)" },
      { l: "Records verified against APIs", v: pct(81.4, 1), m: "GSTIN · EPFO · UDYAM · NCS", a: "var(--series-1)" }
    ];
    $("#validationStats").innerHTML = tiles.map((t) => `
      <div class="stat" style="--accent:${t.a}">
        <div class="stat__label">${t.l}</div>
        <div class="stat__value">${t.v}</div>
        <div class="stat__meta muted">${t.m}</div>
      </div>`).join("");
  }

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
          <div class="list-row__sub">${esc(f.subject)} · source: ${esc(f.source)} · raised ${date(f.raised)}</div>
        </div>
        <div class="row row--tight nowrap">
          <button class="btn btn--sm btn--primary" data-flag="resolve" data-id="${f.id}">Resolve</button>
          <button class="btn btn--sm" data-flag="dismiss" data-id="${f.id}">Dismiss</button>
        </div>
      </div>`).join("")
      : `<div class="tbl-empty">Nothing left in the queue for this severity. 🎉</div>`;

    $("#flagFoot").innerHTML =
      `<span>${flags.filter((f) => f.status === "open").length} open ·
       ${flags.filter((f) => f.status === "resolved").length} resolved ·
       ${flags.filter((f) => f.status === "dismissed").length} dismissed in this session.
       Every action is written to the audit log.</span>`;
    renderValidationStats();
  }
  $("#flagList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-flag]");
    if (!b) return;
    const f = flags.find((x) => x.id === b.dataset.id);
    f.status = b.dataset.flag === "resolve" ? "resolved" : "dismissed";
    renderFlags();
    toast(f.id + " " + f.status);
  });
  $("#sevFilter").addEventListener("change", renderFlags);
  renderFlags();

  const SOURCES = [
    { name: "GSTIN registry", status: "good", note: "412 employer records checked · 03:10 IST" },
    { name: "EPFO contribution data", status: "good", note: "Employment confirmed for 6,214 trainees" },
    { name: "UDYAM (self-employment)", status: "warning", note: "Rate-limited — 38% of the queue pending" },
    { name: "National Career Service", status: "good", note: "Job-portal placement signals synced" },
    { name: "Provider LMS feeds", status: "critical", note: "PRV-06 has not uploaded attendance for 11 days" }
  ];
  $("#sourceList").innerHTML = SOURCES.map((s) => `
    <div class="list-row">
      <span class="chip ${UI.SEVERITY_CHIP[s.status]}"><i class="dot"></i></span>
      <div class="list-row__main">
        <div class="list-row__title">${esc(s.name)}</div>
        <div class="list-row__sub">${esc(s.note)}</div>
      </div>
      <button class="btn btn--sm" data-demo="Re-sync triggered for ${esc(s.name)}.">Re-sync</button>
    </div>`).join("");

  const RULES = [
    { name: "Salary outlier detection", note: "Flag wages beyond 3× the course median", on: true },
    { name: "Employer cross-verification", note: "Every self-reported employer must be confirmed by the employer", on: true },
    { name: "Duplicate identity detection", note: "Match on phone + date of birth across providers", on: true },
    { name: "Attendance anomaly", note: "Flag batches with implausibly uniform attendance", on: true },
    { name: "Certificate date sanity", note: "Certification cannot precede course completion", on: true },
    { name: "Auto-suspend unverified employers", note: "Block outcome credit until GSTIN is verified", on: false }
  ];
  $("#ruleList").innerHTML = RULES.map((r, i) => `
    <div>
      <label class="switch">
        <input type="checkbox" ${r.on ? "checked" : ""} data-rule="${i}">
        <span class="switch__track"></span>
        <span style="font-weight:580">${esc(r.name)}</span>
      </label>
      <div class="small muted" style="margin-top:4px;padding-left:45px">${esc(r.note)}</div>
    </div>`).join("");
  $("#ruleList").addEventListener("change", (e) => {
    const i = e.target.dataset.rule;
    if (i != null) toast(RULES[i].name + (e.target.checked ? " enabled" : " disabled"));
  });

  /* ======================================================================
     Providers
     ====================================================================== */
  const provRows = DB.breakdown(all, "provider").map((p) => {
    const meta = DB.PROVIDERS.find((x) => x.name === p.key);
    const placedCount = p.counts.employed + p.counts.self + p.counts.apprentice;
    const spend = p.rows.reduce((s, t) => {
      const c = DB.COURSES.find((x) => x.name === t.course);
      return s + (c ? c.fee : 10000);
    }, 0);
    return Object.assign({}, p, {
      meta, placedCount, spend,
      costPerOutcome: placedCount ? spend / placedCount : 0
    });
  });

  Viz.barH($("#chartProviderPlace"), {
    items: provRows
      .map((p) => ({
        label: p.key.replace(/ (Institute|Academy|Centre|Hub|Polytechnic)$/, ""),
        value: Math.round(p.placementRate),
        color: p.placementRate >= sum.placementRate ? "var(--series-3)" : "var(--series-2)"
      }))
      .sort((a, b) => b.value - a.value),
    rowHeight: 34, labelWidth: 150, valueName: "Placement rate",
    format: (v) => v + "%", endLabel: (d) => d.value + "%"
  });

  Viz.barV($("#chartCost"), {
    items: provRows
      .map((p) => ({ label: p.key.split(" ")[0], value: Math.round(p.costPerOutcome), note: num(p.placedCount), noteLabel: "Placed" }))
      .sort((a, b) => a.value - b.value),
    height: 240, color: "var(--series-7)", valueName: "Cost per placed trainee",
    format: inr, tickFormat: inrK, rotate: false
  });

  function renderProviders() {
    $("#providerTable tbody").innerHTML = provRows.map((p) => `
      <tr>
        <td><strong>${esc(p.key)}</strong><div class="tbl__id">${p.meta.id}</div></td>
        <td>${esc(p.meta.city)}</td>
        <td class="num">${p.meta.centres}</td>
        <td class="num">${num(p.total)}</td>
        <td class="num">${pct(p.certification, 0)}</td>
        <td class="num"><strong>${pct(p.placementRate, 1)}</strong></td>
        <td class="num">${inr(p.avgStartingSalary)}</td>
        <td class="num">${pct(p.retention12m, 0)}</td>
        <td>${p.meta.accredited
              ? '<span class="chip chip--good">Accredited</span>'
              : '<span class="chip chip--critical">Under review</span>'}</td>
        <td class="text-right nowrap">
          <button class="btn btn--sm" data-demo="Provider scorecard for ${esc(p.key)} opened.">Scorecard</button>
          ${p.placementRate < 55
            ? `<button class="btn btn--sm btn--danger" data-demo="Show-cause notice issued to ${esc(p.key)}.">Notice</button>`
            : ""}
        </td>
      </tr>`).join("");
  }
  renderProviders();
  $("#exportProviders").addEventListener("click", () => UI.exportCSV("provider-performance.csv",
    ["Provider", "ID", "City", "Centres", "Trainees", "Certification %", "Placement %", "Avg salary", "Retention %", "Cost per outcome", "Accredited"],
    provRows.map((p) => [p.key, p.meta.id, p.meta.city, p.meta.centres, p.total,
      p.certification.toFixed(1), p.placementRate.toFixed(1), Math.round(p.avgStartingSalary),
      p.retention12m.toFixed(1), Math.round(p.costPerOutcome), p.meta.accredited ? "Yes" : "No"])));

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
    <dt>Phone</dt><dd>${esc(A.phone)}</dd>
    <dt>Active since</dt><dd>${date(A.since)}</dd>
    <dt>Last login</dt><dd class="tnum">${esc(A.lastLogin)}</dd>`;

  $("#permList").innerHTML = A.permissions.map((p) => `
    <div class="list-row">
      <span class="chip ${p.granted ? "chip--good" : "chip--critical"}">${p.granted ? "✓" : "✕"}</span>
      <div class="list-row__main">
        <div class="list-row__title">${esc(p.name)}</div>
        <div class="list-row__sub">${p.granted ? "Granted by role" : "Not available to this role"}</div>
      </div>
    </div>`).join("");

  $("#securityBox").innerHTML = `
    <label class="switch"><input type="checkbox" checked><span class="switch__track"></span>
      <span style="font-weight:580">Two-factor authentication (TOTP)</span></label>
    <label class="switch"><input type="checkbox" checked><span class="switch__track"></span>
      <span style="font-weight:580">Alert me when PII is exported</span></label>
    <label class="switch"><input type="checkbox"><span class="switch__track"></span>
      <span style="font-weight:580">Restrict my access to office IP range</span></label>
    <div class="row mt-12">
      <button class="btn btn--sm" data-demo="Password reset link sent to your official email.">Reset password</button>
      <button class="btn btn--sm btn--danger" data-demo="All other sessions signed out.">Sign out other devices</button>
    </div>`;

  const sessions = [
    { device: "Windows · Chrome 141", where: "Bhopal · 10.24.8.31", when: "Active now", current: true },
    { device: "Android · SkillTrack app", where: "Bhopal · 49.36.x.x", when: "2 hours ago", current: false },
    { device: "Windows · Edge", where: "Indore · 10.24.11.4", when: "Yesterday, 18:40", current: false }
  ];
  $("#sessionList").innerHTML = sessions.map((s) => `
    <div class="list-row">
      <div class="list-row__main">
        <div class="list-row__title">${esc(s.device)} ${s.current ? '<span class="chip chip--good" style="margin-left:6px">This device</span>' : ""}</div>
        <div class="list-row__sub">${esc(s.where)} · ${esc(s.when)}</div>
      </div>
      ${s.current ? "" : `<button class="btn btn--sm btn--danger" data-demo="Session revoked.">Revoke</button>`}
    </div>`).join("");

  /* ======================================================================
     System & audit
     ====================================================================== */
  const USERS = [
    { name: "Rohan Mehta", role: "State Programme Administrator", scope: "All districts", status: "active" },
    { name: "Sunita Iyer", role: "District Officer", scope: "Indore, Ujjain", status: "active" },
    { name: "Aamir Khan", role: "Data Steward", scope: "Validation queue only", status: "active" },
    { name: "Pragati Training Hub", role: "Provider co-ordinator", scope: "PRV-05 records", status: "active" },
    { name: "Sanchar Polytechnic", role: "Provider co-ordinator", scope: "PRV-06 records", status: "suspended" },
    { name: "Aarav Technologies", role: "Employer", scope: "Own hires only", status: "active" }
  ];
  $("#userList").innerHTML = USERS.map((u) => `
    <div class="list-row">
      ${avatar(u.name)}
      <div class="list-row__main">
        <div class="list-row__title">${esc(u.name)}</div>
        <div class="list-row__sub">${esc(u.role)} · ${esc(u.scope)}</div>
      </div>
      <span class="chip ${u.status === "active" ? "chip--good" : "chip--critical"}">${u.status}</span>
      <button class="btn btn--sm" data-demo="Access settings opened for ${esc(u.name)}.">Manage</button>
    </div>`).join("");

  $("#retentionBox").innerHTML = `
    <div class="meter-row" style="--accent:var(--series-1)">
      <span class="meter-row__label">Records with valid, unexpired consent</span>
      <span class="meter-row__val">${pct(sum.consentRate, 1)}</span>
      <span class="meter"><span style="width:${sum.consentRate}%"></span></span>
    </div>
    <label class="switch"><input type="checkbox" checked><span class="switch__track"></span>
      <span style="font-weight:580">Auto-anonymise records 24 months after the final follow-up</span></label>
    <label class="switch"><input type="checkbox" checked><span class="switch__track"></span>
      <span style="font-weight:580">Purge contact details when consent is withdrawn</span></label>
    <label class="switch"><input type="checkbox" checked><span class="switch__track"></span>
      <span style="font-weight:580">Mask wage data in all provider-facing views</span></label>
    <div class="banner">
      <span class="banner__ico">⚖</span>
      <div><strong>Data principal requests</strong> 4 access requests and 1 erasure request are open.
        Statutory response window: 30 days.</div>
    </div>
    <div class="row">
      <button class="btn btn--sm" data-demo="Consent ledger exported.">Consent ledger</button>
      <button class="btn btn--sm" data-demo="Erasure request processed — record de-identified.">Process erasure</button>
    </div>`;

  $("#auditTable tbody").innerHTML = DB.AUDIT_LOG.map((a) => `
    <tr>
      <td class="tnum nowrap">${esc(a.at)}</td>
      <td>${esc(a.actor)}</td>
      <td>${esc(a.action)}</td>
      <td>${esc(a.target)}</td>
      <td class="tnum">${esc(a.ip)}</td>
    </tr>`).join("");
  $("#exportAudit").addEventListener("click", () => UI.exportCSV("audit-log.csv",
    ["Timestamp", "Actor", "Action", "Target", "IP"],
    DB.AUDIT_LOG.map((a) => [a.at, a.actor, a.action, a.target, a.ip])));
})();
