/* ==========================================================================
   dashboard.js — outcome analytics page
   ========================================================================== */
(function () {
  "use strict";
  const { $, $$, num, inr, inrK, pct, compact, esc, avatar, outcomeChip, toast } = UI;

  UI.renderShell({
    title: "Outcome dashboard",
    crumb: "Analytics · Madhya Pradesh · live data",
    user: DB.ADMIN_USER
  });
  UI.initDemoActions();

  /* Replace a chart node with an empty state. A fresh clone drops the old chart's resize redraw. */
  function emptyChart(id, msg) {
    const old = $(id), fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    fresh.innerHTML = `<div class="empty"><div class="empty__title">${esc(msg)}</div></div>`;
  }
  const NO_DATA = "No trainee data in this scope yet";

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
  let rows = [], sum = {}, baseline = {};

  // Rates use only trainees who reported an outcome; unreported ones are not "not placed".
  function kpis(list) {
    const rep = list.filter((t) => t.outcomeReported);
    const s = DB.summarise(rep);
    const rel = rep.filter((t) => t.relevance > 0);
    const ret = rep.filter((t) => t.retained12m != null);
    const has = rep.length > 0;
    return Object.assign(s, {
      total: list.length, reported: rep.length,
      consentRate: list.length ? (list.filter((t) => t.consent).length / list.length) * 100 : null,
      employmentRate: has ? s.employmentRate : null, selfRate: has ? s.selfRate : null,
      apprenticeRate: has ? s.apprenticeRate : null, notPlacedRate: has ? s.notPlacedRate : null,
      placementRate: has ? s.placementRate : null,
      avgStartingSalary: s.avgStartingSalary || null,
      verifiedPlacements: rep.filter((t) => t.verified).length,
      retention12m: ret.length ? (ret.filter((t) => t.retained12m).length / ret.length) * 100 : null,
      relevance: rel.length ? (rel.reduce((a, t) => a + t.relevance, 0) / rel.length / 5) * 100 : null
    });
  }
  const show = (v, f) => (v == null ? "—" : f(v));

  function scopeRows() { return DB.filterTrainees({
    course: state.course, district: state.district, batch: state.batch,
    provider: state.provider, gender: state.gender }); }

  /* ---------- KPI tiles ---------- */
  function renderKPIs() {
    const filtered = state.course !== "all" || state.district !== "all" ||
                     state.batch !== "all" || state.provider !== "all" || state.gender !== "all";
    const tiles = [
      { label: "Total trainees",    value: num(sum.total), base: null, accent: "var(--series-7)",
        meta: `${num(sum.reported)} have reported an outcome` },
      { label: "Employment rate",   value: show(sum.employmentRate, (v) => pct(v, 0)), base: baseline.employmentRate, cur: sum.employmentRate,
        accent: "var(--series-1)", meta: `${num(sum.counts.employed)} in wage employment` },
      { label: "Self-employed",     value: show(sum.selfRate, (v) => pct(v, 0)), base: baseline.selfRate, cur: sum.selfRate,
        accent: "var(--series-3)", meta: `${num(sum.counts.self)} running own work` },
      { label: "Apprenticeship",    value: show(sum.apprenticeRate, (v) => pct(v, 0)), base: baseline.apprenticeRate, cur: sum.apprenticeRate,
        accent: "var(--series-4)", meta: `${num(sum.counts.apprentice)} in apprenticeships` },
      { label: "Not placed",        value: show(sum.notPlacedRate, (v) => pct(v, 0)), base: baseline.notPlacedRate, cur: sum.notPlacedRate, invert: true,
        accent: "var(--series-8)", meta: `${num(sum.counts.notplaced)} reported not working` },
      { label: "Avg. monthly income", value: show(sum.avgStartingSalary, inr), base: baseline.avgStartingSalary, cur: sum.avgStartingSalary, money: true,
        accent: "var(--series-1)", meta: `${num(sum.verifiedPlacements)} placements verified by employers` },
      { label: "12-month retention", value: show(sum.retention12m, (v) => pct(v, 0)), base: baseline.retention12m, cur: sum.retention12m,
        accent: "var(--series-3)", meta: sum.retention12m == null ? "not collected yet" : "of those placed 12+ months ago" },
      { label: "Training relevance", value: show(sum.relevance, (v) => pct(v, 0)), base: baseline.relevance, cur: sum.relevance,
        accent: "var(--series-7)", meta: "self-rated fit of training to work" }
    ];

    $("#kpiGrid").innerHTML = tiles.map((t) => {
      let delta = "";
      if (filtered && t.base != null && t.cur != null) {
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
      : ` All ${num(sum.total)} registered trainees across ${num(new Set(rows.map((t) => t.batch)).size)} batches, ` +
        `${num(new Set(rows.map((t) => t.course)).size)} courses and ${num(new Set(rows.map((t) => t.district)).size)} districts. ` +
        `Rates are over the ${num(sum.reported)} who reported an outcome.`;
  }

  /* ---------- outcome mix by batch (stacked) ---------- */
  function renderMix() {
    if (!rows.length) { emptyChart("#chartMix", NO_DATA); $("#legendMix").innerHTML = ""; return; }
    const byBatch = DB.BATCHES.map((b) => {
      const g = rows.filter((t) => t.batch === b.id && t.outcomeReported);
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
    if (!sum.reported) { emptyChart("#chartDonut", "No outcomes reported in this scope yet"); $("#legendDonut").innerHTML = ""; return; }
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
      label: i.label, color: i.color, value: pct((i.value / sum.reported) * 100, 1)
    })));
  }

  /* ---------- wage progression ---------- */
  function renderWage() {
    // Only one salary per trainee is stored (no history), so a progression curve would be invented.
    emptyChart("#chartWage", "Wage progression needs repeated salary reports — only the latest income is collected so far");
    $("#legendWage").innerHTML = "";
  }

  /* ---------- provider comparison ---------- */
  function renderProviders() {
    if (!DB.PROVIDERS.length) { emptyChart("#chartProvider", "Training provider is not recorded at registration yet"); return; }
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
    if (!rows.length) { emptyChart("#chartFollow", NO_DATA); $("#legendFollow").innerHTML = ""; return; }
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
    const byDist = DB.breakdown(rows.filter((t) => t.outcomeReported), "district").slice(0, 8);
    if (!byDist.length) { emptyChart("#chartDistrict", "No outcomes reported in this scope yet"); return; }
    Viz.heatstrip($("#chartDistrict"), {
      colLabels: ["Employed", "Self-emp.", "Placed"],
      labelWidth: 96,
      rows: byDist.map((d) => ({
        label: d.key,
        cells: [
          { label: "Employment rate", value: d.employmentRate },
          { label: "Self-employment", value: d.selfRate },
          { label: "Placement rate", value: d.placementRate }
        ]
      })),
      cellText: (c) => Math.round(c.value) + "%",
      format: (v) => pct(v, 1)
    });
  }

  /* ---------- demographics ---------- */
  function renderDemographics() {
    const rep = rows.filter((t) => t.outcomeReported);
    if (!rep.length) { emptyChart("#chartDemo", "No outcomes reported in this scope yet"); $("#demoNotes").innerHTML = ""; return; }
    const bands = [[18, 21], [22, 25], [26, 29], [30, 34]];
    const items = bands.map((b) => {
      const g = rep.filter((t) => t.age >= b[0] && t.age <= b[1]);
      const s = DB.summarise(g);
      return { label: b[0] + "–" + b[1], value: Math.round(s.placementRate), note: num(g.length), noteLabel: "Trainees", color: "var(--series-1)" };
    });
    Viz.barV($("#chartDemo"), {
      items, height: 190, valueLabels: true, rotate: false,
      valueName: "Placement rate", format: (v) => v + "%", tickFormat: (v) => Math.round(v) + "%"
    });

    const women = DB.summarise(rep.filter((t) => t.gender === "F"));
    const men   = DB.summarise(rep.filter((t) => t.gender === "M"));
    $("#demoNotes").innerHTML = [
      { l: "Women — placement", v: women.placementRate, n: women.total, c: "var(--series-5)" },
      { l: "Men — placement",   v: men.placementRate,   n: men.total,   c: "var(--series-3)" }
    ].map((r) => `
      <div class="meter-row" style="--accent:${r.c}">
        <span class="meter-row__label">${r.l} <span class="muted">(${num(r.n)})</span></span>
        <span class="meter-row__val">${r.n ? pct(r.v, 1) : "—"}</span>
        <span class="meter"><span style="width:${r.n ? Math.min(100, r.v) : 0}%"></span></span>
      </div>`).join("");
  }

  /* ---------- skill gaps ---------- */
  function renderGaps() {
    const gaps = DB.skillGapRows();
    $("#gapTable tbody").innerHTML = !gaps.length
      ? `<tr><td colspan="6" class="tbl-empty">No open jobs from verified companies match a published course yet.</td></tr>`
      : gaps.map((g) => `
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
      ["Course", "Industry requires", "Taught", "Gap", "Coverage %", "Related open jobs"],
      gaps.map((g) => [g.course, g.industry.join(" | "), g.taught.join(" | "), g.gap.join(" | "), g.coverage.toFixed(0), g.demandIndex]));
  }

  /* ---------- non-placement reasons + actions ---------- */
  const ACTIONS = {
    NOREPORT: ["Chase outcome reports", "These trainees have not reported their status yet. Remind them to update it on their profile — unreported outcomes leave the rates incomplete."],
    SKILL:    ["Add the missing modules to the curriculum", "Push the top gap skills in this scope to the provider as a bridge module before the next batch."],
    EXP:      ["Expand apprenticeship and OJT slots", "Convert employer partners into 3-month on-the-job training hosts so first-job experience is built in."],
    INTV:     ["Mandatory interview-readiness sprint", "Two-week soft-skills and mock-interview block scheduled in the final month of the course."],
    NOJOB:    ["Open a mobility and remote-work track", "Fund relocation stipends to demand districts and prioritise remote-capable courses where local demand is thin."],
    SALARY:   ["Wage-expectation counselling at enrolment", "Publish real placement wage bands per course so expectations are set before the course begins, not after."],
    PERSONAL: ["Flexible re-entry and part-time batches", "Allow deferred completion and evening batches for trainees with care or relocation constraints."],
    RELEV:    ["Re-map the course to live demand", "Course is under-aligned with employer postings — trigger a curriculum review and consider retiring low-demand seats."]
  };
  function renderReasons() {
    const data = DB.reasonBreakdown(rows).filter((d) => d.value > 0);
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) {
      emptyChart("#chartReasons", "No trainees in this scope are without work");
      $("#actionList").innerHTML = `<div class="empty"><div class="empty__title">Nothing to act on yet</div></div>`;
      return;
    }
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
      `${num(list.length)} records in scope · showing ${p.slice.length}`;

    $("#registryTable tbody").innerHTML = p.slice.length ? p.slice.map((t) => {
      const f = latestWave(t);
      return `<tr data-id="${t.id}">
        <td><div class="person">${avatar(t.name)}<div>
            <div class="person__name">${esc(t.name)}</div>
            <div class="person__meta">${t.age} · ${t.gender === "F" ? "Female" : t.gender === "M" ? "Male" : "Other"}</div>
          </div></div></td>
        <td class="tbl__id">${t.id}</td>
        <td>${esc(t.course)}</td>
        <td>${esc(t.provider)}</td>
        <td>${esc(t.district)}</td>
        <td class="tnum">${t.batch}</td>
        <td class="num">${t.attendance == null ? '<span class="muted">—</span>' : t.attendance + "%"}</td>
        <td class="num">${t.score == null ? '<span class="muted">—</span>' : t.score}</td>
        <td>${t.outcomeReported ? outcomeChip(t.outcome) : '<span class="chip"><i class="dot"></i>Not reported</span>'}</td>
        <td class="num">${t.currentSalary ? inr(t.currentSalary) : '<span class="muted">—</span>'}</td>
        <td>${FOLLOW_CHIP[f.status]} <span class="muted small">${f.wave}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="11" class="tbl-empty">No trainees match these filters.</td></tr>`;

    $("#registryPager").innerHTML = UI.pagerHTML(p, "reg");
    const prev = $("#regPrev"), next = $("#regNext");
    if (prev) prev.onclick = () => { state.page--; renderRegistry(); };
    if (next) next.onclick = () => { state.page++; renderRegistry(); };

    $("#exportRegistry").onclick = () => UI.exportCSV("trainee-registry.csv",
      ["Unique ID", "Name", "Gender", "Age", "Course", "Provider", "District", "Batch",
       "Attendance %", "Score", "Outcome", "Starting salary", "Current salary", "Employer", "Retained 12m"],
      list.slice(0, 2000).map((t) => [t.id, t.name, t.gender, t.age, t.course, t.provider, t.district,
        t.batch, t.attendance, t.score, t.outcomeReported ? UI.OUTCOME_META[t.outcome].label : "Not reported", t.startingSalary,
        t.currentSalary, t.employer || "", t.retained12m == null ? "n/a" : t.retained12m ? "Yes" : "No"]));
  }

  /* ---------- KPI export ---------- */
  $("#exportKpi").addEventListener("click", () => {
    const v = (x) => (x == null ? "" : Number(x).toFixed(1));
    UI.exportCSV("outcome-summary.csv",
      ["Metric", "Value", "Scope"],
      [
        ["Total trainees", sum.total, scopeLabel()],
        ["Reported an outcome", sum.reported, scopeLabel()],
        ["Employment rate %", v(sum.employmentRate), scopeLabel()],
        ["Self-employed %", v(sum.selfRate), scopeLabel()],
        ["Apprenticeship %", v(sum.apprenticeRate), scopeLabel()],
        ["Not placed %", v(sum.notPlacedRate), scopeLabel()],
        ["Avg monthly income", sum.avgStartingSalary == null ? "" : Math.round(sum.avgStartingSalary), scopeLabel()],
        ["Employer-verified placements", sum.verifiedPlacements, scopeLabel()],
        ["Training relevance %", v(sum.relevance), scopeLabel()]
      ]);
  });
  function scopeLabel() {
    return ["course", "district", "batch", "provider", "gender"]
      .filter((k) => state[k] !== "all").map((k) => k + "=" + state[k]).join("; ") || "all";
  }

  /* ---------- master render ---------- */
  function render() {
    rows = scopeRows();
    sum = kpis(rows);
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

  baseline = kpis(DB.trainees);
  render();
  if (location.hash) {
    setTimeout(() => {
      const el = document.querySelector(location.hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }
})();
