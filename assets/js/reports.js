/* ==========================================================================
   reports.js — report builder

   Seven report types over one filtered cohort. Each declares its own columns and
   a row builder, so adding a report is a data change rather than a new page.

   The preview is the export: what the table shows is exactly what the CSV
   contains and what the PDF prints. A preview that differs from its export is
   how people end up circulating numbers nobody can reproduce.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, num, inr, pct, toast } = UI;

  UI.renderShell({
    title: "Reports",
    crumb: "Analytics · generate and export",
    user: { name: DB.ADMIN_USER.name, role: DB.ADMIN_USER.role }
  });

  const pct1 = (v) => pct(v, 1);

  /* ======================================================================
     Report definitions
     ====================================================================== */
  const REPORTS = {
    course: {
      icon: "◫", title: "Course report",
      sub: "Outcomes for every course in scope — which curricula lead to work.",
      columns: [
        { key: "key",    label: "Course",            fmt: esc },
        { key: "total",  label: "Trainees",          fmt: num,  align: "right" },
        { key: "placementRate",     label: "Placed",        fmt: pct1, align: "right" },
        { key: "employmentRate",    label: "Wage employed", fmt: pct1, align: "right" },
        { key: "avgStartingSalary", label: "Avg. start",    fmt: inr,  align: "right" },
        { key: "retention12m",      label: "12m retention", fmt: pct1, align: "right" },
        { key: "relevance",         label: "Relevance",     fmt: pct1, align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "course")
    },

    provider: {
      icon: "⌂", title: "Provider report",
      sub: "Accountability by training provider, against comparable indicators.",
      columns: [
        { key: "key",    label: "Provider",  fmt: esc },
        { key: "total",  label: "Trainees",  fmt: num,  align: "right" },
        { key: "placementRate",     label: "Placed",        fmt: pct1, align: "right" },
        { key: "avgStartingSalary", label: "Avg. start",    fmt: inr,  align: "right" },
        { key: "retention12m",      label: "12m retention", fmt: pct1, align: "right" },
        { key: "certification",     label: "Certified",     fmt: pct1, align: "right" },
        { key: "responseRate",      label: "Follow-up resp.", fmt: pct1, align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "provider")
    },

    district: {
      icon: "⌖", title: "District report",
      sub: "Geography of outcomes — where training converts and where it does not.",
      columns: [
        { key: "key",    label: "District", fmt: esc },
        { key: "total",  label: "Trainees", fmt: num,  align: "right" },
        { key: "placementRate",  label: "Placed",        fmt: pct1, align: "right" },
        { key: "selfRate",       label: "Self-employed", fmt: pct1, align: "right" },
        { key: "avgStartingSalary", label: "Avg. start", fmt: inr,  align: "right" },
        { key: "retention12m",   label: "12m retention", fmt: pct1, align: "right" },
        { key: "consentRate",    label: "Consent",       fmt: pct1, align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "district")
    },

    cohort: {
      icon: "☰", title: "Cohort report",
      sub: "Batch by batch — the only view where time since training is comparable.",
      columns: [
        { key: "key",    label: "Cohort",   fmt: esc },
        { key: "total",  label: "Trainees", fmt: num,  align: "right" },
        { key: "placementRate",  label: "Placed",     fmt: pct1, align: "right" },
        { key: "avgStartingSalary", label: "Avg. start",  fmt: inr, align: "right" },
        { key: "avgWageGrowth",  label: "Wage growth", fmt: inr,  align: "right" },
        { key: "retention12m",   label: "12m retention", fmt: pct1, align: "right" },
        { key: "responseRate",   label: "Follow-up resp.", fmt: pct1, align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "batch").slice().sort((a, b) => String(a.key).localeCompare(String(b.key)))
    },

    employment: {
      icon: "▤", title: "Employment report",
      sub: "The outcome split itself, by sector — employed, self-employed, apprenticed, not placed.",
      columns: [
        { key: "key",    label: "Sector",   fmt: esc },
        { key: "total",  label: "Trainees", fmt: num,  align: "right" },
        { key: "employed",   label: "Employed",   fmt: num, align: "right" },
        { key: "self",       label: "Self-emp.",  fmt: num, align: "right" },
        { key: "apprentice", label: "Apprentice", fmt: num, align: "right" },
        { key: "notplaced",  label: "Not placed", fmt: num, align: "right" },
        { key: "placementRate", label: "Placed", fmt: pct1, align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "sector").map((r) => Object.assign({}, r, r.counts))
    },

    skillgap: {
      icon: "⚠", title: "Skill-gap report",
      sub: "What industry asks for against what the curriculum teaches.",
      columns: [
        { key: "course",      label: "Course",   fmt: esc },
        { key: "coverage",    label: "Coverage", fmt: pct1, align: "right" },
        { key: "demandIndex", label: "Demand",   fmt: (v) => String(v), align: "right" },
        { key: "taughtList",  label: "Taught",   fmt: esc },
        { key: "gapList",     label: "Missing",  fmt: esc }
      ],
      // Independent of the cohort filter: the curriculum is the same whoever sat it.
      rows: () => DB.skillGapRows().map((g) => Object.assign({}, g, {
        taughtList: g.taught.join(", "),
        gapList: g.gap.join(", ") || "—"
      })),
      ignoresFilters: true
    },

    retention: {
      icon: "↻", title: "Retention report",
      sub: "Who was still in work at 12 months, and how wages moved.",
      columns: [
        { key: "key",    label: "Course",   fmt: esc },
        { key: "total",  label: "Trainees", fmt: num,  align: "right" },
        { key: "placementRate",     label: "Placed",        fmt: pct1, align: "right" },
        { key: "retention12m",      label: "12m retention", fmt: pct1, align: "right" },
        { key: "avgStartingSalary", label: "Avg. start",    fmt: inr,  align: "right" },
        { key: "avgWageGrowth",     label: "Wage growth",   fmt: inr,  align: "right" }
      ],
      rows: (rows) => DB.breakdown(rows, "course")
        .slice().sort((a, b) => a.retention12m - b.retention12m)
    }
  };

  const SCHEDULED = [
    { name: "Monthly programme summary", cadence: "1st of each month", to: "Mission director", next: "01 Oct 2026" },
    { name: "Provider accountability pack", cadence: "Quarterly", to: "Accreditation committee", next: "01 Jan 2027" },
    { name: "District outcome brief", cadence: "Fortnightly", to: "District co-ordinators", next: "01 Oct 2026" },
    { name: "Skill-gap digest", cadence: "Quarterly", to: "Curriculum board", next: "01 Jan 2027" }
  ];

  /* ======================================================================
     State
     ====================================================================== */
  let type = null;
  let current = null;       // the generated report: { def, columns, rows, filters, at }
  const recent = [];

  /* ---------- populate pickers ---------- */
  $("#reportChoices").innerHTML = Object.keys(REPORTS).map((k) => {
    const r = REPORTS[k];
    return `<label class="choice">
              <input type="radio" name="report" value="${k}">
              <span class="choice__check">✓</span>
              <span class="choice__ico">${r.icon}</span>
              <span class="choice__title">${esc(r.title)}</span>
              <span class="choice__sub">${esc(r.sub)}</span>
            </label>`;
  }).join("");

  const fill = (sel, items) =>
    $(sel).insertAdjacentHTML("beforeend",
      items.map((v) => `<option>${esc(v)}</option>`).join(""));

  fill("#fCourse", DB.COURSES.map((c) => c.name));
  fill("#fDistrict", DB.DISTRICTS.map((d) => d.name));
  fill("#fProvider", DB.PROVIDERS.map((p) => p.name));
  fill("#fBatch", DB.BATCHES.map((b) => b.id));

  $("#scheduledList").innerHTML = SCHEDULED.map((s) => `
    <div class="list-row">
      <div class="list-row__main">
        <div class="list-row__title">${esc(s.name)}</div>
        <div class="list-row__sub">${esc(s.cadence)} · to ${esc(s.to)}</div>
      </div>
      <div class="text-right">
        <div class="small muted">Next</div>
        <div class="small tnum">${esc(s.next)}</div>
      </div>
    </div>`).join("");

  /* ---------- filters ---------- */
  function filters() {
    return {
      course: $("#fCourse").value,
      district: $("#fDistrict").value,
      provider: $("#fProvider").value,
      batch: $("#fBatch").value,
      gender: $("#fGender").value
    };
  }

  function scopeLabel(f) {
    const parts = [];
    if (f.course !== "all")   parts.push(f.course);
    if (f.district !== "all") parts.push(f.district);
    if (f.provider !== "all") parts.push(f.provider);
    if (f.batch !== "all")    parts.push("cohort " + f.batch);
    if (f.gender !== "all")   parts.push({ F: "female", M: "male", O: "other" }[f.gender]);
    return parts.length ? parts.join(" · ") : "Whole programme";
  }

  function updateScopeCount() {
    const rows = DB.filterTrainees(filters());
    $("#scopeCount").textContent =
      `${num(rows.length)} trainee${rows.length === 1 ? "" : "s"} in scope · ${scopeLabel(filters())}`;
    $("#generateBtn").disabled = !type;
  }

  $("#reportFilters").addEventListener("change", updateScopeCount);

  $("#reportChoices").addEventListener("change", (e) => {
    if (e.target.name !== "report") return;
    type = e.target.value;
    const def = REPORTS[type];
    $("#scopeSub").textContent = def.ignoresFilters
      ? "This report describes the curriculum, so cohort filters do not apply"
      : "Filters apply to every figure in the report";
    $$("#reportFilters .field").forEach((f) => { f.style.opacity = def.ignoresFilters ? ".45" : "1"; });
    updateScopeCount();
  });

  $("#resetFilters").addEventListener("click", () => {
    $$("#reportFilters select").forEach((s) => { s.value = "all"; });
    updateScopeCount();
    toast("Filters reset");
  });

  /* ======================================================================
     Generate
     ====================================================================== */
  $("#generateBtn").addEventListener("click", () => {
    if (!type) { toast("Choose a report type first", "warn"); return; }

    const def = REPORTS[type];
    const f = filters();
    const cohort = DB.filterTrainees(f);

    if (!def.ignoresFilters && !cohort.length) {
      showEmpty();
      return;
    }

    // A brief skeleton makes the generate step legible; without it a large report
    // simply appears and it is unclear whether anything happened.
    showLoading(def);

    setTimeout(() => {
      const rows = def.rows(cohort);
      current = {
        def, rows, filters: f,
        scope: def.ignoresFilters ? "Curriculum-wide" : scopeLabel(f),
        n: def.ignoresFilters ? null : cohort.length,
        at: new Date()
      };
      renderReport(current);
      pushRecent(current);
    }, 280);
  });

  function showLoading(def) {
    $("#reportTitle").textContent = def.title;
    $("#reportMeta").textContent = "Generating…";
    $("#exportActions").hidden = true;
    $("#reportBody").innerHTML = `
      <div class="card__body">
        ${Array.from({ length: 6 }, () => '<div class="skeleton skeleton--line"></div>').join("")}
      </div>`;
  }

  function showEmpty() {
    $("#reportTitle").textContent = REPORTS[type].title;
    $("#reportMeta").textContent = "No matching records";
    $("#exportActions").hidden = true;
    $("#reportBody").innerHTML = `
      <div class="empty">
        <div class="empty__ico">⌕</div>
        <div class="empty__title">No trainees match this scope</div>
        <div class="empty__body">
          The filter combination you chose returns nothing. Widen one of the filters —
          course and provider together are the usual culprit.
        </div>
        <button class="btn btn--sm" id="emptyReset">Reset filters</button>
      </div>`;
    const btn = $("#emptyReset");
    if (btn) btn.addEventListener("click", () => $("#resetFilters").click());
  }

  /* ======================================================================
     Render
     ====================================================================== */
  function renderReport(r) {
    const { def, rows } = r;

    $("#reportTitle").textContent = def.title;
    $("#reportMeta").textContent =
      `${r.scope} · ${rows.length} row${rows.length === 1 ? "" : "s"}`
      + (r.n != null ? ` · ${num(r.n)} trainees` : "")
      + ` · generated ${r.at.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    $("#exportActions").hidden = false;

    const head = def.columns.map((c) =>
      `<th${c.align === "right" ? ' class="text-right"' : ""}>${esc(c.label)}</th>`).join("");

    const body = rows.map((row) => `
      <tr>${def.columns.map((c) => {
        const raw = row[c.key];
        const shown = raw == null ? "—" : c.fmt(raw);
        return `<td${c.align === "right" ? ' class="text-right tnum"' : ""}>${shown}</td>`;
      }).join("")}</tr>`).join("");

    // A headline strip above the table: the summary a reader needs before the detail.
    $("#reportBody").innerHTML = `
      ${summaryStrip(r)}
      <div class="table-wrap">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function summaryStrip(r) {
    if (r.def.ignoresFilters) {
      const worst = r.rows[0];
      return `<div class="card__body" style="padding-bottom:0">
        <div class="banner banner--warning">
          <span class="banner__ico">⚠</span>
          <div><strong>${esc(worst.course)} has the widest gap</strong>
          ${worst.coverage.toFixed(0)}% of what employers ask for is covered.
          Missing: ${esc(worst.gap.join(", ") || "—")}.</div>
        </div>
      </div>`;
    }

    const s = DB.summarise(DB.filterTrainees(r.filters));
    const tiles = [
      { label: "Trainees", value: num(s.total), accent: "var(--series-7)" },
      { label: "Placed", value: pct(s.placementRate, 1), accent: "var(--series-1)" },
      { label: "Avg. starting salary", value: inr(s.avgStartingSalary), accent: "var(--series-3)" },
      { label: "12-month retention", value: pct(s.retention12m, 1), accent: "var(--series-4)" }
    ];
    return `<div class="card__body" style="padding-bottom:0">
      <div class="grid grid--4">
        ${tiles.map((t) => `
          <div class="stat" style="--accent:${t.accent}">
            <div class="stat__label">${esc(t.label)}</div>
            <div class="stat__value tnum">${t.value}</div>
          </div>`).join("")}
      </div>
    </div>`;
  }

  /* ======================================================================
     Recent list
     ====================================================================== */
  function pushRecent(r) {
    recent.unshift(r);
    if (recent.length > 6) recent.pop();
    $("#recentList").innerHTML = recent.map((x, i) => `
      <div class="list-row">
        <div class="list-row__main">
          <div class="list-row__title">${esc(x.def.title)}</div>
          <div class="list-row__sub">${esc(x.scope)} · ${x.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <button class="btn btn--sm" data-recent="${i}">Export CSV</button>
      </div>`).join("");
  }

  $("#recentList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-recent]");
    if (btn) exportCsv(recent[Number(btn.dataset.recent)]);
  });

  /* ======================================================================
     Export
     ====================================================================== */
  function exportCsv(r) {
    if (!r) { toast("Generate a report first", "warn"); return; }
    const headers = r.def.columns.map((c) => c.label);
    const rows = r.rows.map((row) => r.def.columns.map((c) => {
      const raw = row[c.key];
      if (raw == null) return "";
      // Numbers go out unformatted — a spreadsheet cannot sum "₹18,648".
      return typeof raw === "number" ? Math.round(raw * 100) / 100 : raw;
    }));
    const slug = r.def.title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    UI.exportCSV(`${slug}-${r.at.toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  $("#exportCsv").addEventListener("click", () => exportCsv(current));

  $("#exportPdf").addEventListener("click", () => {
    if (!current) { toast("Generate a report first", "warn"); return; }
    // The print stylesheet already strips the shell and chrome, so the browser's
    // own "Save as PDF" produces the report on its own — no PDF library needed.
    toast("Opening print dialogue — choose “Save as PDF”");
    setTimeout(() => window.print(), 260);
  });

  updateScopeCount();
})();
