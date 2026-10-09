/* ==========================================================================
   login.js — role-based sign-in

   The role is not decoration: it decides the destination, the ID format the
   field expects, and (in a real build) the scope of the session token. Picking
   it first is what lets the credential step explain itself.
   ========================================================================== */
(function () {
  "use strict";

  const { $, $$, esc, toast } = UI;

  const ROLES = [
    {
      id: "trainee", icon: "◉", title: "Trainee", accent: "var(--good-soft)",
      sub: "See your training record, update your outcome and answer follow-ups.",
      idLabel: "SkillTrack trainee ID", placeholder: "SKL-MP-2025-03102",
      hint: "The ID issued when you registered — printed on your certificate.",
      pattern: /^SKL-MP-\d{4}-\d{5}$/i,
      patternHelp: "Trainee IDs look like SKL-MP-2025-03102.",
      go: "trainee.html"
    },
    {
      id: "provider", icon: "⌂", title: "Training provider", accent: "var(--info-soft)",
      sub: "Upload batches, attendance and assessment results for your centres.",
      idLabel: "Provider code", placeholder: "PRV-01",
      hint: "Issued at accreditation. Contact the mission office if it has lapsed.",
      pattern: /^PRV-\d{2}$/i,
      patternHelp: "Provider codes look like PRV-01.",
      go: "admin.html#providers"
    },
    {
      id: "employer", icon: "▤", title: "Employer", accent: "var(--warning-soft)",
      sub: "Verify employment claims, report exits and post openings.",
      idLabel: "Employer ID or work email", placeholder: "hr@aaravtech.in",
      hint: "The address the verification requests are sent to.",
      pattern: null,
      patternHelp: "",
      go: "employer.html"
    },
    {
      id: "admin", icon: "⚙", title: "Administrator", accent: "var(--brand-soft)",
      sub: "Programme analytics, data validation, campaigns and access control.",
      idLabel: "Official email address", placeholder: "r.mehta@mpssdm.gov.in",
      hint: "Government address only. A second factor is required after this step.",
      pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
      patternHelp: "Enter a full email address.",
      go: "admin.html"
    }
  ];

  let selected = null;

  /* ---------- render the role picker ---------- */
  $("#roleChoices").innerHTML = ROLES.map((r) => `
    <label class="choice">
      <input type="radio" name="role" value="${r.id}">
      <span class="choice__check">✓</span>
      <span class="choice__ico" style="background:${r.accent};width:36px;height:36px;border-radius:9px;display:grid;place-items:center">${r.icon}</span>
      <span class="choice__title">${esc(r.title)}</span>
      <span class="choice__sub">${esc(r.sub)}</span>
    </label>`).join("");

  /* ---------- selecting a role unlocks and re-labels the credential step ---------- */
  const userId = $("#userId");
  const password = $("#password");
  const submitBtn = $("#submitBtn");

  $("#roleChoices").addEventListener("change", (e) => {
    if (e.target.name !== "role") return;
    selected = ROLES.find((r) => r.id === e.target.value);

    $("#userIdLabel").textContent = selected.idLabel;
    $("#userIdHint").textContent = selected.hint;
    userId.placeholder = selected.placeholder;
    $("#credHint").textContent = "Signing in as " + selected.title.toLowerCase();

    [userId, password, submitBtn].forEach((el) => { el.disabled = false; });
    clearErrors();
    userId.focus();
  });

  /* ---------- validation ---------- */
  function setError(field, message) {
    const wrap = $("#" + field).closest(".field");
    const err = $("#" + field + "Err");
    wrap.classList.toggle("field--error", Boolean(message));
    err.textContent = message || "";
    err.hidden = !message;
    return !message;
  }

  function clearErrors() {
    setError("userId", "");
    setError("password", "");
    $("#loginError").hidden = true;
  }

  function validate() {
    let ok = true;
    const value = userId.value.trim();

    if (!value) {
      ok = setError("userId", "Enter your " + selected.idLabel.toLowerCase() + ".") && ok;
    } else if (selected.pattern && !selected.pattern.test(value)) {
      ok = setError("userId", selected.patternHelp) && ok;
    } else {
      setError("userId", "");
    }

    // Demo build: any non-empty password is accepted, but an empty one still
    // fails — an auth form that waves through a blank field teaches the wrong
    // thing to everyone who demos it.
    ok = setError("password", password.value ? "" : "Enter your password.") && ok;
    return ok;
  }

  [userId, password].forEach((el) =>
    el.addEventListener("input", () => { if (el.value) setError(el.id, ""); }));

  /* ---------- submit ---------- */
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!selected) { toast("Choose a role first", "warn"); return; }
    clearErrors();
    if (!validate()) return;

    // A known trainee ID deep-links to that record; anything else opens the
    // demo profile, so a reviewer typing a plausible ID still lands somewhere real.
    let target = selected.go;
    if (selected.id === "trainee") {
      const id = userId.value.trim().toUpperCase();
      const known = DB.trainees.some((t) => t.id === id);
      if (known) target = "trainee.html?id=" + encodeURIComponent(id);
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    setTimeout(() => {
      if (selected.id === "admin") toast("Second factor accepted — opening admin console");
      location.href = target;
    }, 450);
  });

  /* ---------- theme toggle ---------- */
  $("#themeBtn").addEventListener("click", UI.cycleTheme);
  UI.initDemoActions();
})();
