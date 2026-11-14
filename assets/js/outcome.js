/* ==========================================================================
   outcome.js — post-training outcome capture

   One question with four branches. Only the chosen branch is shown, and only
   the chosen branch is validated — asking a self-employed trainee for a joining
   date is how you train people to enter rubbish.

   "Not placed" is treated as a first-class answer, not a failure to report: its
   reason code is what drives the non-placement analytics and the remedial
   recommendations on the dashboard.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, toast, avatar } = UI;

  /* ---------- who is updating ---------- */
  const P = DB.TRAINEE_USER;

  UI.renderShell({
    title: "Update your outcome",
    crumb: "Trainee portal · " + P.id,
    user: { name: P.name, role: "Trainee · " + P.district }
  });

  $("#ctxAvatar").innerHTML = avatar(P.name, "avatar--lg");
  $("#ctxName").textContent = P.name;
  $("#ctxMeta").textContent = `${P.id} · ${P.course} · certificate ${P.certId}`;
  if (P.certStatus !== 1) {
    $("#ctxCert").className = "chip chip--warning";
    $("#ctxCert").textContent = P.certStatus === 0 ? "Certificate pending verification" : "Certificate not verified";
  }

  /* ---------- the four branches ---------- */
  const BRANCHES = [
    { id: "employed",   icon: "💼", title: "Employed",
      sub: "I am working for a company or an individual for a wage." },
    { id: "self",       icon: "🚀", title: "Self-employed",
      sub: "I run my own business, trade or freelance work." },
    { id: "apprentice", icon: "🎓", title: "Apprenticeship",
      sub: "I am in a formal apprenticeship or internship." },
    { id: "notplaced",  icon: "❌", title: "Not yet placed",
      sub: "I am still looking for work, or not working right now." }
  ];

  $("#outcomeChoices").innerHTML = BRANCHES.map((b) => `
    <label class="choice">
      <input type="radio" name="outcome" value="${b.id}">
      <span class="choice__check">✓</span>
      <span class="choice__ico">${b.icon}</span>
      <span class="choice__title">${esc(b.title)}</span>
      <span class="choice__sub">${esc(b.sub)}</span>
    </label>`).join("");

  /* ---------- populate reference lists ---------- */
  const SECTORS = Array.from(new Set(DB.COURSES.map((c) => c.sector))).sort();
  $("#emp_industry").insertAdjacentHTML("beforeend",
    SECTORS.map((s) => `<option>${esc(s)}</option>`).join(""));

  const employerOptions = DB.EMPLOYERS.map((e) => `<option value="${esc(e.name)}">`).join("");
  $("#employerList").innerHTML = employerOptions;
  $("#employerList2").innerHTML = employerOptions;

  // Skills the trainee's own course teaches (from its published qualification pack).
  const gapRow = DB.SKILL_GAPS.find((g) => g.course === P.course);
  const taught = gapRow ? gapRow.taught : [];
  $("#self_skills").innerHTML = taught.length
    ? taught.map((s) => `
        <label class="skill-tag" style="cursor:pointer">
          <input type="checkbox" value="${esc(s)}" style="accent-color:var(--brand);margin:0">
          ${esc(s)}
        </label>`).join("")
    : `<span class="small muted">No skill map recorded for this course yet.</span>`;

  // The gap list shown to an unplaced trainee — their reason for not being placed
  // is far more useful when set against what their course actually left out.
  if (gapRow) {
    const missing = gapRow.industry.filter((k) => !gapRow.taught.includes(k));
    if (missing.length) {
      $("#np_gapBanner").hidden = false;
      $("#np_gapTags").innerHTML =
        missing.map((k) => `<span class="skill-tag skill-tag--gap">⚠ ${esc(k)}</span>`).join("");
    }
  }

  /* ---------- prefill sensible defaults ---------- */
  $("#emp_location").value = P.district;
  $("#self_location").value = P.district;
  const courseSector = (DB.COURSES.find((c) => c.name === P.course) || {}).sector;
  if (courseSector) $("#emp_industry").value = courseSector;

  /* ---------- branch switching ---------- */
  let chosen = null;

  $("#outcomeChoices").addEventListener("change", (e) => {
    if (e.target.name !== "outcome") return;
    chosen = e.target.value;
    $$("[data-branch]").forEach((sec) => { sec.hidden = sec.dataset.branch !== chosen; });
    $("#submitCard").hidden = false;
    $("#outcomeErr").hidden = true;

    $("#privacyNote").textContent = chosen === "notplaced"
      ? "Your reason is aggregated into the non-placement analysis that decides what remedial "
        + "training gets funded. It is never attached to your name on a dashboard."
      : "Your answer updates your record and feeds the programme's aggregate statistics. "
        + "Your salary and contact details are never shown publicly.";

    document.querySelector("[data-branch='" + chosen + "']")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* "Other" reveals a free-text box — otherwise the commonest real reason is lost. */
  $("#np_reason").addEventListener("change", (e) => {
    $("#np_otherWrap").hidden = e.target.value !== "OTHER";
  });

  /* ---------- validation ---------- */
  function setError(id, message) {
    const el = $("#" + id);
    const err = $("#" + id + "Err");
    const wrap = el.closest(".field");
    if (wrap) wrap.classList.toggle("field--error", Boolean(message));
    if (err) { err.textContent = message || ""; err.hidden = !message; }
    return !message;
  }

  const need = (id, message) => setError(id, $("#" + id).value.trim() ? "" : message);

  function notFuture(id, message) {
    const v = $("#" + id).value;
    if (!v) return setError(id, message);
    return setError(id, new Date(v) > new Date() ? "That date is in the future." : "");
  }

  function amount(id, message, min, max) {
    const raw = $("#" + id).value.trim();
    if (!raw) return setError(id, message);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min) {
      return setError(id, `Enter an amount of at least ₹${min.toLocaleString("en-IN")}.`);
    }
    if (n > max) {
      // The commonest data error in wage self-reporting is an annual figure in a
      // monthly field. If a twelfth of it is plausible, say so rather than just
      // calling the number invalid — the person then knows what to type instead.
      const monthly = n / 12;
      return setError(id, monthly >= min && monthly <= max
        ? `That looks like a yearly figure — enter the monthly amount (about ₹${Math.round(monthly).toLocaleString("en-IN")}).`
        : `Enter a realistic monthly amount, up to ₹${max.toLocaleString("en-IN")}.`);
    }
    return setError(id, "");
  }

  const RULES = {
    employed: () => {
      let ok = true;
      ok = need("emp_company", "Who do you work for?") && ok;
      ok = need("emp_role", "What is your job title?") && ok;
      ok = need("emp_industry", "Select an industry.") && ok;
      ok = need("emp_location", "Where do you work?") && ok;
      ok = notFuture("emp_joined", "When did you join?") && ok;
      ok = amount("emp_salary", "Enter your monthly salary.", 1000, 200000) && ok;
      ok = need("emp_type", "Select an employment type.") && ok;
      ok = need("emp_relevance", "Select how relevant your training was.") && ok;
      return ok;
    },
    self: () => {
      let ok = true;
      ok = need("self_type", "What kind of work is it?") && ok;
      ok = need("self_location", "Where do you operate?") && ok;
      ok = notFuture("self_started", "When did you start?") && ok;
      ok = need("self_income", "Select an income range.") && ok;
      ok = need("self_employees", "Select an option.") && ok;
      return ok;
    },
    apprentice: () => {
      let ok = true;
      ok = need("app_org", "Which organisation?") && ok;
      ok = need("app_role", "What is your role?") && ok;
      ok = notFuture("app_started", "When did you start?") && ok;
      ok = need("app_duration", "How long is it?") && ok;
      ok = amount("app_stipend", "Enter your monthly stipend.", 500, 100000) && ok;
      return ok;
    },
    notplaced: () => {
      let ok = true;
      ok = need("np_reason", "Select the main reason.") && ok;
      ok = need("np_looking", "How long have you been looking?") && ok;
      ok = need("np_help", "What would help most?") && ok;
      return ok;
    }
  };

  $("#outcomeForm").addEventListener("input", (e) => {
    if (e.target.id && $("#" + e.target.id + "Err")) setError(e.target.id, "");
  });

  /* ---------- submit ---------- */
  $("#outcomeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!chosen) {
      const err = $("#outcomeErr");
      err.textContent = "Choose the option that describes your situation.";
      err.hidden = false;
      toast("Select your current situation", "warn");
      return;
    }

    if (!RULES[chosen]()) {
      toast("Check the highlighted fields", "warn");
      const bad = $(".field--error .input, .field--error .select");
      if (bad) bad.focus();
      return;
    }

    const btn = $("#submitOutcome");
    btn.disabled = true;
    btn.textContent = "Submitting…";

    const payload = collect(chosen);
    const res = await API.saveOutcome(payload);
    if (!res.ok) {
      toast(res.error, "bad");
      btn.disabled = false;
      btn.textContent = "Submit update";
      return;
    }

    $("#outcomeForm").hidden = true;
    $("#contextCard").hidden = true;
    $("#doneMessage").textContent = MESSAGES[chosen] + " Saved to your record.";
    $("#outcomeDone").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Outcome recorded");
  });

  const MESSAGES = {
    employed:
      "If your employer is registered on SkillTrack they can confirm this record, and it "
      + "is then marked verified. Until then it counts as self-reported.",
    self:
      "Self-employment is tracked the same way as a job. Update this page whenever your "
      + "situation changes.",
    apprentice:
      "Update this page when your apprenticeship ends, so we can see whether it became a "
      + "permanent role.",
    notplaced:
      "Thank you for telling us. Your reason goes into the non-placement analysis on the "
      + "programme dashboard."
  };

  /** The fields the outcome register stores. shortcut: role, dates, type and self-employment
      details are asked but not stored yet; add columns to `trainees` when they are needed. */
  function collect(branch) {
    const val = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
    if (branch === "employed") {
      return { outcome: "employed", employer_name: val("emp_company"), salary: Number(val("emp_salary")),
               relevance: Number(val("emp_relevance")) || null };
    }
    if (branch === "self") {
      return { outcome: "self", employer_name: val("self_name") || null, salary: null, relevance: null };
    }
    if (branch === "apprentice") {
      return { outcome: "apprentice", employer_name: val("app_org"), salary: Number(val("app_stipend")), relevance: null };
    }
    // RELOC is folded into PERSONAL ("Personal / relocation issues") in the reason taxonomy
    const reason = val("np_reason") === "RELOC" ? "PERSONAL" : val("np_reason");
    return { outcome: "notplaced", reason };
  }

  UI.initDemoActions();
})();
