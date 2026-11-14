/* ==========================================================================
   data.js — mock data layer for SkillTrack
   --------------------------------------------------------------------------
   Everything the UI renders comes from here. A deterministic seeded generator
   builds a 10,000-trainee cohort in the browser so every filter, KPI and chart
   is computed from real records rather than hardcoded numbers.

   To go live: replace `DB.trainees` (and the lookup lists) with a fetch() to
   your API. Every consumer already goes through the helpers at the bottom.
   ========================================================================== */
/* ==========================================================================
   data.js — SkillTrack data layer
   --------------------------------------------------------------------------
   Loads the real records from the database (GET /api/db) before any page
   script runs, then exposes them through the same helpers every page uses.
   Nothing here is generated. What you can see depends on who is signed in:
   admin → everyone; employer → their applicants and claimed hires;
   trainee → only themselves. Pages other than the landing, login and
   registration pages send you to sign in first.
   ========================================================================== */
(function (global) {
  "use strict";

  const PUBLIC = /(^|\/)(index|login|register|company)\.html$|\/$/.test(location.pathname);
  let data = null;
  try {
    // Synchronous on purpose: every page script reads DB at load, so it must be filled first.
    const x = new XMLHttpRequest();
    x.open("GET", "/api/db", false);
    x.send();
    if (x.status === 200) data = JSON.parse(x.responseText);
  } catch (e) { /* server unreachable — falls through to sign-in */ }
  if (!data && !PUBLIC) { location.replace("login.html"); throw new Error("Not signed in"); }
  // each workspace belongs to one role; anyone else is sent to their own home page
  const PAGE_ROLE = { dashboard: "admin", insights: "admin", reports: "admin", admin: "admin",
                      employer: "employer", trainee: "trainee", outcome: "trainee" };
  const HOME = { admin: "dashboard.html", employer: "employer.html", trainee: "trainee.html" };
  const page = (location.pathname.match(/([a-z]+)\.html$/) || [])[1];
  if (data && PAGE_ROLE[page] && PAGE_ROLE[page] !== data.user.role) { location.replace(HOME[data.user.role]); throw new Error("Wrong role"); }
  if (!data) {
    // signed out (landing / login / register): only the public lists
    try {
      const x = new XMLHttpRequest();
      x.open("GET", "/api/meta", false);
      x.send();
      const m = x.status === 200 ? JSON.parse(x.responseText) : null;
      if (m) data = { PUBLIC_STATS: m.stats, DISTRICTS: m.districts.map((name) => ({ name })),
        COURSES: m.courses.map((c) => ({ code: c.qp_code, name: c.name, sector: c.sector, skills: c.skills, id: c.id })),
        SKILL_GAPS: m.courses.map((c) => ({ course: c.name, industry: [], taught: c.skills, demandIndex: 0 })) };
    } catch (e) { /* offline */ }
  }
  data = Object.assign({ user: null, trainees: [], DISTRICTS: [], COURSES: [], PROVIDERS: [], BATCHES: [], EMPLOYERS: [],
    SKILL_GAPS: [], CAMPAIGNS: [], VALIDATION_QUEUE: [], VERIFY_REQUESTS: [], JOB_POSTINGS: [], AUDIT_LOG: [],
    ADMIN_USER: null, EMPLOYER_USER: null, TRAINEE_USER: null, PUBLIC_STATS: null }, data || {});

  const { trainees, DISTRICTS, COURSES, PROVIDERS, BATCHES, EMPLOYERS, SKILL_GAPS, CAMPAIGNS, VALIDATION_QUEUE,
          VERIFY_REQUESTS, JOB_POSTINGS, AUDIT_LOG, ADMIN_USER, EMPLOYER_USER, TRAINEE_USER } = data;
  const USER = data.user;
  const PUBLIC_STATS = data.PUBLIC_STATS;

  // The categories trainees choose from when they report they are not working.
  const NON_PLACEMENT_REASONS = [
    { code: "NOREPORT", label: "Outcome not reported yet" },
    { code: "SKILL",    label: "Lack of required skills" },
    { code: "EXP",      label: "Lack of experience" },
    { code: "INTV",     label: "Poor interview performance" },
    { code: "NOJOB",    label: "No suitable jobs nearby" },
    { code: "SALARY",   label: "Salary expectations" },
    { code: "PERSONAL", label: "Personal / relocation issues" },
    { code: "RELEV",    label: "Course not relevant" },
    { code: "OTHER",    label: "Other" }
  ];

  const OUTCOMES = {
    employed:   { label: "Employed (wage)",  color: "var(--series-1)" },
    self:       { label: "Self-employed",    color: "var(--series-3)" },
    apprentice: { label: "Apprenticeship",   color: "var(--series-4)" },
    notplaced:  { label: "Not placed",       color: "var(--series-8)" }
  };

  /* ==========================================================================
     Query helpers — every page filters through these
     ========================================================================== */
  const FILTER_KEYS = ["course", "district", "batch", "provider", "outcome", "gender"];

  function filterTrainees(f) {
    f = f || {};
    return trainees.filter((t) =>
      (!f.course   || f.course   === "all" || t.course   === f.course) &&
      (!f.district || f.district === "all" || t.district === f.district) &&
      (!f.batch    || f.batch    === "all" || t.batch    === f.batch) &&
      (!f.provider || f.provider === "all" || t.provider === f.provider) &&
      (!f.outcome  || f.outcome  === "all" || t.outcome  === f.outcome) &&
      (!f.gender   || f.gender   === "all" || t.gender   === f.gender) &&
      (!f.q || (t.name + " " + t.id + " " + t.district + " " + t.course).toLowerCase().includes(f.q.toLowerCase()))
    );
  }

  function summarise(rows) {
    const n = rows.length || 1;
    const by = { employed: 0, self: 0, apprentice: 0, notplaced: 0 };
    let salarySum = 0, salaryN = 0, relSum = 0, retY = 0, retN = 0,
        certified = 0, consented = 0, growthSum = 0, growthN = 0, respond = 0, respondN = 0;

    rows.forEach((t) => {
      by[t.outcome]++;
      if (t.startingSalary) { salarySum += t.startingSalary; salaryN++; }
      if (t.currentSalary && t.startingSalary) { growthSum += t.currentSalary - t.startingSalary; growthN++; }
      relSum += t.relevance || 0;
      if (t.retained12m === true) retY++;
      if (t.retained12m === false) retN++;
      if (t.certified) certified++;
      if (t.consent) consented++;
      Object.values(t.follow).forEach((v) => {
        if (v === "scheduled") return;
        respondN++;
        if (v === "responded" || v === "assisted") respond++;
      });
    });

    const placed = by.employed + by.self + by.apprentice;
    return {
      total: rows.length,
      counts: by,
      employmentRate: (by.employed / n) * 100,
      selfRate:       (by.self / n) * 100,
      apprenticeRate: (by.apprentice / n) * 100,
      notPlacedRate:  (by.notplaced / n) * 100,
      placementRate:  (placed / n) * 100,
      avgStartingSalary: salaryN ? salarySum / salaryN : 0,
      avgWageGrowth:     growthN ? growthSum / growthN : 0,
      retention12m:  retY + retN ? (retY / (retY + retN)) * 100 : 0,
      relevance:     (relSum / n) / 5 * 100,
      certification: (certified / n) * 100,
      consentRate:   (consented / n) * 100,
      responseRate:  respondN ? (respond / respondN) * 100 : 0
    };
  }

  function groupBy(rows, key) {
    const m = new Map();
    rows.forEach((t) => {
      const k = t[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    });
    return m;
  }

  /** Aggregate `rows` by a dimension and return one summary record per group. */
  function breakdown(rows, key) {
    const out = [];
    groupBy(rows, key).forEach((group, k) => {
      const s = summarise(group);
      out.push(Object.assign({ key: k, rows: group }, s));
    });
    return out.sort((a, b) => b.total - a.total);
  }

  /** Follow-up funnel: response status across the 3m/6m/12m/24m waves. */
  function followUpWaves(rows) {
    const waves = ["3m", "6m", "12m", "24m"];
    return waves.map((w) => {
      let responded = 0, assisted = 0, no = 0, scheduled = 0;
      rows.forEach((t) => {
        const v = t.follow[w];
        if (v === "responded") responded++;
        else if (v === "assisted") assisted++;
        else if (v === "no-response") no++;
        else scheduled++;
      });
      return { wave: w, responded, assisted, noResponse: no, scheduled, due: responded + assisted + no };
    });
  }

  /** Average wage by months-since-training, for the progression chart. */
  function wageProgression(rows) {
    const buckets = [
      { label: "At placement", months: 0 },
      { label: "3 months",  months: 3 },
      { label: "6 months",  months: 6 },
      { label: "12 months", months: 12 },
      { label: "24 months", months: 24 }
    ];
    const placed = rows.filter((t) => t.startingSalary > 0);
    if (!placed.length) return buckets.map((b) => ({ label: b.label, value: 0, n: 0 }));
    const startAvg = placed.reduce((s, t) => s + t.startingSalary, 0) / placed.length;
    return buckets.map((b) => {
      const eligible = placed.filter((t) => t.monthsSince >= b.months);
      if (!eligible.length) return { label: b.label, value: null, n: 0 };
      const v = eligible.reduce((s, t) => {
        const span = Math.min(t.monthsSince, b.months);
        const rate = (t.currentSalary / t.startingSalary - 1) / Math.max(t.monthsSince, 1);
        return s + t.startingSalary * (1 + rate * span);
      }, 0) / eligible.length;
      return { label: b.label, value: Math.round(v), n: eligible.length, base: Math.round(startAvg) };
    });
  }

  function reasonBreakdown(rows) {
    const counts = {};
    rows.forEach((t) => { if (t.reason) counts[t.reason] = (counts[t.reason] || 0) + 1; });
    return NON_PLACEMENT_REASONS
      .map((r) => ({ code: r.code, label: r.label, value: counts[r.code] || 0 }))
      .sort((a, b) => b.value - a.value);
  }

  function skillGapRows() {
    // only courses with at least one related open job have an industry requirement to compare against
    return SKILL_GAPS.filter((s) => s.industry.length).map((s) => {
      const gap = s.industry.filter((k) => !s.taught.includes(k));
      return Object.assign({}, s, { gap, coverage: ((s.industry.length - gap.length) / s.industry.length) * 100 });
    }).sort((a, b) => a.coverage - b.coverage);
  }

  global.DB = {
    trainees, DISTRICTS, COURSES, PROVIDERS, BATCHES, EMPLOYERS,
    NON_PLACEMENT_REASONS, SKILL_GAPS, CAMPAIGNS, VALIDATION_QUEUE,
    VERIFY_REQUESTS, JOB_POSTINGS, AUDIT_LOG,
    ADMIN_USER, EMPLOYER_USER, TRAINEE_USER, USER, PUBLIC_STATS, OUTCOMES, FILTER_KEYS,
    filterTrainees, summarise, breakdown, groupBy,
    followUpWaves, wageProgression, reasonBreakdown, skillGapRows
  };
})(window);
