/* ==========================================================================
   api.js — thin client for the FastAPI backend (backend/app)

   The dashboards read from DB (assets/js/data.js), which generates the cohort
   in the browser. The backend generates the *same* cohort from the same seed,
   so the two agree record for record — which means a page can submit a write to
   the API without the numbers on screen shifting underneath it.

   Every call degrades: opened from file://, or with the API down, `available()`
   resolves false and callers fall back to a local simulation so the journey
   still demonstrates end to end. Nothing here throws at the caller.
   ========================================================================== */
(function (global) {
  "use strict";

  const BASE = location.origin.startsWith("http") ? location.origin : "";
  const TIMEOUT = 4000;

  let probe = null;   // cached availability check — one per page load

  async function request(path, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(BASE + path, Object.assign({
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" }
      }, options));
      const body = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok) {
        // FastAPI puts the human-readable message in `detail`.
        const msg = body && body.detail ? body.detail : `Request failed (${res.status})`;
        return { ok: false, status: res.status, error: msg };
      }
      return { ok: true, status: res.status, data: body };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err.name === "AbortError" ? "The server took too long to respond." : "Could not reach the server.",
        offline: true
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** True when the API answers /api/health. Cached for the life of the page. */
  function available() {
    if (!probe) {
      probe = BASE
        ? request("/api/health").then((r) => r.ok)
        : Promise.resolve(false);
    }
    return probe;
  }

  const get  = (path) => request(path);
  const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body || {}) });

  /** Build a query string from a filter object, dropping empties and "all". */
  function qs(filters) {
    const p = new URLSearchParams();
    Object.keys(filters || {}).forEach((k) => {
      const v = filters[k];
      if (v != null && v !== "" && v !== "all") p.set(k, v);
    });
    const s = p.toString();
    return s ? "?" + s : "";
  }

  global.API = {
    available, get, post, qs,
    health:        ()            => get("/api/health"),
    summary:       (f)           => get("/api/analytics/summary" + qs(f)),
    breakdown:     (dim, f)      => get("/api/analytics/breakdown/" + dim + qs(f)),
    insights:      (f)           => get("/api/analytics/roi" + qs(f)),
    submitSurvey:  (id, answer)  => post(`/api/portal/${encodeURIComponent(id)}/survey`, answer),
    decideVerify:  (id, verdict) => post(`/api/employers/verifications/${encodeURIComponent(id)}`, verdict),
    resolveFlag:   (id, body)    => post(`/api/admin/validation-queue/${encodeURIComponent(id)}`, body)
  };
})(window);
