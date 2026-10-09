/* ==========================================================================
   app.js — shared shell: navigation, theme, formatters, small UI utilities
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------- formatters ---------- */
  const num  = (v) => Math.round(v).toLocaleString("en-IN");
  const inr  = (v) => "₹" + Math.round(v).toLocaleString("en-IN");
  const inrK = (v) => v >= 100000 ? "₹" + (v / 100000).toFixed(1) + "L" : v >= 1000 ? "₹" + Math.round(v / 1000) + "k" : "₹" + Math.round(v);
  const pct  = (v, d) => (v || 0).toFixed(d == null ? 1 : d) + "%";
  const compact = (v) => v >= 10000000 ? (v / 10000000).toFixed(1) + "Cr"
    : v >= 100000 ? (v / 100000).toFixed(1) + "L"
    : v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v));
  const date = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso.replace(" ", "T"));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* stable per-name avatar colour from the categorical palette */
  const AVATAR_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return "var(--series-" + AVATAR_SLOTS[h % AVATAR_SLOTS.length] + ")";
  }
  function avatar(name, cls) {
    return `<span class="avatar ${cls || ""}" style="background:${avatarColor(name)}">${esc(initials(name))}</span>`;
  }

  /* ---------- DOM helpers ---------- */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function html(node, markup) { if (node) node.innerHTML = markup; return node; }

  /* ---------- theme ---------- */
  const THEME_KEY = "skilltrack-theme";
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* private mode */ }
    $$("[data-redraw]").forEach((n) => n.__redraw && n.__redraw());
  }
  function initTheme() {
    let t = "system";
    try { t = localStorage.getItem(THEME_KEY) || "system"; } catch (e) { /* ignore */ }
    if (t !== "system") document.documentElement.setAttribute("data-theme", t);
    return t;
  }
  function cycleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? "system" : "dark";
    applyTheme(next);
    toast("Theme: " + next);
    setTimeout(() => $$(".js-chart").forEach((n) => n.__redraw && n.__redraw()), 30);
  }

  /* ---------- navigation ---------- */
  const NAV = [
    { group: "Analytics", items: [
      { id: "dashboard",  label: "Outcome dashboard", icon: "▦", href: "dashboard.html" },
      { id: "gaps",       label: "Skill gaps",        icon: "◫", href: "dashboard.html#gaps" },
      { id: "reasons",    label: "Non-placement",     icon: "◔", href: "dashboard.html#reasons" },
      { id: "cohort",     label: "Trainee registry",  icon: "☰", href: "dashboard.html#registry" },
      { id: "insights",   label: "Insights & actions", icon: "◈", href: "insights.html" },
      { id: "reports",    label: "Reports",           icon: "▤", href: "reports.html" }
    ]},
    { group: "Portals", items: [
      { id: "trainee",  label: "Trainee profile",  icon: "◉", href: "trainee.html" },
      { id: "outcome",  label: "Update outcome",   icon: "✎", href: "outcome.html" },
      { id: "employer", label: "Employer portal",  icon: "▤", href: "employer.html", badge: "3" },
      { id: "admin",    label: "Admin console",    icon: "⚙", href: "admin.html",    badge: "7" }
    ]},
    { group: "Operations", items: [
      { id: "followup",      label: "Follow-up engine", icon: "↻", href: "admin.html#followups" },
      { id: "validation",    label: "Data validation",  icon: "✓", href: "admin.html#validation" },
      { id: "providers",     label: "Providers",        icon: "⌂", href: "admin.html#providers" },
      { id: "notifications", label: "Notifications",    icon: "◇", href: "notifications.html", badge: "5" }
    ]}
  ];

  function renderShell(opts) {
    const page = document.body.dataset.page;
    const sidebar = $(".sidebar");
    if (sidebar) {
      sidebar.innerHTML =
        `<a class="sidebar__brand" href="index.html" style="text-decoration:none">
           <span class="sidebar__mark">ST</span>
           <span><span class="sidebar__name">SkillTrack</span><br><span class="sidebar__sub">MP Skill Mission</span></span>
         </a>
         <nav class="sidebar__nav">` +
        NAV.map((g) =>
          `<div class="nav__label">${g.group}</div>` +
          g.items.map((i) =>
            `<a class="nav__item ${i.id === page ? "nav__item--active" : ""}" href="${i.href}">
               <span class="ico">${i.icon}</span><span>${i.label}</span>
               ${i.badge ? `<span class="nav__badge">${i.badge}</span>` : ""}
             </a>`).join("")).join("") +
        `</nav>
         <div class="sidebar__foot">
           <a href="login.html" style="color:inherit">Switch role / sign out</a>
           <div style="margin-top:6px">Consent-based tracking · DPDP Act 2023</div>
           <div style="margin-top:4px;opacity:.75">Build 2.4.0 · Demo data</div>
         </div>`;
    }

    const topbar = $(".topbar");
    if (topbar && opts) {
      topbar.innerHTML =
        `<button class="btn btn--ghost btn--sm menu-toggle" id="menuToggle" aria-label="Toggle navigation">☰</button>
         <div>
           <div class="topbar__title">${esc(opts.title)}</div>
           <div class="topbar__crumb">${esc(opts.crumb || "")}</div>
         </div>
         <div class="topbar__spacer"></div>
         <label class="topbar__search">
           <span class="muted">⌕</span>
           <input type="search" id="globalSearch" placeholder="Search trainee ID, name, employer…" aria-label="Search">
         </label>
         <button class="btn btn--sm" id="themeToggle" title="Switch light / dark / system">◐</button>
         <div class="person" title="${esc(opts.user.role)}">
           ${avatar(opts.user.name)}
           <span class="nowrap" style="display:none" data-show-md>
             <span class="person__name">${esc(opts.user.name)}</span><br>
             <span class="person__meta">${esc(opts.user.role)}</span>
           </span>
         </div>`;
      $("#themeToggle").addEventListener("click", cycleTheme);
      const mt = $("#menuToggle");
      if (mt) mt.addEventListener("click", () => document.body.classList.toggle("nav-open"));
      document.addEventListener("click", (e) => {
        if (document.body.classList.contains("nav-open") &&
            !e.target.closest(".sidebar") && !e.target.closest("#menuToggle")) {
          document.body.classList.remove("nav-open");
        }
      });
      if (innerWidth > 1180) $("[data-show-md]").style.display = "block";
      const gs = $("#globalSearch");
      if (gs) gs.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.value.trim()) {
          location.href = "dashboard.html?q=" + encodeURIComponent(e.target.value.trim()) + "#registry";
        }
      });
    }
  }

  /* ---------- toast ---------- */
  let toastEl;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText =
        "position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(14px);z-index:200;" +
        "padding:10px 16px;border-radius:8px;font-size:13px;font-weight:560;opacity:0;" +
        "transition:opacity .16s ease, transform .16s ease;box-shadow:var(--shadow-lg);" +
        "border:1px solid var(--border-strong);background:var(--surface-1);color:var(--text-primary);max-width:min(440px,90vw)";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.borderLeft = "3px solid " + (kind === "bad" ? "var(--critical)" : kind === "warn" ? "var(--warning)" : "var(--good)");
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(() => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(-50%) translateY(14px)";
    }, 2600);
  }

  /* ---------- tabs ---------- */
  function initTabs(root) {
    $$(".tabs", root).forEach((bar) => {
      bar.addEventListener("click", (e) => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        $$(".tab", bar).forEach((t) => t.classList.toggle("tab--active", t === tab));
        const scope = bar.parentElement;
        $$(".tabpanel", scope).forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
        $$(".js-chart", scope).forEach((n) => n.__redraw && n.__redraw());
      });
    });
  }

  /* ---------- CSV export ---------- */
  function exportCSV(filename, headers, rows) {
    const cell = (v) => {
      const s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [headers.map(cell).join(",")]
      .concat(rows.map((r) => r.map(cell).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Downloaded " + filename);
  }

  /* ---------- URL query params (shareable filter state) ---------- */
  function readParams() {
    const p = new URLSearchParams(location.search);
    const o = {};
    p.forEach((v, k) => { o[k] = v; });
    return o;
  }
  const SHAREABLE = ["course", "district", "batch", "provider", "gender", "outcome", "q", "id"];
  function writeParams(obj) {
    const p = new URLSearchParams();
    SHAREABLE.forEach((k) => { const v = obj[k]; if (v && v !== "all") p.set(k, v); });
    const qs = p.toString();
    // file:// forbids replaceState — the page still works, the URL just won't update.
    try {
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (e) { /* opened directly from disk */ }
  }

  /* ---------- outcome presentation ---------- */
  const OUTCOME_META = {
    employed:   { label: "Employed",       color: "var(--series-1)", chip: "chip--info" },
    self:       { label: "Self-employed",  color: "var(--series-3)", chip: "chip--good" },
    apprentice: { label: "Apprenticeship", color: "var(--series-4)", chip: "chip--warning" },
    notplaced:  { label: "Not placed",     color: "var(--series-8)", chip: "chip--critical" }
  };
  const outcomeChip = (o) =>
    `<span class="chip ${OUTCOME_META[o].chip}"><i class="dot"></i>${OUTCOME_META[o].label}</span>`;

  const SEVERITY_CHIP = { critical: "chip--critical", serious: "chip--serious", warning: "chip--warning", info: "chip--info", good: "chip--good" };

  /* ---------- simple client-side table pager ---------- */
  function paginate(rows, pageSize, page) {
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const p = Math.min(Math.max(1, page), pages);
    return { page: p, pages, slice: rows.slice((p - 1) * pageSize, p * pageSize) };
  }
  function pagerHTML(state, idPrefix) {
    return `<button class="btn btn--sm" id="${idPrefix}Prev" ${state.page === 1 ? "disabled" : ""}>← Prev</button>
            <span class="small muted tnum">Page ${state.page} of ${state.pages}</span>
            <button class="btn btn--sm" id="${idPrefix}Next" ${state.page === state.pages ? "disabled" : ""}>Next →</button>`;
  }

  /* ---------- demo-action wiring: any [data-demo] element shows a toast ---------- */
  function initDemoActions(root) {
    (root || document).addEventListener("click", (e) => {
      const btn = e.target.closest("[data-demo]");
      if (!btn) return;
      e.preventDefault();
      toast(btn.dataset.demo, btn.dataset.demoKind);
    });
  }

  initTheme();

  global.UI = {
    num, inr, inrK, pct, compact, date, initials, esc, avatar, avatarColor,
    $, $$, html, renderShell, toast, initTabs, exportCSV, readParams, writeParams,
    OUTCOME_META, outcomeChip, SEVERITY_CHIP, paginate, pagerHTML, initDemoActions,
    applyTheme, cycleTheme
  };
})(window);
