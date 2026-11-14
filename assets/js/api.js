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
        const d = body && body.detail;
        // pydantic validation errors arrive as a list of {loc, msg}
        const msg = Array.isArray(d) ? d.map((e) => e.loc[e.loc.length - 1] + ": " + e.msg).join("; ")
          : d || `Request failed (${res.status})`;
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
        ? request("/api/meta").then((r) => r.ok)
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

  const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body || {}) });

  global.API = {
    available, get, post, put, qs,
    health:        ()            => get("/api/meta"),
    logout:        ()            => post("/api/auth/logout"),
    saveOutcome:   (body)        => put("/api/trainee/outcome", body),
    saveResume:    (text)        => put("/api/trainee/resume", { text }),
    recommended:   ()            => get("/api/trainee/jobs"),
    apply:         (jobId)       => post(`/api/trainee/jobs/${jobId}/apply`),
    postJob:       (body)        => post("/api/employer/jobs", body),
    applicants:    (jobId)       => get(`/api/employer/jobs/${jobId}/applicants`),
    decide:        (appId, body) => post(`/api/employer/applications/${appId}`, body),
    decideClaim:   (uid, ok)     => post(`/api/employer/claims/${uid}`, { verified: ok }),
    verifyCompany: (id, ok)      => post(`/api/admin/companies/${id}`, { verified: ok }),
    verifyCert:    (uid, ok, note) => post(`/api/admin/trainees/${uid}/certificate`, { verified: ok, note }),
    addCourse:     (body)        => post("/api/admin/courses", body)
  };
})(window);
