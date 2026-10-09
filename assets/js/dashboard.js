/* ==========================================================================
   dashboard.js — outcome analytics page
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, inrK, pct, compact, esc, avatar, outcomeChip, toast } = UI;

  UI.renderShell({
    title: "Outcome dashboard",
    crumb: "Analytics · Madhya Pradesh · updated 17 Sep 2026, 09:12 IST",
    user: DB.ADMIN_USER
  });
  UI.initDemoActions();

  /* ---------- filter state ---------- */
  const params = UI.readParams();
  const state = {
    course:   params.course   || "all",
    district: params.district || "all",
    batch:    params.batch    || "all",
    provider: params.provider || "all",
    gender:   params.gender   || "all",
    outcome:  params.outcome  || "all",
    q:        params.q        || "",
    page: 1, mixMode: "count", provMetric: "placement"
  };

  const fill = (sel, items, allLabel) => {
    sel.innerHTML = `<option value="all">${allLabel}</option>` +
      items.map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join("");
  };
  fill($("#fCourse"),   DB.COURSES.map((c) => ({ value: c.name, label: c.name })), "All courses");
  fill($("#fDistrict"), DB.DISTRICTS.map((d) => ({ value: d.name, label: d.name })), "All districts");
  fill($("#fBatch"),    DB.BATCHES.map((b) => ({ value: b.id, label: b.label })), "All batches");
  fill($("#fProvider"), DB.PROVIDERS.map((p) => ({ value: p.name, label: p.name })), "All providers");
  fill($("#fGender"),   [{ value: "F", label: "Women" }, { value: "M", label: "Men" }, { value: "O", label: "Other" }], "All genders");
  fill($("#fOutcome"),  Object.entries(UI.OUTCOME_META).map(([k, v]) => ({ value: k, label: v.label })), "All outcomes");

  ["course", "district", "batch", "provider", "gender", "outcome"].forEach((key) => {
    const sel = $("#f" + key[0].toUpperCase() + key.slice(1));
    sel.value = state[key];
    sel.addEventListener("change", () => {
      state[key] = sel.value;
      state.page = 1;
      UI.writeParams(state);
      render();
    });
  });
  $("#registrySearch").value = state.q;
  $("#registrySearch").addEventListener("input", (e) => {
    state.q = e.target.value; state.page = 1; renderRegistry();
  });
  $("#fReset").addEventListener("click", () => {
    ["course", "district", "batch", "provider", "gender", "outcome"].forEach((k) => {
      state[k] = "all";
      $("#f" + k[0].toUpperCase() + k.slice(1)).value = "all";
    });
    state.q = ""; $("#registrySearch").value = ""; state.page = 1;
    UI.writeParams(state); render(); toast("Filters cleared");
  });

  /* ---------- tab controls ---------- */
  $("#mixTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    $$("#mixTabs .tab").forEach((x) => x.classList.toggle("tab--active", x === t));
    state.mixMode = t.dataset.tab; renderMix();
  });
  $("#provTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    $$("#provTabs .tab").forEach((x) => x.classList.toggle("tab--active", x === t));
    state.provMetric = t.dataset.tab; renderProviders();
  });

  /* ---------- derived data, recomputed each render ---------- */
  let rows = [], sum = {}, baseline = DB.summarise(DB.trainees);

  function scopeRows() { return DB.filterTrainees({
    course: state.course, district: state.district, batch: state.batch,
    provider: state.provider, gender: state.gender }); }

  /* ---------- KPI tiles ---------- */
  function renderKPIs() {
    const filtered = state.course !== "all" || state.district !== "all" ||
                     state.batch !== "all" || state.provider !== "all" || state.gender !== "all";
    const tiles = [
      { label: "Total trainees",    value: num(sum.total), base: null, accent: "var(--series-7)",
        meta: `${pct(sum.consentRate, 1)} with active consent` },
      { label: "Employment rate",   value: pct(sum.employmentRate, 0), base: baseline.employmentRate, cur: sum.employmentRate,
        accent: "var(--series-1)", meta: `${num(sum.counts.employed)} in wage employment` },
      { label: "Self-employed",     value: pct(sum.selfRate, 0), base: baseline.selfRate, cur: sum.selfRate,
        accent: "var(--series-3)", meta: `${num(sum.counts.self)} running own work` },
      { label: "Apprenticeship",    value: pct(sum.apprenticeRate, 0), base: baseline.apprenticeRate, cur: sum.apprenticeRate,
        accent: "var(--series-4)", meta: `${num(sum.counts.apprentice)} in apprenticeships` },
      { label: "Not placed",        value: pct(sum.notPlacedRate, 0), base: baseline.notPlacedRate, cur: sum.notPlacedRate, invert: true,
        accent: "var(--series-8)", meta: `${num(sum.counts.notplaced)} awaiting an outcome` },
      { label: "Avg. starting salary", value: inr(sum.avgStartingSalary), base: baseline.avgStartingSalary, cur: sum.avgStartingSalary, money: true,
        accent: "var(--series-1)", meta: `+${inr(sum.avgWageGrowth)} avg. growth since` },
      { label: "12-month retention", value: pct(sum.retention12m, 0), base: baseline.retention12m, cur: sum.retention12m,
        accent: "var(--series-3)", meta: "of those placed 12+ months ago" },
      { label: "Training relevance", value: pct(sum.relevance, 0), base: baseline.relevance, cur: sum.relevance,
        accent: "var(--series-7)", meta: "self-rated fit of training to work" }
    ];

    $("#kpiGrid").innerHTML = tiles.map((t) => {
      let delta = "";
      if (filtered && t.base != null) {
        const d = t.cur - t.base;
        const good = t.invert ? d < 0 : d > 0;
        const shown = t.money ? inr(Math.abs(d)) : Math.abs(d).toFixed(1) + " pp";
        delta = `<span class="delta ${good ? "delta--up" : "delta--down"}">${d >= 0 ? "▲" : "▼"} ${shown}</span>
                 <span class="muted small">vs all cohorts</span>`;
      }
      return `<div class="stat" style="--accent:${t.accent}">
          <div class="stat__label">${esc(t.label)}</div>
          <div class="stat__value">${t.value}</div>
          <div class="stat__meta">${delta || `<span class="muted">${esc(t.meta)}</span>`}</div>
        </div>`;
    }).join("");

    const bits = [];
    if (state.course   !== "all") bits.push(state.course);
    if (state.provider !== "all") bits.push(state.provider);
    if (state.district !== "all") bits.push(state.district + " district");
    if (state.batch    !== "all") bits.push("batch " + state.batch);
    if (state.gender   !== "all") bits.push({ F: "women", M: "men", O: "other genders" }[state.gender]);
    $("#scopeText").textContent = bits.length
      ? ` ${num(sum.total)} trainees — ${bits.join(" · ")}. Deltas compare against the full ${num(baseline.total)}-trainee cohort.`
      : ` All ${num(sum.total)} trainees across 5 batches, 10 courses, 6 providers and 8 districts.`;
  }

  /* ---------- outcome mix by batch (stacked) ---------- */
  function renderMix() {
    const byBatch = DB.BATCHES.map((b) => {
      const g = rows.filter((t) => t.batch === b.id);
      const s = DB.summarise(g);
      return { label: b.id, parts: [
        { name: "Employed",       value: s.counts.employed,   color: "var(--series-1)" },
        { name: "Self-employed",  value: s.counts.self,       color: "var(--series-3)" },
        { name: "Apprenticeship", value: s.counts.apprentice, color: "var(--series-4)" },
        { name: "Not placed",     value: s.counts.notplaced,  color: "var(--series-8)" }
      ] };
    });
    Viz.stackedBarV($("#chartMix"), {
      groups: byBatch, height: 268, pct: state.mixMode === "pct", format: num
    });
    Viz.legend($("#legendMix"), byBatch[0].parts.map((p) => ({ label: p.name, color: p.color })));
  }

  /* ---------- donut ---------- */
  function renderDonut() {
    const items = [
      { label: "Employed",       value: sum.counts.employed,   color: "var(--series-1)" },
      { label: "Self-employed",  value: sum.counts.self,       color: "var(--series-3)" },
      { label: "Apprenticeship", value: sum.counts.apprentice, color: "var(--series-4)" },
      { label: "Not placed",     value: sum.counts.notplaced,  color: "var(--series-8)" }
    ];
    Viz.donut($("#chartDonut"), {
      items, height: 236, format: num,
      centerValue: pct(sum.placementRate, 0), centerLabel: "placed in some form"
    });
    Viz.legend($("#legendDonut"), items.map((i) => ({
      label: i.label, color: i.color, value: pct((i.value / (sum.total || 1)) * 100, 1)
    })));
  }

  /* ---------- wage progression ---------- */
  function renderWage() {
    const prog = DB.wageProgression(rows);
    const women = DB.wageProgression(rows.filter((t) => t.gender === "F"));
    const men   = DB.wageProgression(rows.filter((t) => t.gender === "M"));
    Viz.line($("#chartWage"), {
      xLabels: prog.map((p) => p.label),
      series: [
        { name: "All trainees", color: "var(--series-1)", values: prog.map((p) => p.value) },
        { name: "Women",        color: "var(--series-5)", values: women.map((p) => p.value) },
        { name: "Men",          color: "var(--series-3)", values: men.map((p) => p.value) }
      ],
      height: 250, area: false, format: inr, tickFormat: inrK, padLeft: 56
    });
    Viz.legend($("#legendWage"), [
      { label: "All trainees", color: "var(--series-1)" },
      { label: "Women",        color: "var(--series-5)" },
      { label: "Men",          color: "var(--series-3)" }
    ]);
  }

  /* ---------- provider comparison ---------- */
  function renderProviders() {
    const byProv = DB.breakdown(rows, "provider");
    const metric = {
      placement: { get: (p) => p.placementRate,     fmt: (v) => pct(v, 1), name: "Placement rate", color: "var(--series-1)" },
      salary:    { get: (p) => p.avgStartingSalary, fmt: inr,              name: "Avg. starting salary", color: "var(--series-3)" },
      retention: { get: (p) => p.retention12m,      fmt: (v) => pct(v, 1), name: "12-month retention", color: "var(--series-7)" }
    }[state.provMetric];

    const items = byProv.map((p) => ({
      label: p.key.replace(/ (Institute|Academy|Centre|Hub|Polytechnic)$/, ""),
      value: Math.round(metric.get(p)),
      pct: null, note: num(p.total), noteLabel: "Trainees",
      color: metric.color
    })).sort((a, b) => b.value - a.value);

    Viz.barH($("#chartProvider"), {
      items, rowHeight: 34, labelWidth: 150, valueName: metric.name,
      format: metric.fmt, endLabel: (d) => metric.fmt(d.value)
    });
  }

  /* ---------- follow-up waves ---------- */
  function renderFollow() {
    const waves = DB.followUpWaves(rows);
    const groups = waves.map((w) => ({
      label: w.wave,
      parts: [
        { name: "Responded",       value: w.responded,  color: "var(--series-1)" },
        { name: "Assisted call",   value: w.assisted,   color: "var(--series-4)" },
        { name: "No response",     value: w.noResponse, color: "var(--series-8)" },
        { name: "Not yet due",     value: w.scheduled,  color: "var(--surface-3)" }
      ]
    }));
    Viz.stackedBarV($("#chartFollow"), { groups, height: 232, pct: true, format: num });
    Viz.legend($("#legendFollow"), groups[0].parts.map((p) => ({ label: p.name, color: p.color })));
  }

  /* ---------- district heat strip ---------- */
  function renderDistricts() {
    const byDist = DB.breakdown(rows, "district").slice(0, 8);
    Viz.heatstrip($("#chartDistrict"), {
      colLabels: ["Employed", "Self-emp.", "Retention"],
      labelWidth: 96,
      rows: byDist.map((d) => ({
        label: d.key,
        cells: [
          { label: "Employment rate", value: d.employmentRate },
          { label: "Self-employment", value: d.selfRate },
          { label: "12-month retention", value: d.retention12m }
        ]
      })),
      cellText: (c) => Math.round(c.value) + "%",
      format: (v) => pct(v, 1)
    });
  }

  /* ---------- demographics ---------- */
  function renderDemographics() {
    const bands = [[18, 21], [22, 25], [26, 29], [30, 34]];
    const items = bands.map((b) => {
      const g = rows.filter((t) => t.age >= b[0] && t.age <= b[1]);
      const s = DB.summarise(g);
      return { label: b[0] + "–" + b[1], value: Math.round(s.placementRate), note: num(g.length), noteLabel: "Trainees", color: "var(--series-1)" };
    });
    Viz.barV($("#chartDemo"), {
      items, height: 190, valueLabels: true, rotate: false,
      valueName: "Placement rate", format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%"
    });

    const women = DB.summarise(rows.filter((t) => t.gender === "F"));
    const men   = DB.summarise(rows.filter((t) => t.gender === "M"));
    $("#demoNotes").innerHTML = [
      { l: "Women — placement", v: women.placementRate, n: women.total, c: "var(--series-5)" },
      { l: "Men — placement",   v: men.placementRate,   n: men.total,   c: "var(--series-3)" }
    ].map((r) => `
      <div class="meter-row" style="--accent:${r.c}">
        <span class="meter-row__label">${r.l} <span class="muted">(${num(r.n)})</span></span>
        <span class="meter-row__val">${pct(r.v, 1)}</span>
        <span class="meter"><span style="width:${Math.min(100, r.v)}%"></span></span>
      </div>`).join("");
  }

  /* ---------- skill gaps ---------- */
  function renderGaps() {
    const gaps = DB.skillGapRows();
    $("#gapTable tbody").innerHTML = gaps.map((g) => `
      <tr>
        <td><strong>${esc(g.course)}</strong></td>
        <td><div class="row row--tight">${g.industry.map((s) =>
            `<span class="skill-tag ${g.taught.includes(s) ? "skill-tag--have" : ""}">${esc(s)}</span>`).join("")}</div></td>
        <td><div class="row row--tight">${g.taught.map((s) => `<span class="skill-tag">${esc(s)}</span>`).join("")}</div></td>
        <td><div class="row row--tight">${g.gap.length
              ? g.gap.map((s) => `<span class="skill-tag skill-tag--gap">${esc(s)}</span>`).join("")
              : '<span class="chip chip--good">No gap</span>'}</div></td>
        <td class="num">
          <div class="meter-row" style="--accent:${g.coverage < 60 ? "var(--critical)" : g.coverage < 75 ? "var(--warning)" : "var(--good)"};margin:0">
            <span class="meter-row__label"></span>
            <span class="meter-row__val">${pct(g.coverage, 0)}</span>
            <span class="meter"><span style="width:${g.coverage}%"></span></span>
          </div>
        </td>
        <td class="num tnum">${g.demandIndex}</td>
      </tr>`).join("");

    $("#exportGaps").onclick = () => UI.exportCSV("skill-gaps.csv",
      ["Course", "Industry requires", "Taught", "Gap", "Coverage %", "Demand index"],
      gaps.map((g) => [g.course, g.industry.join(" | "), g.taught.join(" | "), g.gap.join(" | "), g.coverage.toFixed(0), g.demandIndex]));
  }

  /* ---------- non-placement reasons + actions ---------- */
  const ACTIONS = {
    SKILL:    ["Add the missing modules to the curriculum", "Top 3 gap skills in this scope are pushed to the provider as a mandatory bridge module before the next batch."],
    EXP:      ["Expand apprenticeship and OJT slots", "Convert employer partners into 3-month on-the-job training hosts so first-job experience is built in."],
    INTV:     ["Mandatory interview-readiness sprint", "Two-week soft-skills and mock-interview block scheduled in the final month of the course."],
    NOJOB:    ["Open a mobility and remote-work track", "Fund relocation stipends to demand districts and prioritise remote-capable courses where local demand is thin."],
    SALARY:   ["Wage-expectation counselling at enrolment", "Publish real placement wage bands per course so expectations are set before the course begins, not after."],
    PERSONAL: ["Flexible re-entry and part-time batches", "Allow deferred completion and evening batches for trainees with care or relocation constraints."],
    RELEV:    ["Re-map the course to live demand", "Course is under-aligned with employer postings — trigger a curriculum review and consider retiring low-demand seats."]
  };
  function renderReasons() {
    const data = DB.reasonBreakdown(rows);
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    Viz.barH($("#chartReasons"), {
      items: data.map((d) => ({ label: d.label, value: d.value, pct: (d.value / total) * 100, color: "var(--series-2)" })),
      rowHeight: 32, labelWidth: 190, valueName: "Trainees", format: num,
      endLabel: (d) => pct((d.value / total) * 100, 0)
    });

    $("#actionList").innerHTML = data.slice(0, 4).map((d, i) => {
      const a = ACTIONS[d.code];
      return `<div class="list-row" style="padding-left:0;padding-right:0">
        <span class="avatar" style="background:var(--series-${[2, 4, 3, 7][i]})">${i + 1}</span>
        <div class="list-row__main">
          <div class="list-row__title">${esc(a[0])}</div>
          <div class="list-row__sub">${esc(a[1])}</div>
        </div>
        <span class="chip chip--brand nowrap">${num(d.value)} affected</span>
      </div>`;
    }).join("");
  }

  /* ---------- registry table ---------- */
  const FOLLOW_CHIP = {
    responded:     '<span class="chip chip--good"><i class="dot"></i>Responded</span>',
    assisted:      '<span class="chip chip--warning"><i class="dot"></i>Assisted</span>',
    "no-response": '<span class="chip chip--critical"><i class="dot"></i>No response</span>',
    scheduled:     '<span class="chip"><i class="dot"></i>Scheduled</span>'
  };
  function latestWave(t) {
    const order = ["24m", "12m", "6m", "3m"];
    for (const w of order) if (t.follow[w] !== "scheduled") return { wave: w, status: t.follow[w] };
    return { wave: "3m", status: "scheduled" };
  }

  function renderRegistry() {
    let list = rows;
    if (state.outcome !== "all") list = list.filter((t) => t.outcome === state.outcome);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((t) => (t.name + " " + t.id + " " + t.district + " " + t.course + " " + (t.employer || "")).toLowerCase().includes(q));
    }
    const p = UI.paginate(list, 12, state.page);
    state.page = p.page;

    $("#registryCount").textContent =
      `${num(list.length)} records in scope · showing ${p.slice.length} · click a row to open the trainee profile`;

    $("#registryTable tbody").innerHTML = p.slice.length ? p.slice.map((t) => {
      const f = latestWave(t);
      return `<tr style="cursor:pointer" data-id="${t.id}">
        <td><div class="person">${avatar(t.name)}<div>
            <div class="person__name">${esc(t.name)}</div>
            <div class="person__meta">${t.age} · ${t.gender === "F" ? "Female" : t.gender === "M" ? "Male" : "Other"}</div>
          </div></div></td>
        <td class="tbl__id">${t.id}</td>
        <td>${esc(t.course)}</td>
        <td>${esc(t.provider)}</td>
        <td>${esc(t.district)}</td>
        <td class="tnum">${t.batch}</td>
        <td class="num">${t.attendance}%</td>
        <td class="num">${t.score}</td>
        <td>${outcomeChip(t.outcome)}</td>
        <td class="num">${t.currentSalary ? inr(t.currentSalary) : '<span class="muted">—</span>'}</td>
        <td>${FOLLOW_CHIP[f.status]} <span class="muted small">${f.wave}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="11" class="tbl-empty">No trainees match these filters.</td></tr>`;

    $("#registryPager").innerHTML = UI.pagerHTML(p, "reg");
    const prev = $("#regPrev"), next = $("#regNext");
    if (prev) prev.onclick = () => { state.page--; renderRegistry(); };
    if (next) next.onclick = () => { state.page++; renderRegistry(); };

    $("#registryTable tbody").onclick = (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr) location.href = "trainee.html?id=" + encodeURIComponent(tr.dataset.id);
    };

    $("#exportRegistry").onclick = () => UI.exportCSV("trainee-registry.csv",
      ["Unique ID", "Name", "Gender", "Age", "Course", "Provider", "District", "Batch",
       "Attendance %", "Score", "Outcome", "Starting salary", "Current salary", "Employer", "Retained 12m"],
      list.slice(0, 2000).map((t) => [t.id, t.name, t.gender, t.age, t.course, t.provider, t.district,
        t.batch, t.attendance, t.score, UI.OUTCOME_META[t.outcome].label, t.startingSalary,
        t.currentSalary, t.employer || "", t.retained12m == null ? "n/a" : t.retained12m ? "Yes" : "No"]));
  }

  /* ---------- KPI export ---------- */
  $("#exportKpi").addEventListener("click", () => {
    UI.exportCSV("outcome-summary.csv",
      ["Metric", "Value", "Scope"],
      [
        ["Total trainees", sum.total, scopeLabel()],
        ["Employment rate %", sum.employmentRate.toFixed(1), scopeLabel()],
        ["Self-employed %", sum.selfRate.toFixed(1), scopeLabel()],
        ["Apprenticeship %", sum.apprenticeRate.toFixed(1), scopeLabel()],
        ["Not placed %", sum.notPlacedRate.toFixed(1), scopeLabel()],
        ["Avg starting salary", Math.round(sum.avgStartingSalary), scopeLabel()],
        ["12-month retention %", sum.retention12m.toFixed(1), scopeLabel()],
        ["Training relevance %", sum.relevance.toFixed(1), scopeLabel()],
        ["Follow-up response %", sum.responseRate.toFixed(1), scopeLabel()],
        ["Certification rate %", sum.certification.toFixed(1), scopeLabel()]
      ]);
  });
  function scopeLabel() {
    return ["course", "district", "batch", "provider", "gender"]
      .filter((k) => state[k] !== "all").map((k) => k + "=" + state[k]).join("; ") || "all";
  }

  /* ---------- master render ---------- */
  function render() {
    rows = scopeRows();
    sum = DB.summarise(rows);
    renderKPIs();
    renderMix();
    renderDonut();
    renderWage();
    renderProviders();
    renderFollow();
    renderDistricts();
    renderDemographics();
    renderGaps();
    renderReasons();
    renderRegistry();
  }

  render();
  if (location.hash) {
    setTimeout(() => {
      const el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }
})();
