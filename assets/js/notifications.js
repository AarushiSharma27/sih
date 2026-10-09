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

  const P = DB.TRAINEE_USER;

  UI.renderShell({
    title: "Notifications",
    crumb: "Alerts, reminders and requests",
    user: { name: P.name, role: "Trainee · " + P.district }
  });

  /* ---------- category presentation ---------- */
  const KINDS = {
    followup:      { icon: "↻", label: "Follow-up",     tone: "var(--warning-soft)" },
    verification:  { icon: "✓", label: "Verification",  tone: "var(--info-soft)" },
    missing:       { icon: "!", label: "Missing info",  tone: "var(--critical-soft)" },
    certification: { icon: "◫", label: "Certification", tone: "var(--good-soft)" },
    employment:    { icon: "▤", label: "Employment",    tone: "var(--brand-soft)" },
    alert:         { icon: "⚑", label: "Alert",         tone: "var(--serious-soft)" }
  };

  /* ---------- build each role's inbox from real records ---------- */

  function traineeNotices() {
    const out = [];
    const waves = { "3m": "3-month", "6m": "6-month", "12m": "12-month", "24m": "24-month" };

    Object.keys(P.follow || {}).forEach((w) => {
      const status = P.follow[w];
      if (status === "scheduled") return;
      if (status === "responded" || status === "assisted") {
        out.push({
          kind: "followup", unread: false, action: false, at: "2026-07-14",
          title: `${waves[w]} follow-up recorded`,
          body: "Thank you — your response keeps your record verified and counts towards your district's outcome figures."
        });
      } else {
        out.push({
          kind: "followup", unread: true, action: true, at: "2026-09-16",
          title: `Your ${waves[w]} employment follow-up is due`,
          body: "Three questions, about a minute. Unanswered waves are recorded as no-response and weaken the evidence for your course.",
          cta: { label: "Answer now", href: "outcome.html" }
        });
      }
    });

    out.push({
      kind: "employment", unread: false, action: false, at: "2026-09-02",
      title: `${P.employer} confirmed your employment record`,
      body: `Your role as ${P.role} at ${inr(P.currentSalary)}/month is now marked verified.`
    });

    out.push({
      kind: "certification", unread: false, action: false, at: P.certDate,
      title: "Your certificate has been issued",
      body: `NSQF Level 4 · ${P.certId} for ${P.course}. Employers you apply to can see this.`
    });

    const gap = DB.SKILL_GAPS.find((g) => g.course === P.course);
    if (gap) {
      const missing = gap.industry.filter((k) => !gap.taught.includes(k));
      if (missing.length) {
        out.push({
          kind: "missing", unread: true, action: true, at: "2026-08-19",
          title: "A course is recommended for you",
          body: `Employers in your sector ask for ${missing.slice(0, 2).join(" and ")}, which your course did not cover. A short module would close that gap.`,
          cta: { label: "See recommendations", href: "trainee.html#skills" }
        });
      }
    }

    if (!P.altPhone) {
      out.push({
        kind: "missing", unread: true, action: true, at: "2026-08-02",
        title: "Add an alternate contact number",
        body: "Most records go cold because a number changed. A second contact keeps you reachable for two years.",
        cta: { label: "Update contact details", href: "trainee.html#contact" }
      });
    }

    return out;
  }

  function employerNotices() {
    const pending = DB.VERIFY_REQUESTS.filter((v) => v.status === "pending");
    const out = pending.map((v) => ({
      kind: "verification", unread: true, action: true, at: v.raised,
      title: `Verify ${v.trainee} — ${v.role}`,
      body: `Claimed joining ${date(v.since)} at ${inr(v.salary)}/month. Confirm, correct or dispute.`,
      cta: { label: "Review request", href: "employer.html#verify" }
    }));

    const disputed = DB.VERIFY_REQUESTS.filter((v) => v.status === "disputed");
    disputed.forEach((v) => out.push({
      kind: "alert", unread: true, action: true, at: v.raised,
      title: `Disputed record — ${v.trainee}`,
      body: "You marked this record as disputed. The mission office has been notified and will reconcile it.",
      cta: { label: "Open portal", href: "employer.html#verify" }
    }));

    const open = DB.JOB_POSTINGS.filter((j) => j.status === "open");
    open.forEach((j) => out.push({
      kind: "employment", unread: false, action: false, at: j.posted,
      title: `${j.applicants} candidates matched "${j.title}"`,
      body: `${j.openings} openings in ${j.district}. Certified trainees matching your skills are ready to contact.`,
      cta: { label: "View candidates", href: "employer.html#openings" }
    }));

    return out;
  }

  function adminNotices() {
    const open = DB.VALIDATION_QUEUE;
    const critical = open.filter((f) => f.severity === "critical");

    const out = critical.map((f) => ({
      kind: "alert", unread: true, action: true, at: f.raised,
      title: `${f.type} — needs review`,
      body: `${f.detail} Subject: ${f.subject}.`,
      cta: { label: "Open validation queue", href: "admin.html#validation" }
    }));

    out.push({
      kind: "alert", unread: true, action: true, at: "2026-09-14",
      title: `${open.length} records flagged for manual review`,
      body: "The rule engine does not resolve these automatically — uncertain data is held for a human rather than treated as true.",
      cta: { label: "Review queue", href: "admin.html#validation" }
    });

    DB.CAMPAIGNS.filter((c) => c.status === "running").forEach((c) => {
      const rate = c.sent ? (c.responded / c.sent) * 100 : 0;
      out.push({
        kind: "followup", unread: rate < 70, action: rate < 70, at: c.started,
        title: `${c.name} — ${rate.toFixed(0)}% response`,
        body: `${c.responded.toLocaleString("en-IN")} of ${c.sent.toLocaleString("en-IN")} contacted via ${c.channel}.`
          + (rate < 70 ? " Below the 70% threshold — consider an assisted-call wave." : ""),
        cta: { label: "Open campaigns", href: "admin.html#followups" }
      });
    });

    const weakest = DB.breakdown(DB.trainees, "provider")
      .slice()
      .sort((a, b) => a.placementRate - b.placementRate)[0];
    if (weakest) {
      out.push({
        kind: "alert", unread: false, action: false, at: "2026-09-11",
        title: `Provider review due — ${weakest.key}`,
        body: `Placement rate ${weakest.placementRate.toFixed(1)}% across ${weakest.total.toLocaleString("en-IN")} trainees, the lowest in the programme.`,
        cta: { label: "Provider performance", href: "admin.html#providers" }
      });
    }

    return out;
  }

  const SOURCES = { trainee: traineeNotices, employer: employerNotices, admin: adminNotices };

  /* ---------- state ---------- */
  let role = "trainee";
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
      { label: "Unread", value: unread, meta: "since your last visit", accent: "var(--series-1)" },
      { label: "Needs action", value: action, meta: "waiting on you", accent: "var(--series-2)" },
      { label: "Follow-ups due", value: followups, meta: "answer to stay verified", accent: "var(--series-4)" },
      { label: "Total", value: notices.length, meta: "last 90 days", accent: "var(--series-7)" }
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
      `${rows.length} of ${notices.length} · viewing as ${role}`;

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

  $("#roleView").addEventListener("change", (e) => { role = e.target.value; load(); });
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
      toast(el.dataset.pref + (el.checked ? " enabled" : " disabled"))));

  load();
})();
