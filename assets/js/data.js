/* ==========================================================================
   data.js — mock data layer for SkillTrack
   --------------------------------------------------------------------------
   Everything the UI renders comes from here. A deterministic seeded generator
   builds a 10,000-trainee cohort in the browser so every filter, KPI and chart
   is computed from real records rather than hardcoded numbers.

   To go live: replace `DB.trainees` (and the lookup lists) with a fetch() to
   your API. Every consumer already goes through the helpers at the bottom.
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------- deterministic RNG (mulberry32) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(20260917);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pickW = (entries) => {                    // [[value, weight], ...]
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = rand() * total;
    for (const [v, w] of entries) { if ((r -= w) <= 0) return v; }
    return entries[entries.length - 1][0];
  };
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  /* ---------- reference lists ---------- */
  // `demand` is the local labour-market strength — it moves outcomes, which is
  // why two identical trainees in different districts do not fare the same.
  const DISTRICTS = [
    { name: "Indore",   weight: 22, demand: 1.07, lat: 22.72, lon: 75.86 },
    { name: "Bhopal",   weight: 18, demand: 1.04, lat: 23.26, lon: 77.41 },
    { name: "Jabalpur", weight: 13, demand: 0.99, lat: 23.18, lon: 79.99 },
    { name: "Gwalior",  weight: 12, demand: 0.96, lat: 26.22, lon: 78.18 },
    { name: "Ujjain",   weight: 10, demand: 1.00, lat: 23.18, lon: 75.78 },
    { name: "Sagar",    weight:  9, demand: 0.94, lat: 23.84, lon: 78.74 },
    { name: "Rewa",     weight:  8, demand: 0.91, lat: 24.53, lon: 81.30 },
    { name: "Satna",    weight:  8, demand: 0.93, lat: 24.57, lon: 80.83 }
  ];

  const COURSES = [
    { code: "WEB", name: "Web Development",            sector: "IT-ITeS",       duration: 6, fee: 18000, weight: 16, quality: 1.10, wage: 21500 },
    { code: "DAT", name: "Data Analytics",             sector: "IT-ITeS",       duration: 6, fee: 22000, weight: 12, quality: 1.14, wage: 24000 },
    { code: "ELE", name: "Electrician",                sector: "Power",         duration: 4, fee:  9000, weight: 13, quality: 1.02, wage: 16500 },
    { code: "WLD", name: "Welding Technician",         sector: "Capital Goods", duration: 3, fee:  8000, weight: 11, quality: 0.98, wage: 17200 },
    { code: "HCA", name: "Healthcare Assistant",       sector: "Healthcare",    duration: 5, fee: 12000, weight: 10, quality: 1.06, wage: 15800 },
    { code: "RSA", name: "Retail Sales Associate",     sector: "Retail",        duration: 2, fee:  5000, weight: 12, quality: 0.90, wage: 14200 },
    { code: "AUT", name: "Automotive Service Tech",    sector: "Automotive",    duration: 4, fee: 11000, weight:  9, quality: 0.97, wage: 16800 },
    { code: "BWL", name: "Beauty & Wellness",          sector: "Beauty",        duration: 3, fee:  7000, weight:  7, quality: 0.93, wage: 13500 },
    { code: "SPV", name: "Solar PV Technician",        sector: "Green Energy",  duration: 3, fee: 10000, weight:  6, quality: 1.04, wage: 18200 },
    { code: "AMO", name: "Apparel / Machine Operator", sector: "Textiles",      duration: 2, fee:  4500, weight:  4, quality: 0.88, wage: 12800 }
  ];

  const PROVIDERS = [
    { id: "PRV-01", name: "Skill Sagar Institute",  city: "Indore",   quality: 1.12, centres: 9,  accredited: true,  rating: 4.4 },
    { id: "PRV-02", name: "NavSkill Academy",       city: "Bhopal",   quality: 1.06, centres: 7,  accredited: true,  rating: 4.2 },
    { id: "PRV-03", name: "Bharat Tech Institute",  city: "Jabalpur", quality: 0.97, centres: 6,  accredited: true,  rating: 3.8 },
    { id: "PRV-04", name: "Udyam Skill Centre",     city: "Gwalior",  quality: 0.92, centres: 5,  accredited: false, rating: 3.4 },
    { id: "PRV-05", name: "Pragati Training Hub",   city: "Ujjain",   quality: 1.01, centres: 4,  accredited: true,  rating: 4.0 },
    { id: "PRV-06", name: "Sanchar Polytechnic",    city: "Rewa",     quality: 0.86, centres: 3,  accredited: false, rating: 3.1 }
  ];

  const BATCHES = [
    { id: "2024-A", label: "2024 Batch A", start: "2024-01-15", ageMonths: 32 },
    { id: "2024-B", label: "2024 Batch B", start: "2024-07-10", ageMonths: 26 },
    { id: "2025-A", label: "2025 Batch A", start: "2025-01-20", ageMonths: 20 },
    { id: "2025-B", label: "2025 Batch B", start: "2025-07-14", ageMonths: 14 },
    { id: "2026-A", label: "2026 Batch A", start: "2026-01-12", ageMonths:  8 }
  ];

  const EMPLOYERS = [
    { id: "EMP-101", name: "Aarav Technologies Pvt Ltd", sector: "IT-ITeS",       district: "Indore",   size: "250-500", verified: true,  gstin: "23AABCA1234F1Z5", contact: "Neha Raghuvanshi", email: "hr@aaravtech.in",     phone: "+91 98260 11234", hires: 0, rating: 4.5 },
    { id: "EMP-102", name: "Malwa Motors Service",       sector: "Automotive",    district: "Indore",   size: "50-250",  verified: true,  gstin: "23AACCM5678K1Z2", contact: "Rakesh Yadav",     email: "careers@malwamotors.in", phone: "+91 98931 55210", hires: 0, rating: 4.0 },
    { id: "EMP-103", name: "Narmada Health Services",    sector: "Healthcare",    district: "Bhopal",   size: "500+",    verified: true,  gstin: "23AAECN9012L1Z8", contact: "Dr. Shalini Nair",  email: "people@narmadahealth.org", phone: "+91 75520 30011", hires: 0, rating: 4.3 },
    { id: "EMP-104", name: "Vindhya Steel Works",        sector: "Capital Goods", district: "Jabalpur", size: "250-500", verified: true,  gstin: "23AAFCV3456M1Z1", contact: "Imran Qureshi",    email: "hr@vindhyasteel.com", phone: "+91 76940 88220", hires: 0, rating: 3.7 },
    { id: "EMP-105", name: "Shivaay Retail Mart",        sector: "Retail",        district: "Gwalior",  size: "50-250",  verified: false, gstin: "23AAGCS7890N1Z4", contact: "Priya Sharma",     email: "jobs@shivaayretail.in", phone: "+91 78690 44190", hires: 0, rating: 3.5 },
    { id: "EMP-106", name: "SunGrid Solar Solutions",    sector: "Green Energy",  district: "Ujjain",   size: "50-250",  verified: true,  gstin: "23AAHCS2345P1Z7", contact: "Vikram Patel",     email: "talent@sungrid.co.in", phone: "+91 99930 12876", hires: 0, rating: 4.1 },
    { id: "EMP-107", name: "Kaveri Apparel Exports",     sector: "Textiles",      district: "Indore",   size: "250-500", verified: true,  gstin: "23AAJCK6789Q1Z3", contact: "Meena Joshi",      email: "hr@kaveriapparel.in", phone: "+91 94250 77310", hires: 0, rating: 3.6 },
    { id: "EMP-108", name: "Satpura Power Services",     sector: "Power",         district: "Sagar",    size: "500+",    verified: true,  gstin: "23AAKCS1122R1Z9", contact: "Anil Deshmukh",    email: "recruit@satpurapower.in", phone: "+91 78050 66142", hires: 0, rating: 4.2 },
    { id: "EMP-109", name: "GlowUp Salon Chain",         sector: "Beauty",        district: "Bhopal",   size: "10-50",   verified: false, gstin: "23AALCG3344S1Z6", contact: "Rhea Kapoor",      email: "hello@glowupsalon.in", phone: "+91 90090 23477", hires: 0, rating: 3.3 },
    { id: "EMP-110", name: "DataBridge Analytics",       sector: "IT-ITeS",       district: "Bhopal",   size: "50-250",  verified: true,  gstin: "23AAMCD5566T1Z0", contact: "Sourabh Mishra",   email: "hiring@databridge.ai", phone: "+91 88170 90512", hires: 0, rating: 4.6 },
    { id: "EMP-111", name: "Rewa Agro Equipments",       sector: "Capital Goods", district: "Rewa",     size: "10-50",   verified: false, gstin: "23AANCR7788U1Z2", contact: "Suresh Tiwari",    email: "office@rewaagro.in", phone: "+91 70000 31284", hires: 0, rating: 3.2 },
    { id: "EMP-112", name: "Satna Cement Logistics",     sector: "Logistics",     district: "Satna",    size: "250-500", verified: true,  gstin: "23AAOCS9900V1Z5", contact: "Farhan Ali",       email: "hr@satnacement.in", phone: "+91 82250 74400", hires: 0, rating: 3.9 }
  ];

  const NON_PLACEMENT_REASONS = [
    { code: "SKILL",    label: "Lack of required skills",  weight: 24 },
    { code: "EXP",      label: "Lack of experience",       weight: 19 },
    { code: "INTV",     label: "Poor interview performance", weight: 14 },
    { code: "NOJOB",    label: "No suitable jobs nearby",  weight: 16 },
    { code: "SALARY",   label: "Salary expectations",      weight: 11 },
    { code: "PERSONAL", label: "Personal / relocation issues", weight: 10 },
    { code: "RELEV",    label: "Course not relevant",      weight:  6 }
  ];

  /* ---------- skill gap: industry demand vs curriculum ---------- */
  const SKILL_GAPS = [
    { course: "Web Development", industry: ["HTML/CSS", "JavaScript", "React", "Git", "REST APIs", "SQL", "Cloud Deploy"], taught: ["HTML/CSS", "JavaScript", "React"], demandIndex: 88 },
    { course: "Data Analytics",  industry: ["Excel", "SQL", "Python", "Power BI", "Statistics", "Cloud"], taught: ["Excel", "Python", "Statistics"], demandIndex: 92 },
    { course: "Electrician",     industry: ["Wiring", "Motor control", "PLC basics", "Safety cert", "Solar wiring"], taught: ["Wiring", "Motor control", "Safety cert"], demandIndex: 74 },
    { course: "Welding Technician", industry: ["ARC", "MIG", "TIG", "Blueprint reading", "NDT basics"], taught: ["ARC", "MIG", "Blueprint reading"], demandIndex: 71 },
    { course: "Healthcare Assistant", industry: ["Patient care", "Vitals", "EMR entry", "Infection control", "Basic life support"], taught: ["Patient care", "Vitals", "Infection control"], demandIndex: 80 },
    { course: "Retail Sales Associate", industry: ["Customer handling", "POS billing", "Inventory app", "Spoken English", "Upselling"], taught: ["Customer handling", "POS billing", "Inventory app"], demandIndex: 63 },
    { course: "Automotive Service Tech", industry: ["Engine service", "EV basics", "Diagnostics tool", "Customer handling"], taught: ["Engine service", "Diagnostics tool"], demandIndex: 77 },
    { course: "Solar PV Technician", industry: ["Panel install", "Inverter config", "Site survey", "Rooftop safety", "Net metering"], taught: ["Panel install", "Inverter config", "Rooftop safety"], demandIndex: 84 }
  ];

  /* ---------- name pools ---------- */
  const FIRST_M = ["Aarav","Rohit","Imran","Suresh","Vikram","Ankit","Deepak","Manish","Rahul","Sahil","Ravi","Karan","Nitin","Arjun","Farhan","Pankaj","Amit","Sandeep","Yash","Harsh","Gaurav","Mohit","Abhishek","Kunal","Devendra"];
  const FIRST_F = ["Priya","Neha","Anjali","Kavita","Pooja","Shalini","Meena","Ritu","Sunita","Divya","Rekha","Swati","Aarti","Nisha","Farida","Sneha","Komal","Preeti","Jyoti","Radha","Bhavna","Asha","Manisha","Tanvi","Isha"];
  const LAST = ["Sharma","Verma","Yadav","Patel","Jain","Mishra","Tiwari","Rathore","Chouhan","Solanki","Malviya","Gupta","Khan","Ansari","Nayak","Dubey","Pandey","Thakur","Rajput","Kushwaha","Bairagi","Sisodiya","Dangi","Ahirwar"];

  /* ---------- trainee generation ---------- */
  const TOTAL = 10000;
  const OUTCOMES = {
    employed:   { label: "Employed (wage)",  color: "var(--series-1)" },
    self:       { label: "Self-employed",    color: "var(--series-3)" },
    apprentice: { label: "Apprenticeship",   color: "var(--series-4)" },
    notplaced:  { label: "Not placed",       color: "var(--series-8)" }
  };

  function makeTrainee(i) {
    const gender  = pickW([["F", 44], ["M", 55], ["O", 1]]);
    const first   = gender === "F" ? pick(FIRST_F) : pick(FIRST_M);
    const name    = first + " " + pick(LAST);
    const dist     = DISTRICTS[pickW(DISTRICTS.map((d, idx) => [idx, d.weight]))];
    const district = dist.name;
    const course   = COURSES[pickW(COURSES.map((c, idx) => [idx, c.weight]))];
    const provider = PROVIDERS[pickW(PROVIDERS.map((p, idx) => [idx, 10 - idx]))];
    const batch    = BATCHES[pickW(BATCHES.map((b, idx) => [idx, [14, 18, 22, 24, 22][idx]]))];

    const attendance = Math.min(100, Math.round(int(66, 99) * (0.95 + provider.quality * 0.05)));
    const score      = Math.min(99, Math.round(int(42, 96) * (0.92 + provider.quality * 0.08)));
    const certified  = attendance >= 70 && score >= 45;

    // One quality index drives the outcome mix: provider × course × attendance ×
    // certification. q ≈ 1 reproduces the programme-wide target mix; a weak
    // provider or an uncertified trainee drops well below it.
    const q = 0.995 * provider.quality * course.quality * dist.demand *
              (gender === "F" ? 0.955 : 1) *          // the real placement gap, not a data artefact
              (0.90 + attendance / 800) * (certified ? 1.02 : 0.80);
    const outcome = pickW([
      ["employed",   70 * Math.pow(q, 1.6)],
      ["self",       12 * (2 - q)],
      ["apprentice",  8 * q],
      ["notplaced",  10 * Math.pow(Math.max(0.2, 2 - q), 4)]
    ]);

    const placed = outcome !== "notplaced";
    const base   = course.wage * (0.84 + rand() * 0.52) * (outcome === "apprentice" ? 0.62 : outcome === "self" ? 0.92 : 1);
    const starting = placed ? Math.round(base / 100) * 100 : 0;

    // wage progression grows with months since placement
    const months = batch.ageMonths;
    const growth = placed ? 1 + (months / 12) * (0.06 + rand() * 0.10) : 1;
    const current = placed ? Math.round((starting * growth) / 100) * 100 : 0;

    const retained12m = placed && months >= 12 ? rand() < (0.74 * (0.85 + provider.quality * 0.15)) : null;
    const relevance   = placed ? pickW([[5, 48], [4, 32], [3, 14], [2, 4], [1, 2]])
                               : pickW([[5, 10], [4, 20], [3, 32], [2, 24], [1, 14]]);

    let employer = null;
    if (outcome === "employed" || outcome === "apprentice") {
      const pool = EMPLOYERS.filter((e) => e.sector === course.sector);
      employer = pool.length ? pool[Math.floor(rand() * pool.length)] : pick(EMPLOYERS);
    }

    const consent = rand() < 0.968;
    const contactValid = rand() < 0.89;

    // Response decays with every wave — people change numbers and move away.
    // A trainee whose contact details already failed is far harder to reach.
    const followSteps = ["3m", "6m", "12m", "24m"];
    const RESP = [82, 71, 58, 44], ASSIST = [10, 14, 17, 19], LOST = [8, 15, 25, 37];
    const follow = {};
    followSteps.forEach((s, idx) => {
      if (months < [3, 6, 12, 24][idx]) { follow[s] = "scheduled"; return; }
      const penalty = contactValid ? 1 : 0.28;
      follow[s] = pickW([
        ["responded",   RESP[idx] * penalty],
        ["assisted",    ASSIST[idx]],
        ["no-response", LOST[idx] * (contactValid ? 1 : 3.4)]
      ]);
    });

    return {
      id: "SKL-MP-" + batch.id.slice(0, 4) + "-" + String(100000 + i).slice(1),
      name, gender,
      age: int(18, 34),
      phone: "+91 " + int(70, 99) + "0" + int(10, 99) + " " + int(10000, 99999),
      email: first.toLowerCase() + int(10, 99) + "@example.in",
      district, course: course.name, courseCode: course.code, sector: course.sector,
      provider: provider.name, providerId: provider.id,
      batch: batch.id, enrolled: batch.start,
      attendance, score, certified,
      outcome, employer: employer ? employer.name : null,
      employerId: employer ? employer.id : null,
      startingSalary: starting, currentSalary: current,
      retained12m,
      relevance,
      reason: outcome === "notplaced" ? pickW(NON_PLACEMENT_REASONS.map((r) => [r.code, r.weight])) : null,
      monthsSince: months,
      follow, consent, contactValid,
      verified: placed ? rand() < 0.81 : null
    };
  }

  const trainees = [];
  for (let i = 0; i < TOTAL; i++) trainees.push(makeTrainee(i));

  function recountHires() {
    const c = {};
    trainees.forEach((t) => { if (t.employerId) c[t.employerId] = (c[t.employerId] || 0) + 1; });
    EMPLOYERS.forEach((e) => { e.hires = c[e.id] || 0; });
  }
  recountHires();

  /* ---------- follow-up campaigns ---------- */
  const CAMPAIGNS = [
    { id: "CMP-311", name: "6-month outcome check — 2025-B",  channel: "SMS + WhatsApp", audience: 1840, sent: 1840, responded: 1276, status: "running",   started: "2026-09-02" },
    { id: "CMP-309", name: "12-month retention — 2025-A",     channel: "IVR call",       audience: 1610, sent: 1610, responded: 1042, status: "running",   started: "2026-08-21" },
    { id: "CMP-304", name: "3-month status — 2026-A",         channel: "App push",       audience: 2210, sent: 2210, responded: 1789, status: "completed", started: "2026-06-11" },
    { id: "CMP-298", name: "24-month livelihood — 2024-A",    channel: "Assisted call",  audience: 1290, sent: 1290, responded:  701, status: "completed", started: "2026-03-04" },
    { id: "CMP-294", name: "Employer verification sweep Q2",  channel: "Email",          audience:  412, sent:  412, responded:  338, status: "completed", started: "2026-04-18" }
  ];

  /* ---------- data validation queue ---------- */
  const VALIDATION_QUEUE = [
    { id: "FLG-8821", type: "Salary outlier",        severity: "serious",  subject: "SKL-MP-2025-04120", detail: "Reported monthly wage ₹96,000 is 4.8× the course median (₹19,800).", source: "Self-reported (app)", raised: "2026-09-15" },
    { id: "FLG-8817", type: "Employer mismatch",     severity: "critical", detail: "Trainee reports 'Vindhya Steel Works'; employer record shows no such hire.", subject: "SKL-MP-2025-02887", source: "Cross-check — employer portal", raised: "2026-09-15" },
    { id: "FLG-8814", type: "Duplicate identity",    severity: "critical", detail: "Two trainee IDs share the same phone + date of birth across providers.", subject: "SKL-MP-2024-00913", source: "Dedup engine", raised: "2026-09-14" },
    { id: "FLG-8809", type: "Unreachable contact",   severity: "warning",  detail: "Phone disconnected on 3 consecutive follow-up attempts. Alternate contact needed.", subject: "SKL-MP-2025-03341", source: "Follow-up engine", raised: "2026-09-14" },
    { id: "FLG-8803", type: "GSTIN unverified",      severity: "warning",  detail: "Employer GSTIN could not be validated against the GST API.", subject: "EMP-105 — Shivaay Retail Mart", source: "GST API", raised: "2026-09-13" },
    { id: "FLG-8798", type: "Attendance anomaly",    severity: "serious",  detail: "Provider uploaded 100% attendance for an entire batch of 62 trainees.", subject: "PRV-06 — Batch 2026-A", source: "Anomaly detection", raised: "2026-09-12" },
    { id: "FLG-8790", type: "Certificate date",      severity: "warning",  detail: "Certification date precedes course end date by 19 days.", subject: "SKL-MP-2026-07714", source: "Rule engine", raised: "2026-09-11" }
  ];

  /* ---------- employer-side verification requests ---------- */
  const VERIFY_REQUESTS = [
    { id: "VR-4471", trainee: "Anjali Verma",   traineeId: "SKL-MP-2025-03102", role: "Junior Data Analyst",     since: "2026-04-01", salary: 23500, raised: "2026-09-16", status: "pending" },
    { id: "VR-4468", trainee: "Rohit Yadav",    traineeId: "SKL-MP-2025-02755", role: "Frontend Developer",      since: "2026-03-18", salary: 26000, raised: "2026-09-16", status: "pending" },
    { id: "VR-4465", trainee: "Farhan Ansari",  traineeId: "SKL-MP-2026-08120", role: "Support Engineer",        since: "2026-07-05", salary: 19500, raised: "2026-09-15", status: "pending" },
    { id: "VR-4460", trainee: "Kavita Solanki", traineeId: "SKL-MP-2025-04412", role: "QA Trainee",              since: "2026-02-10", salary: 18000, raised: "2026-09-12", status: "confirmed" },
    { id: "VR-4452", trainee: "Manish Dubey",   traineeId: "SKL-MP-2024-01188", role: "Apprentice — Networking", since: "2025-11-01", salary: 14500, raised: "2026-09-09", status: "confirmed" },
    { id: "VR-4448", trainee: "Sneha Pandey",   traineeId: "SKL-MP-2025-03980", role: "Sales Executive",         since: "2026-01-20", salary: 17200, raised: "2026-09-08", status: "disputed" }
  ];

  const JOB_POSTINGS = [
    { id: "JOB-2210", title: "Junior Frontend Developer", openings: 8,  skills: ["JavaScript", "React", "Git"],           district: "Indore", salary: "₹22,000 – ₹28,000", posted: "2026-09-10", applicants: 47, status: "open" },
    { id: "JOB-2207", title: "Data Analyst Trainee",      openings: 5,  skills: ["SQL", "Power BI", "Excel"],             district: "Indore", salary: "₹20,000 – ₹26,000", posted: "2026-09-06", applicants: 62, status: "open" },
    { id: "JOB-2199", title: "Field Solar Technician",    openings: 12, skills: ["Panel install", "Net metering"],        district: "Ujjain", salary: "₹17,000 – ₹21,000", posted: "2026-08-28", applicants: 31, status: "open" },
    { id: "JOB-2184", title: "Apprentice — IT Support",   openings: 10, skills: ["Networking", "Hardware", "Ticketing"],  district: "Bhopal", salary: "₹12,000 stipend",   posted: "2026-08-14", applicants: 88, status: "closed" }
  ];

  const AUDIT_LOG = [
    { at: "2026-09-17 09:42", actor: "r.mehta@mpssdm.gov.in",  action: "Approved provider re-accreditation", target: "PRV-05 Pragati Training Hub", ip: "10.24.8.31" },
    { at: "2026-09-17 09:15", actor: "system",                 action: "Nightly GST + EPFO cross-check completed (412 records)", target: "Validation engine", ip: "—" },
    { at: "2026-09-16 18:03", actor: "s.iyer@mpssdm.gov.in",   action: "Exported district outcome report (CSV)", target: "Indore, 2025-B", ip: "10.24.8.77" },
    { at: "2026-09-16 16:20", actor: "r.mehta@mpssdm.gov.in",  action: "Merged duplicate trainee records", target: "SKL-MP-2024-00913", ip: "10.24.8.31" },
    { at: "2026-09-16 11:47", actor: "hr@aaravtech.in",        action: "Confirmed 4 employment verifications", target: "EMP-101", ip: "103.68.22.14" },
    { at: "2026-09-15 15:31", actor: "system",                 action: "Launched follow-up campaign CMP-311", target: "1,840 trainees", ip: "—" },
    { at: "2026-09-15 10:05", actor: "a.khan@mpssdm.gov.in",   action: "Revoked portal access (role change)", target: "PRV-06 co-ordinator", ip: "10.24.9.12" }
  ];

  const ADMIN_USER = {
    name: "Rohan Mehta", initials: "RM",
    role: "State Programme Administrator",
    dept: "MP State Skill Development Mission",
    id: "ADM-0042", email: "r.mehta@mpssdm.gov.in", phone: "+91 98260 44120",
    jurisdiction: "All districts — Madhya Pradesh",
    since: "2024-02-11", lastLogin: "2026-09-17 09:12 IST", mfa: true,
    permissions: [
      { name: "View aggregate analytics",   granted: true },
      { name: "View trainee PII (consented)", granted: true },
      { name: "Approve / suspend providers", granted: true },
      { name: "Resolve validation flags",    granted: true },
      { name: "Launch follow-up campaigns",  granted: true },
      { name: "Export raw microdata",        granted: false },
      { name: "Manage admin accounts",       granted: true },
      { name: "Edit consent records",        granted: false }
    ]
  };

  const EMPLOYER_USER = Object.assign({}, EMPLOYERS[0], {
    initials: "AT",
    onboarded: "2024-06-02",
    contactRole: "Head of Talent Acquisition",
    address: "Plot 44, Electronic Complex, Pardeshipura, Indore 452010",
    website: "aaravtech.in",
    apiKey: "sk_emp_live_9f2a••••••••3c71"
  });

  /* ---------- the featured trainee (for the trainee profile page) ---------- */
  const TRAINEE_USER = {
    id: "SKL-MP-2025-03102", initials: "AV",
    name: "Anjali Verma", gender: "F", age: 23,
    phone: "+91 94250 31182", altPhone: "+91 78690 22014",
    email: "anjali.verma@example.in",
    district: "Indore", address: "Scheme 78, Vijay Nagar, Indore 452010",
    aadhaarMasked: "XXXX XXXX 4417",
    course: "Data Analytics", courseCode: "DAT",
    provider: "Skill Sagar Institute", providerId: "PRV-01",
    batch: "2025-A", enrolled: "2025-01-20", completed: "2025-07-18",
    attendance: 92, score: 84, certified: true,
    certId: "CERT-DAT-2025-11840", certDate: "2025-07-25",
    outcome: "employed", employer: "DataBridge Analytics", employerId: "EMP-110",
    role: "Junior Data Analyst", employedSince: "2026-04-01",
    startingSalary: 21000, currentSalary: 23500,
    relevance: 4, verified: true, consent: true,
    skills: [
      { name: "Excel", level: 90 }, { name: "Python", level: 78 },
      { name: "SQL", level: 72 }, { name: "Statistics", level: 68 },
      { name: "Power BI", level: 45 }, { name: "Cloud", level: 22 }
    ],
    wageHistory: [
      { label: "At placement", month: "Apr 2026", amount: 21000 },
      { label: "3-month",      month: "Jul 2026", amount: 21000 },
      { label: "6-month",      month: "Oct 2026", amount: 23500 },
      { label: "Projected 12m", month: "Apr 2027", amount: 26000, projected: true }
    ],
    journey: [
      { stage: "Registration & consent", date: "2025-01-12", status: "done", note: "Unique ID SKL-MP-2025-03102 issued. Consent granted for outcome tracking (24 months)." },
      { stage: "Enrolment",              date: "2025-01-20", status: "done", note: "Data Analytics (6 months) at Skill Sagar Institute, Indore centre." },
      { stage: "Attendance",             date: "2025-07-18", status: "done", note: "92% attendance across 148 session days." },
      { stage: "Assessment",             date: "2025-07-20", status: "done", note: "Final assessment score 84/100 — Grade A." },
      { stage: "Certification",          date: "2025-07-25", status: "done", note: "NSQF Level 4 certificate CERT-DAT-2025-11840 issued." },
      { stage: "Placement linkage",      date: "2026-04-01", status: "done", note: "Joined DataBridge Analytics as Junior Data Analyst. Verified by employer on 2026-04-09." },
      { stage: "6-month follow-up",      date: "2026-10-01", status: "active", note: "Outcome survey open — 2 questions pending your response." },
      { stage: "12-month follow-up",     date: "2027-04-01", status: "upcoming", note: "Retention and wage progression check." },
      { stage: "24-month follow-up",     date: "2028-04-01", status: "upcoming", note: "Long-term livelihood outcome check." }
    ],
    pendingSurvey: [
      { q: "Are you still working at DataBridge Analytics?", type: "yesno" },
      { q: "What is your current monthly take-home salary?", type: "amount" },
      { q: "How relevant was your training to this job?",    type: "scale" }
    ],
    notifications: [
      { at: "2026-09-16", text: "Your 6-month outcome survey is open. Responding keeps your record verified.", kind: "warning" },
      { at: "2026-09-02", text: "DataBridge Analytics confirmed your employment record.", kind: "good" },
      { at: "2026-08-19", text: "New course recommended: Power BI Specialist (fills 2 of your skill gaps).", kind: "info" }
    ]
  };

  /* Splice the featured profile into the cohort so the registry, the employer's
     hire list and the district totals all agree with the trainee profile page. */
  (function () {
    const T = TRAINEE_USER;
    Object.assign(trainees[3102], {
      id: T.id, name: T.name, gender: "F", age: T.age, phone: T.phone, email: T.email,
      district: T.district, course: T.course, courseCode: T.courseCode, sector: "IT-ITeS",
      provider: T.provider, providerId: T.providerId, batch: T.batch, enrolled: T.enrolled,
      attendance: T.attendance, score: T.score, certified: true,
      outcome: "employed", employer: T.employer, employerId: T.employerId,
      startingSalary: T.startingSalary, currentSalary: T.currentSalary,
      retained12m: null, relevance: T.relevance, reason: null, monthsSince: 20,
      follow: { "3m": "responded", "6m": "no-response", "12m": "scheduled", "24m": "scheduled" },
      consent: true, contactValid: true, verified: true
    });
    recountHires();
  })();

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
      relSum += t.relevance;
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
    return SKILL_GAPS.map((s) => {
      const gap = s.industry.filter((k) => !s.taught.includes(k));
      return Object.assign({}, s, { gap, coverage: ((s.industry.length - gap.length) / s.industry.length) * 100 });
    }).sort((a, b) => a.coverage - b.coverage);
  }

  global.DB = {
    trainees, DISTRICTS, COURSES, PROVIDERS, BATCHES, EMPLOYERS,
    NON_PLACEMENT_REASONS, SKILL_GAPS, CAMPAIGNS, VALIDATION_QUEUE,
    VERIFY_REQUESTS, JOB_POSTINGS, AUDIT_LOG,
    ADMIN_USER, EMPLOYER_USER, TRAINEE_USER, OUTCOMES, FILTER_KEYS,
    filterTrainees, summarise, breakdown, groupBy,
    followUpWaves, wageProgression, reasonBreakdown, skillGapRows
  };
})(window);
