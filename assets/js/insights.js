/* ==========================================================================
   insights.js — findings and the actions they imply

   Each rule reads the filtered cohort and returns a finding only when the
   evidence is actually there. Nothing is hardcoded: change the filter and a
   finding can disappear, because it was never true of that subset.

   Every finding carries the numbers it rests on. An insight you cannot audit is
   an opinion, and the point of this system is to stop the programme running on
   those.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, num, inr, pct, toast } = UI;

  UI.renderShell({
    title: "Insights & Actions",
    crumb: "Evidence → decision",
    user: { name: DB.ADMIN_USER.name, role: DB.ADMIN_USER.role }
  });

  const PRIORITY = {
    critical: { label: "Critical", chip: "chip--critical", accent: "var(--critical)", rank: 0 },
    serious:  { label: "Serious",  chip: "chip--serious",  accent: "var(--serious)",  rank: 1 },
    advisory: { label: "Advisory", chip: "chip--info",     accent: "var(--series-1)", rank: 2 }
  };

  const LEVERS = [
    { name: "Curriculum",        icon: "◫", note: "Add, drop or re-sequence modules on evidence of what employers ask for." },
    { name: "Training delivery", icon: "⌂", note: "Attendance, assessment rigour and provider accreditation." },
    { name: "Placement support", icon: "▤", note: "Employer linkage, interview coaching, job-matching by district." },
    { name: "Remedial training", icon: "↻", note: "Short modules for people the main course did not get to work." },
    { name: "Resource allocation", icon: "◧", note: "Move seats and money towards what converts into livelihoods." },
    { name: "Programme design",  icon: "⚙", note: "Cohort size, course mix and where new centres should open." }
  ];

  /* ======================================================================
     Finding rules — each returns a finding object or null
     ====================================================================== */
  const RULES = [

    /* --- skill gaps: what employers ask for that is not taught --- */
    function skillGap() {
      const worst = DB.skillGapRows()[0];
      if (!worst || !worst.gap.length) return null;
      const rows = DB.filterTrainees(Object.assign({}, state.filters, { course: worst.course }));
      const s = DB.summarise(rows);
      return {
        id: "skill-gap",
        priority: worst.coverage < 55 ? "critical" : "serious",
        area: "Curriculum",
        insight: `${worst.gap.join(", ")} ${worst.gap.length === 1 ? "is" : "are"} frequently requested by `
          + `employers but ${worst.gap.length === 1 ? "is" : "are"} not covered in ${worst.course}.`,
        action: `Add ${worst.gap.slice(0, 2).join(" and ")} module${worst.gap.length > 1 ? "s" : ""} to the `
          + `${worst.course} curriculum. Employer demand for this course scores ${worst.demandIndex}/100.`,
        evidence: [
          ["Curriculum coverage", pct(worst.coverage, 0)],
          ["Taught", worst.taught.length + " of " + worst.industry.length + " skills"],
          ["Trainees affected", num(rows.length)],
          ["Placement rate", pct(s.placementRate, 1)]
        ],
        chart: {
          items: [
            { label: "Covered", value: worst.industry.length - worst.gap.length, color: "var(--good)" },
            { label: "Missing", value: worst.gap.length, color: "var(--critical)" }
          ],
          valueName: "Skills"
        }
      };
    },

    /* --- early attrition: retention against the programme average --- */
    function retention() {
      const rows = DB.filterTrainees(state.filters);
      const overall = DB.summarise(rows);
      const byCourse = DB.breakdown(rows, "course").filter((c) => c.total >= 150);
      if (!byCourse.length) return null;
      const worst = byCourse.slice().sort((a, b) => a.retention12m - b.retention12m)[0];
      if (worst.retention12m >= overall.retention12m - 5) return null;

      const lost = Math.round(worst.total * (worst.placementRate / 100) * (1 - worst.retention12m / 100));
      return {
        id: "retention",
        priority: worst.retention12m < 65 ? "critical" : "serious",
        area: "Placement support",
        insight: `Job retention in ${worst.key} is ${pct(worst.retention12m, 1)} at twelve months, `
          + `against ${pct(overall.retention12m, 1)} across the programme — roughly ${num(lost)} people `
          + `placed and then lost.`,
        action: "Introduce early-career mentoring and post-placement support for the first three "
          + "months, and ask employers exiting trainees why they left.",
        evidence: [
          ["12-month retention", pct(worst.retention12m, 1)],
          ["Programme average", pct(overall.retention12m, 1)],
          ["Placed then lost", num(lost)],
          ["Avg. starting salary", inr(worst.avgStartingSalary)]
        ],
        chart: {
          items: byCourse.slice().sort((a, b) => a.retention12m - b.retention12m).slice(0, 5)
            .map((c) => ({
              label: c.key, value: c.retention12m,
              color: c.key === worst.key ? "var(--critical)" : "var(--series-1)"
            })),
          valueName: "Retention", format: (v) => pct(v, 1)
        }
      };
    },

    /* --- non-placement reasons --- */
    function nonPlacement() {
      const rows = DB.filterTrainees(state.filters);
      const reasons = DB.reasonBreakdown(rows).filter((r) => r.value > 0);
      if (!reasons.length) return null;
      const top = reasons[0];
      const totalUnplaced = reasons.reduce((s, r) => s + r.value, 0);
      const share = (top.value / totalUnplaced) * 100;

      const ACTIONS = {
        SKILL: "Fund short remedial modules in the skills employers name most often, and make them "
             + "available to anyone certified in the last 12 months.",
        EXP:  "Expand the apprenticeship and internship pipeline — experience is the one gap "
            + "classroom training cannot close on its own.",
        INTV: "Add interview and communication coaching to the final fortnight of every course.",
        NOJOB: "Prioritise employer linkage in the districts with the fewest local openings, and "
             + "offer travel or relocation support where the work genuinely is elsewhere.",
        SALARY: "Set wage expectations explicitly during counselling, using this programme's own "
              + "median starting salary by course.",
        PERSONAL: "Offer flexible re-entry so trainees who step away can resume without re-enrolling.",
        RELEV: "Review course-to-job mapping — trainees are being placed into courses that do not "
             + "lead to the work available near them."
      };

      return {
        id: "non-placement",
        priority: share > 30 ? "serious" : "advisory",
        area: "Remedial training",
        insight: `${top.label.toLowerCase()} is the single largest reason trainees are not placed, `
          + `accounting for ${pct(share, 0)} of ${num(totalUnplaced)} unplaced trainees in this scope.`,
        action: ACTIONS[top.code] || "Investigate with district co-ordinators before committing funds.",
        evidence: reasons.slice(0, 4).map((r) => [r.label, num(r.value) + ` (${pct((r.value / totalUnplaced) * 100, 0)})`]),
        chart: {
          items: reasons.slice(0, 6).map((r, i) => ({
            label: r.label, value: r.value,
            color: i === 0 ? "var(--series-2)" : "var(--series-1)"
          })),
          valueName: "Trainees"
        }
      };
    },

    /* --- provider spread --- */
    function providers() {
      const rows = DB.filterTrainees(state.filters);
      const list = DB.breakdown(rows, "provider").filter((p) => p.total >= 200);
      if (list.length < 2) return null;
      const sorted = list.slice().sort((a, b) => b.placementRate - a.placementRate);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      const spread = best.placementRate - worst.placementRate;
      if (spread < 6) return null;

      const meta = DB.PROVIDERS.find((p) => p.name === worst.key) || {};
      return {
        id: "provider-spread",
        priority: spread > 12 ? "serious" : "advisory",
        area: "Training delivery",
        insight: `Placement rates differ by ${spread.toFixed(1)} percentage points between providers `
          + `delivering comparable courses — ${best.key} at ${pct(best.placementRate, 1)} against `
          + `${worst.key} at ${pct(worst.placementRate, 1)}.`,
        action: `Review ${worst.key}${meta.accredited === false ? " (currently unaccredited)" : ""} at the `
          + `next accreditation cycle, and document what ${best.key} does differently rather than `
          + "assuming the difference is intake.",
        evidence: [
          ["Highest placement", `${best.key} — ${pct(best.placementRate, 1)}`],
          ["Lowest placement", `${worst.key} — ${pct(worst.placementRate, 1)}`],
          ["Spread", spread.toFixed(1) + " pp"],
          ["Trainees at lowest", num(worst.total)]
        ],
        chart: {
          items: sorted.map((p) => ({
            label: p.key, value: p.placementRate,
            color: p.key === worst.key ? "var(--critical)" : p.key === best.key ? "var(--good)" : "var(--series-1)"
          })),
          valueName: "Placed", format: (v) => pct(v, 1)
        }
      };
    },

    /* --- equity: the gender gap --- */
    function equity() {
      const rows = DB.filterTrainees(state.filters);
      const byGender = DB.breakdown(rows, "gender").filter((g) => g.total >= 100);
      const f = byGender.find((g) => g.key === "F");
      const m = byGender.find((g) => g.key === "M");
      if (!f || !m) return null;
      const gap = m.placementRate - f.placementRate;
      if (gap < 2) return null;

      const wageGap = m.avgStartingSalary - f.avgStartingSalary;
      return {
        id: "equity",
        priority: gap > 5 ? "serious" : "advisory",
        area: "Programme design",
        insight: `Women are placed at ${pct(f.placementRate, 1)} against ${pct(m.placementRate, 1)} for men — `
          + `a gap of ${gap.toFixed(1)} percentage points`
          + (wageGap > 200 ? `, and start on ${inr(wageGap)} less per month` : "") + ".",
        action: "Ask employers in the worst-affected sectors what blocks hiring, and check whether "
          + "course timing, centre location or travel safety is filtering women out before placement.",
        evidence: [
          ["Women placed", pct(f.placementRate, 1) + ` (${num(f.total)})`],
          ["Men placed", pct(m.placementRate, 1) + ` (${num(m.total)})`],
          ["Gap", gap.toFixed(1) + " pp"],
          ["Starting salary gap", wageGap > 0 ? inr(wageGap) : "none"]
        ],
        chart: {
          items: [
            { label: "Women", value: f.placementRate, color: "var(--series-5)" },
            { label: "Men", value: m.placementRate, color: "var(--series-1)" }
          ],
          valueName: "Placed", format: (v) => pct(v, 1)
        }
      };
    },

    /* --- follow-up decay: the data-quality risk --- */
    function followUp() {
      const rows = DB.filterTrainees(state.filters);
      const waves = DB.followUpWaves(rows).filter((w) => w.due > 0);
      if (waves.length < 2) return null;
      const last = waves[waves.length - 1];
      const first = waves[0];
      const lastRate = ((last.responded + last.assisted) / last.due) * 100;
      const firstRate = ((first.responded + first.assisted) / first.due) * 100;
      if (lastRate > 60) return null;

      return {
        id: "follow-up",
        priority: lastRate < 50 ? "critical" : "serious",
        area: "Programme design",
        insight: `Follow-up response falls from ${pct(firstRate, 0)} at ${first.wave} to `
          + `${pct(lastRate, 0)} at ${last.wave}. Long-term outcome figures rest on a shrinking `
          + `and probably non-random sample.`,
        action: "Collect a second contact number at registration, and run assisted calls for the "
          + "24-month wave rather than reporting it alongside the earlier waves as if equally reliable.",
        evidence: waves.map((w) => [
          w.wave + " response",
          pct(((w.responded + w.assisted) / w.due) * 100, 0) + ` (${num(w.due)} due)`
        ]),
        chart: {
          items: waves.map((w) => ({
            label: w.wave,
            value: ((w.responded + w.assisted) / w.due) * 100,
            color: "var(--series-4)"
          })),
          valueName: "Response", format: (v) => pct(v, 0)
        }
      };
    },

    /* --- cost efficiency --- */
    function roi() {
      const rows = DB.filterTrainees(state.filters);
      const byCourse = DB.breakdown(rows, "course").filter((c) => c.total >= 150);
      if (!byCourse.length) return null;

      const withCost = byCourse.map((c) => {
        const course = DB.COURSES.find((x) => x.name === c.key);
        if (!course) return null;
        const placed = c.total - c.counts.notplaced;
        // The unplaced cost money too — a cost-per-placement that ignores them
        // flatters exactly the courses that need scrutiny.
        return placed ? { key: c.key, cost: (course.fee * c.total) / placed, placed, rate: c.placementRate } : null;
      }).filter(Boolean).sort((a, b) => b.cost - a.cost);

      if (withCost.length < 2) return null;
      const worst = withCost[0], best = withCost[withCost.length - 1];
      if (worst.cost < best.cost * 1.8) return null;

      return {
        id: "roi",
        priority: "advisory",
        area: "Resource allocation",
        insight: `${worst.key} costs ${inr(worst.cost)} for every successful placement, against `
          + `${inr(best.cost)} for ${best.key} — ${(worst.cost / best.cost).toFixed(1)}× the cost per outcome.`,
        action: `Review the seat allocation for ${worst.key} at the next planning cycle. Either the `
          + "placement rate rises or the intake should shift towards courses that convert.",
        evidence: [
          [`${worst.key} cost/placement`, inr(worst.cost)],
          [`${best.key} cost/placement`, inr(best.cost)],
          [`${worst.key} placement rate`, pct(worst.rate, 1)],
          ["Placements compared", num(worst.placed) + " vs " + num(best.placed)]
        ],
        chart: {
          items: withCost.slice(0, 6).map((c, i) => ({
            label: c.key, value: Math.round(c.cost),
            color: i === 0 ? "var(--series-2)" : "var(--series-1)"
          })),
          valueName: "Cost per placement", format: inr
        }
      };
    }
  ];

  /* ======================================================================
     State and rendering
     ====================================================================== */
  const state = { filters: { district: "all", batch: "all" }, priority: "all", findings: [] };

  const fill = (sel, items) =>
    $(sel).insertAdjacentHTML("beforeend", items.map((v) => `<option>${esc(v)}</option>`).join(""));
  fill("#fDistrict", DB.DISTRICTS.map((d) => d.name));
  fill("#fBatch", DB.BATCHES.map((b) => b.id));

  function compute() {
    state.findings = RULES.map((rule) => {
      try { return rule(); } catch (err) { return null; }   // one bad rule must not blank the page
    }).filter(Boolean)
      .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank);
  }

  function visible() {
    if (state.priority === "all") return state.findings;
    const max = state.priority === "critical" ? 0 : 1;
    return state.findings.filter((f) => PRIORITY[f.priority].rank <= max);
  }

  function renderStats() {
    const rows = DB.filterTrainees(state.filters);
    const s = DB.summarise(rows);
    const critical = state.findings.filter((f) => f.priority === "critical").length;

    const tiles = [
      { label: "Findings", value: state.findings.length, meta: "from the current scope", accent: "var(--series-7)" },
      { label: "Critical", value: critical, meta: critical ? "act this cycle" : "none outstanding", accent: critical ? "var(--critical)" : "var(--good)" },
      { label: "Trainees in scope", value: num(rows.length), meta: "records behind these findings", accent: "var(--series-1)" },
      { label: "Placement rate", value: pct(s.placementRate, 1), meta: "the number these actions move", accent: "var(--series-3)" }
    ];

    $("#insightStats").innerHTML = tiles.map((t) => `
      <div class="stat" style="--accent:${t.accent}">
        <div class="stat__label">${esc(t.label)}</div>
        <div class="stat__value tnum">${t.value}</div>
        <div class="stat__meta">${esc(t.meta)}</div>
      </div>`).join("");
  }

  function render() {
    renderStats();
    const rows = visible();
    $("#insightCount").textContent =
      `${rows.length} finding${rows.length === 1 ? "" : "s"} shown`;

    if (!rows.length) {
      $("#insightList").innerHTML = `
        <div class="card"><div class="empty">
          <div class="empty__ico">✓</div>
          <div class="empty__title">Nothing flagged at this priority</div>
          <div class="empty__body">
            No finding in the current scope meets that threshold. Widen the priority filter,
            or broaden the district and cohort selection.
          </div>
        </div></div>`;
      return;
    }

    $("#insightList").innerHTML = rows.map((f) => {
      const p = PRIORITY[f.priority];
      return `
        <div class="card">
          <div class="card__head">
            <div>
              <h3>${esc(f.area)}</h3>
              <div class="card__sub">Finding · ${esc(f.id)}</div>
            </div>
            <span class="chip ${p.chip}"><i class="dot"></i>${p.label}</span>
          </div>
          <div class="card__body">
            <div class="grid grid--2-1">
              <div>
                <div class="insight" style="--accent:${p.accent}">
                  <div class="insight__tag">INSIGHT</div>
                  <div class="insight__text">${esc(f.insight)}</div>
                  <div class="insight__action">
                    <div class="insight__tag">ACTION</div>
                    <div>${esc(f.action)}</div>
                  </div>
                </div>
                <dl class="kv mt-12">
                  ${f.evidence.map(([k, v]) =>
                    `<dt>${esc(k)}</dt><dd class="tnum">${esc(v)}</dd>`).join("")}
                </dl>
              </div>
              <div>
                <div class="js-chart" data-chart="${esc(f.id)}"></div>
              </div>
            </div>
          </div>
          <div class="card__foot">
            <span class="small muted">Computed from ${num(DB.filterTrainees(state.filters).length)} records in scope</span>
            <span class="topbar__spacer"></span>
            <button class="btn btn--sm" data-demo="Action assigned — it will appear in the programme improvement plan.">Assign owner</button>
            <button class="btn btn--sm" data-demo="Finding dismissed. It will reappear if the evidence strengthens.">Dismiss</button>
          </div>
        </div>`;
    }).join("");

    // Charts are drawn after the markup lands so each node has a measurable width.
    rows.forEach((f) => {
      const node = $(`[data-chart="${f.id}"]`);
      if (node && f.chart) {
        Viz.barH(node, {
          items: f.chart.items,
          format: f.chart.format,
          valueName: f.chart.valueName,
          labelWidth: 130,
          rowHeight: 30
        });
      }
    });
  }

  /* ---------- levers ---------- */
  $("#leverGrid").innerHTML = LEVERS.map((l) => `
    <div class="stack" style="gap:4px">
      <div class="row row--tight" style="gap:8px">
        <span style="font-size:15px">${l.icon}</span>
        <strong style="font-size:13.5px">${esc(l.name)}</strong>
      </div>
      <div class="small muted" style="line-height:1.5">${esc(l.note)}</div>
    </div>`).join("");

  /* ---------- interactions ---------- */
  function refresh() {
    state.filters.district = $("#fDistrict").value;
    state.filters.batch = $("#fBatch").value;
    state.priority = $("#fPriority").value;
    compute();
    render();
  }

  $("#fDistrict").addEventListener("change", refresh);
  $("#fBatch").addEventListener("change", refresh);
  $("#fPriority").addEventListener("change", refresh);

  $("#exportInsights").addEventListener("click", () => {
    const rows = visible();
    if (!rows.length) { toast("Nothing to export", "warn"); return; }
    UI.exportCSV("insights-and-actions.csv",
      ["Priority", "Area", "Insight", "Action", "Evidence"],
      rows.map((f) => [
        PRIORITY[f.priority].label, f.area, f.insight, f.action,
        f.evidence.map(([k, v]) => `${k}: ${v}`).join("; ")
      ]));
  });

  $("#printInsights").addEventListener("click", () => {
    toast("Opening print dialogue — choose “Save as PDF”");
    setTimeout(() => window.print(), 260);
  });

  UI.initDemoActions();
  refresh();
})();
