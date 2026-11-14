/* ==========================================================================
   notifications.js — the notification centre

   Notifications are derived from the live data rather than hardcoded, so the
   inbox agrees with the dashboards: the verification count here is the same
   pending queue the employer portal shows, and the follow-up reminders are the
   waves actually due on the trainee's record.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, date, inr, toast } = UI;

  const P = DB.TRAINEE_USER;   // null unless a trainee is signed in

  UI.renderShell({ title: "Notifications", crumb: "Alerts, reminders and requests", user: { name: DB.USER.name, role: DB.USER.role } });

  /* ---------- category presentation ---------- */
  const KINDS = {
    followup:      { icon: "↻", label: "Follow-up",     tone: "var(--warning-soft)" },
    verification:  { icon: "✓", label: "Verification",  tone: "var(--info-soft)" },
    missing:       { icon: "!", label: "Missing info",  tone: "var(--critical-soft)" },
    certification: { icon: "◫", label: "Certification", tone: "var(--good-soft)" },
    employment:    { icon: "▤", label: "Employment",    tone: "var(--brand-soft)" },
    alert:         { icon: "⚑", label: "Alert",         tone: "var(--serious-soft)" }
  };

  /* ---------- build each role's inbox from real records (dates come from the records) ---------- */
  const addMonths = (iso, m) => { const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
  const STAGE = { screened_in: "passed resume screening", screened_out: "did not pass resume screening",
                  shortlisted: "you were shortlisted", rejected: "you were not selected", hired: "you were hired" };

  function traineeNotices() {
    const out = [];
    const waves = { "3m": "3-month", "6m": "6-month", "12m": "12-month", "24m": "24-month" };

    Object.keys(P.follow).forEach((w) => {
      if (P.follow[w] !== "no-response") return;
      out.push({
        kind: "followup", unread: true, action: true, at: addMonths(P.certDate, parseInt(w, 10)),
        title: `Your ${waves[w]} employment follow-up is due`,
        body: "Update your current status. It takes about a minute.",
        cta: { label: "Update now", href: "outcome.html" }
      });
    });

    out.push({ 1: {
        kind: "certification", unread: false, action: false, at: P.certDate,
        title: "Your certificate has been verified",
        body: `${P.certId} for ${P.course}. You now receive job recommendations.`,
        cta: { label: "See jobs", href: "trainee.html" } },
      0: {
        kind: "certification", unread: true, action: false, at: P.journey[0].date,
        title: "Your certificate is awaiting verification",
        body: `The mission office is checking ${P.certId}. Job recommendations start once it is verified.` },
      "-1": {
        kind: "alert", unread: true, action: true, at: P.journey[0].date,
        title: "Your certificate could not be verified",
        body: `${P.certId} did not match the issuing body's records. Contact the mission office.` }
    }[P.certStatus]);

    (P.applications || []).forEach((a) => out.push({
      kind: "employment", unread: a.stage !== "screened_out", action: false, at: a.created,
      title: `${a.title} at ${a.company}`,
      body: `Application update: ${STAGE[a.stage]}.` + (a.missing.length ? ` Missing skills: ${a.missing.join(", ")}.` : ""),
      cta: { label: "My applications", href: "trainee.html" }
    }));

    if (P.outcomeReported && P.verified) {
      out.push({
        kind: "employment", unread: false, action: false, at: P.outcomeUpdated,
        title: `${P.employer} confirmed your employment record`,
        body: "Your placement is now marked verified."
      });
    }
    return out;
  }

  function employerNotices() {
    const out = DB.VERIFY_REQUESTS.filter((v) => v.status === "pending").map((v) => ({
      kind: "verification", unread: true, action: true, at: v.raised,
      title: `Verify ${v.trainee}`,
      body: `Says they work at your company${v.salary ? " at " + inr(v.salary) + "/month" : ""}. Confirm or dispute.`,
      cta: { label: "Review request", href: "employer.html#verify" }
    }));

    DB.VERIFY_REQUESTS.filter((v) => v.status === "disputed").forEach((v) => out.push({
      kind: "alert", unread: false, action: false, at: v.raised,
      title: `Disputed record — ${v.trainee}`,
      body: "You disputed this record. The mission office will reconcile it.",
      cta: { label: "Open portal", href: "employer.html#verify" }
    }));

    const E = DB.EMPLOYER_USER;
    if (E && !E.verified) {
      out.push({
        kind: "alert", unread: true, action: false, at: E.onboarded,
        title: "Company verification pending",
        body: `The mission office is checking GSTIN ${E.gstin}. Your jobs are shown to trainees after that.`
      });
    }

    DB.JOB_POSTINGS.filter((j) => j.status === "open").forEach((j) => out.push({
      kind: "employment", unread: false, action: false, at: j.posted,
      title: `${j.applicants} application${j.applicants === 1 ? "" : "s"} for "${j.title}"`,
      body: `${j.openings} opening(s) in ${j.district}.`,
      cta: { label: "View applicants", href: "employer.html#openings" }
    }));
    return out;
  }

  function adminNotices() {
    const open = DB.VALIDATION_QUEUE;
    const out = open.map((f) => ({
      kind: f.severity === "critical" ? "alert" : "verification", unread: true, action: true, at: f.raised,
      title: `${f.type} — ${f.subject}`,
      body: f.detail,
      cta: { label: "Open validation queue", href: "admin.html#validation" }
    }));
    return out;
  }

  const SOURCES = { trainee: traineeNotices, employer: employerNotices, admin: adminNotices };

  /* ---------- state ---------- */
  const role = DB.USER.role;
  let filter = "all";
  let kind = "all";
  let notices = [];

  function load() {
    notices = SOURCES[role]()
      .map((n, i) => Object.assign({ id: role + "-" + i }, n))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    render();
  }

  function visible() {
    return notices.filter((n) =>
      (filter === "all" || (filter === "unread" ? n.unread : n.action)) &&
      (kind === "all" || n.kind === kind));
  }

  /* ---------- render ---------- */
  function renderStats() {
    const unread = notices.filter((n) => n.unread).length;
    const action = notices.filter((n) => n.action).length;
    const followups = notices.filter((n) => n.kind === "followup" && n.action).length;

    const tiles = [
      { label: "Unread", value: unread, meta: "not yet marked read", accent: "var(--series-1)" },
      { label: "Needs action", value: action, meta: "waiting on you", accent: "var(--series-2)" },
      { label: "Follow-ups due", value: followups, meta: "answer to stay verified", accent: "var(--series-4)" },
      { label: "Total", value: notices.length, meta: "from your records", accent: "var(--series-7)" }
    ];

    $("#noticeStats").innerHTML = tiles.map((t) => `
      <div class="stat" style="--accent:${t.accent}">
        <div class="stat__label">${esc(t.label)}</div>
        <div class="stat__value tnum">${t.value}</div>
        <div class="stat__meta">${esc(t.meta)}</div>
      </div>`).join("");
  }

  function render() {
    renderStats();
    const rows = visible();
    $("#inboxSub").textContent =
      `${rows.length} of ${notices.length}`;

    if (!rows.length) {
      $("#noticeList").innerHTML = `
        <div class="empty">
          <div class="empty__ico">✓</div>
          <div class="empty__title">Nothing here</div>
          <div class="empty__body">
            ${filter === "unread" ? "You have read everything in this view."
              : filter === "action" ? "No outstanding actions — everything that needed a response has had one."
              : "No notifications match this category."}
          </div>
        </div>`;
      return;
    }

    $("#noticeList").innerHTML = rows.map((n) => {
      const k = KINDS[n.kind];
      return `
        <div class="notice ${n.unread ? "notice--unread" : ""}" data-id="${n.id}">
          <span class="notice__ico" style="background:${k.tone}">${k.icon}</span>
          <div style="flex:1;min-width:0">
            <div class="notice__title">${esc(n.title)}</div>
            <div class="notice__body">${esc(n.body)}</div>
            <div class="row row--tight mt-12" style="gap:8px">
              <span class="chip">${esc(k.label)}</span>
              ${n.action ? '<span class="chip chip--warning">Needs action</span>' : ""}
              ${n.cta ? `<a class="btn btn--sm" href="${n.cta.href}">${esc(n.cta.label)}</a>` : ""}
            </div>
          </div>
          <div class="text-right">
            <div class="notice__time">${date(n.at)}</div>
            ${n.unread ? `<button class="btn btn--ghost btn--sm mt-12" data-read="${n.id}">Mark read</button>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  /* ---------- interactions ---------- */
  $("#noticeList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-read]");
    if (!btn) return;
    const n = notices.find((x) => x.id === btn.dataset.read);
    if (n) { n.unread = false; render(); }
  });

  $("#markAll").addEventListener("click", () => {
    const unread = notices.filter((n) => n.unread).length;
    if (!unread) { toast("Nothing unread"); return; }
    notices.forEach((n) => { n.unread = false; });
    render();
    toast(`Marked ${unread} notification${unread === 1 ? "" : "s"} as read`);
  });

  $("#noticeTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$(".tab", $("#noticeTabs")).forEach((t) => t.classList.toggle("tab--active", t === tab));
    filter = tab.dataset.filter;
    render();
  });

  $("#kindFilter").addEventListener("change", (e) => { kind = e.target.value; render(); });

  $("#exportNotices").addEventListener("click", () => {
    const rows = visible();
    if (!rows.length) { toast("Nothing to export", "warn"); return; }
    UI.exportCSV("notifications.csv",
      ["Date", "Category", "Title", "Detail", "Needs action", "Unread"],
      rows.map((n) => [n.at, KINDS[n.kind].label, n.title, n.body, n.action ? "yes" : "no", n.unread ? "yes" : "no"]));
  });

  $$("[data-pref]").forEach((el) =>
    el.addEventListener("change", () =>
      toast("Delivery preferences are not saved yet", "warn")));

  load();
})();
