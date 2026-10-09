/* ==========================================================================
   register.js — three-step trainee registration

   Each step validates before it will advance, so a person finds out about a bad
   phone number on the step that asked for it rather than at the end. Nothing is
   submitted until consent is given: that is the whole point of the flow.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, toast } = UI;

  const STEPS = [
    { n: 1, label: "Basic information", caption: "Step 1 of 3 — who you are and how to reach you" },
    { n: 2, label: "Education & skills", caption: "Step 2 of 3 — your starting point" },
    { n: 3, label: "Consent",            caption: "Step 3 of 3 — what you agree to" }
  ];

  let step = 1;

  /* ---------- populate the lists from the reference data ---------- */
  $("#district").insertAdjacentHTML("beforeend",
    DB.DISTRICTS.map((d) => `<option>${esc(d.name)}</option>`).join(""));

  const SECTORS = Array.from(new Set(DB.COURSES.map((c) => c.sector))).sort();
  $("#industry").insertAdjacentHTML("beforeend",
    SECTORS.map((s) => `<option>${esc(s)}</option>`).join(""));

  // A baseline skill list drawn from what industry actually asks for, so the
  // options line up with the skill-gap analysis later.
  const SKILLS = Array.from(new Set(DB.SKILL_GAPS.flatMap((g) => g.industry))).sort();
  $("#skillPicker").innerHTML = SKILLS.map((s, i) => `
    <label class="skill-tag" style="cursor:pointer">
      <input type="checkbox" value="${esc(s)}" style="accent-color:var(--brand);margin:0">
      ${esc(s)}
    </label>`).join("");

  /* ---------- stepper ---------- */
  function renderStepper() {
    $("#stepper").innerHTML = STEPS.map((s) => {
      const state = s.n < step ? "step--done" : s.n === step ? "step--active" : "";
      return `<div class="step ${state}">
                <span class="step__dot">${s.n < step ? "✓" : s.n}</span>
                <span class="step__label">${esc(s.label)}</span>
              </div>`;
    }).join("");
    $("#stepCaption").textContent = STEPS[step - 1].caption;
  }

  function showStep(n) {
    step = n;
    $$("[data-step]").forEach((sec) => { sec.hidden = Number(sec.dataset.step) !== n; });
    $("#backBtn").hidden = n === 1;
    $("#nextBtn").hidden = n === 3;
    $("#finishBtn").hidden = n !== 3;
    $("#navHint").textContent = n === 3 ? "Consent is required to continue" : "";
    renderStepper();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- validation ---------- */
  function setError(id, message) {
    const el = $("#" + id);
    const err = $("#" + id + "Err");
    const wrap = el.closest(".field");
    if (wrap) wrap.classList.toggle("field--error", Boolean(message));
    if (err) { err.textContent = message || ""; err.hidden = !message; }
    return !message;
  }

  const required = (id, message) => setError(id, $("#" + id).value.trim() ? "" : message);

  const digits = (s) => s.replace(/\D/g, "");

  function validPhone(id, message, optional) {
    const raw = $("#" + id).value.trim();
    if (!raw) return setError(id, optional ? "" : message);
    const d = digits(raw);
    // Indian mobile numbers are 10 digits starting 6–9; tolerate a +91 prefix.
    const local = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
    return setError(id, /^[6-9]\d{9}$/.test(local) ? "" : "Enter a valid 10-digit mobile number.");
  }

  function validateStep1() {
    let ok = true;
    ok = required("fullName", "Enter your full name.") && ok;

    const dobVal = $("#dob").value;
    if (!dobVal) {
      ok = setError("dob", "Enter your date of birth.") && ok;
    } else {
      const dob = new Date(dobVal);
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 15) ok = setError("dob", "You must be at least 15 to enrol.") && ok;
      else if (age > 100) ok = setError("dob", "Check the year — that date looks wrong.") && ok;
      else setError("dob", "");
    }

    ok = required("gender", "Select an option.") && ok;
    ok = validPhone("phone", "Enter your mobile number.") && ok;
    ok = validPhone("altPhone", "", true) && ok;

    const email = $("#email").value.trim();
    ok = setError("email", !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      ? "" : "Enter a valid email address, or leave it blank.") && ok;

    ok = required("district", "Select your district.") && ok;
    ok = required("location", "Where are you living now?") && ok;
    return ok;
  }

  function validateStep2() {
    let ok = true;
    ok = required("education", "Select your highest education.") && ok;
    ok = required("experience", "Select an option.") && ok;
    ok = required("industry", "Select a preferred industry.") && ok;
    ok = required("jobRole", "What role are you aiming for?") && ok;
    return ok;
  }

  function validateStep3() {
    const given = $("#consentMain").checked;
    const err = $("#consentMainErr");
    err.textContent = given ? "" : "You must consent before we can track your outcomes.";
    err.hidden = given;
    return given;
  }

  const VALIDATORS = { 1: validateStep1, 2: validateStep2, 3: validateStep3 };

  function focusFirstError() {
    const bad = $(".field--error .input, .field--error .select");
    if (bad) bad.focus();
  }

  /* clear an error as soon as the person starts fixing it */
  $("#regForm").addEventListener("input", (e) => {
    if (e.target.id && $("#" + e.target.id + "Err")) setError(e.target.id, "");
  });
  $("#consentMain").addEventListener("change", () => {
    if ($("#consentMain").checked) $("#consentMainErr").hidden = true;
  });

  /* ---------- navigation ---------- */
  $("#nextBtn").addEventListener("click", () => {
    if (!VALIDATORS[step]()) {
      toast("Check the highlighted fields", "warn");
      focusFirstError();
      return;
    }
    showStep(step + 1);
  });

  $("#backBtn").addEventListener("click", () => showStep(step - 1));

  /* ---------- ID generation ---------- */
  /* Matches the cohort format (SKL-MP-YYYY-NNNNN) so a new registration sorts and
     filters alongside every existing record instead of being a special case. */
  function generateId() {
    const year = new Date().getFullYear();
    const used = new Set(DB.trainees.map((t) => t.id));
    let seq = DB.trainees.length + 1;
    let id;
    do {
      id = `SKL-MP-${year}-${String(seq).padStart(5, "0")}`;
      seq++;
    } while (used.has(id));
    return id;
  }

  /* ---------- submit ---------- */
  $("#regForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateStep3()) {
      toast("Consent is required to complete registration", "warn");
      $("#consentMain").focus();
      return;
    }

    const btn = $("#finishBtn");
    btn.disabled = true;
    btn.textContent = "Registering…";

    const chosenSkills = $$("#skillPicker input:checked").map((i) => i.value);
    const other = $("#otherSkills").value.split(",").map((s) => s.trim()).filter(Boolean);

    const record = {
      name: $("#fullName").value.trim(),
      dob: $("#dob").value,
      gender: $("#gender").value,
      phone: $("#phone").value.trim(),
      email: $("#email").value.trim(),
      district: $("#district").value,
      location: $("#location").value.trim(),
      education: $("#education").value,
      experience: $("#experience").value,
      industry: $("#industry").value,
      jobRole: $("#jobRole").value.trim(),
      skills: chosenSkills.concat(other),
      consent: true,
      sharing: {
        employers: $("#shareEmployers").checked,
        research: $("#shareResearch").checked,
        alerts: $("#shareAlerts").checked
      }
    };

    const id = generateId();

    // The backend has no registration endpoint yet, so the ID is issued locally.
    // Persisting the draft means a reviewer who reloads does not lose the record.
    try {
      sessionStorage.setItem("skilltrack-registration", JSON.stringify({ id, record }));
    } catch (err) { /* private mode — the flow still completes */ }

    await new Promise((r) => setTimeout(r, 500));

    $("#regForm").hidden = true;
    $("#newId").textContent = id;
    $("#done").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Registration complete — ID " + id);
  });

  /* ---------- copy the ID ---------- */
  $("#copyId").addEventListener("click", async () => {
    const id = $("#newId").textContent;
    try {
      await navigator.clipboard.writeText(id);
      toast("Copied " + id);
    } catch (err) {
      toast("Copy failed — write it down: " + id, "warn");
    }
  });

  $("#themeBtn").addEventListener("click", UI.cycleTheme);
  showStep(1);
})();
