/* ==========================================================================
   charts.js — dependency-free SVG chart primitives
   --------------------------------------------------------------------------
   Forms: donut, barV, barH, stackedBarV, line/area, sparkline, heatstrip.
   Every form ships a hover tooltip; every multi-series form ships a legend.
   Charts re-render on container resize.
   ========================================================================== */
(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  };
  const fmtDefault = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : v);

  /* ---------- shared tooltip ---------- */
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "viz-tooltip";
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(evt, html) {
    const t = tooltip();
    t.innerHTML = html;
    const pad = 12;
    let x = evt.clientX, y = evt.clientY - pad;
    t.style.opacity = "1";
    const r = t.getBoundingClientRect();
    if (x - r.width / 2 < 4) x = r.width / 2 + 4;
    if (x + r.width / 2 > innerWidth - 4) x = innerWidth - r.width / 2 - 4;
    if (y - r.height < 4) y = evt.clientY + r.height + pad;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.style.opacity = "0"; }
  const row = (color, label, value) =>
    `<div class="tt__row"><span style="display:flex;align-items:center;gap:7px">` +
    (color ? `<i class="tt__sw" style="background:${color}"></i>` : "") +
    `${label}</span><span>${value}</span></div>`;

  /* ---------- geometry helpers ---------- */
  function roundedTop(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h}L${x},${y + r}Q${x},${y} ${x + r},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h}Z`;
  }
  function roundedRight(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w, h / 2));
    return `M${x},${y}L${x + w - r},${y}Q${x + w},${y} ${x + w},${y + r}L${x + w},${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}L${x},${y + h}Z`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }
  function ticks(max, count) {
    const out = [];
    for (let i = 0; i <= count; i++) out.push((max / count) * i);
    return out;
  }

  /* ---------- render harness: measure + redraw on resize ---------- */
  const observed = new WeakMap();
  function mount(node, draw) {
    if (!node) return;
    const run = () => {
      const w = node.clientWidth || node.parentElement?.clientWidth || 640;
      if (!w) return;
      node.innerHTML = "";
      const svg = draw(Math.max(220, w));
      if (svg) node.appendChild(svg);
    };
    run();
    if (!observed.has(node) && typeof ResizeObserver !== "undefined") {
      let t = null, last = node.clientWidth;
      const ro = new ResizeObserver(() => {
        if (Math.abs(node.clientWidth - last) < 8) return;
        last = node.clientWidth;
        clearTimeout(t); t = setTimeout(run, 80);
      });
      ro.observe(node);
      observed.set(node, ro);
    }
    node.__redraw = run;
  }

  /* ======================================================================
     Donut — part-to-whole, ≤ 5 slices. Hero value in the hole.
     opts: { items:[{label,value,color}], centerLabel, centerValue, height }
     ====================================================================== */
  function donut(node, opts) {
    mount(node, (W) => {
      const H = opts.height || 220;
      const size = Math.min(W, H);
      const cx = W / 2, cy = H / 2;
      const R = size / 2 - 6, r = R * 0.62;
      const total = opts.items.reduce((s, d) => s + d.value, 0) || 1;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" });

      let a0 = -Math.PI / 2;
      const gap = 0.012;
      opts.items.forEach((d) => {
        const frac = d.value / total;
        const a1 = a0 + frac * Math.PI * 2;
        const s = a0 + (frac > 0.02 ? gap : 0), e = a1 - (frac > 0.02 ? gap : 0);
        const large = e - s > Math.PI ? 1 : 0;
        const p = el("path", {
          class: "mark",
          d: `M${cx + R * Math.cos(s)},${cy + R * Math.sin(s)}` +
             `A${R},${R} 0 ${large} 1 ${cx + R * Math.cos(e)},${cy + R * Math.sin(e)}` +
             `L${cx + r * Math.cos(e)},${cy + r * Math.sin(e)}` +
             `A${r},${r} 0 ${large} 0 ${cx + r * Math.cos(s)},${cy + r * Math.sin(s)}Z`,
          fill: d.color, stroke: "var(--surface-1)", "stroke-width": 2
        });
        p.addEventListener("mousemove", (ev) => showTip(ev,
          `<div class="tt__title">${d.label}</div>` +
          row(d.color, "Trainees", (opts.format || fmtDefault)(d.value)) +
          row(null, "Share", (frac * 100).toFixed(1) + "%")));
        p.addEventListener("mouseleave", hideTip);
        svg.appendChild(p);
        a0 = a1;
      });

      if (opts.centerValue != null) {
        svg.appendChild(Object.assign(el("text", {
          x: cx, y: cy - 2, "text-anchor": "middle", fill: "var(--text-primary)",
          "font-size": Math.round(size * 0.155), "font-weight": 700
        }), { textContent: opts.centerValue }));
      }
      if (opts.centerLabel) {
        svg.appendChild(Object.assign(el("text", {
          x: cx, y: cy + 16, "text-anchor": "middle", fill: "var(--text-muted)", "font-size": 11.5
        }), { textContent: opts.centerLabel }));
      }
      return svg;
    });
  }

  /* ======================================================================
     Vertical bars (single series). opts: { items:[{label,value}], color,
     format, height, valueLabels, rotate }
     ====================================================================== */
  function barV(node, opts) {
    mount(node, (W) => {
      const H = opts.height || 240;
      const rotate = opts.rotate ?? (opts.items.length > 6);
      const padB = rotate ? 58 : 30, padL = 46, padT = 16, padR = 8;
      const fmt = opts.format || fmtDefault;
      const max = niceMax(Math.max(...opts.items.map((d) => d.value), 1));
      const pw = W - padL - padR, ph = H - padT - padB;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      ticks(max, 4).forEach((t) => {
        const y = padT + ph - (t / max) * ph;
        svg.appendChild(el("line", { class: "grid-line", x1: padL, x2: W - padR, y1: y, y2: y }));
        svg.appendChild(Object.assign(el("text", {
          class: "axis-label", x: padL - 8, y: y + 4, "text-anchor": "end"
        }), { textContent: opts.tickFormat ? opts.tickFormat(t) : fmt(Math.round(t)) }));
      });

      const slot = pw / opts.items.length;
      const bw = Math.min(46, slot * 0.62);
      opts.items.forEach((d, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const h = Math.max(1, (d.value / max) * ph);
        const y = padT + ph - h;
        const color = d.color || opts.color || "var(--series-1)";
        const p = el("path", { class: "mark", d: roundedTop(x, y, bw, h, 4), fill: color });
        p.addEventListener("mousemove", (ev) => showTip(ev,
          `<div class="tt__title">${d.label}</div>` +
          row(color, opts.valueName || "Value", fmt(d.value)) +
          (d.note ? row(null, d.noteLabel || "n", d.note) : "")));
        p.addEventListener("mouseleave", hideTip);
        svg.appendChild(p);

        if (opts.valueLabels) {
          svg.appendChild(Object.assign(el("text", {
            class: "val-label", x: x + bw / 2, y: y - 6, "text-anchor": "middle"
          }), { textContent: fmt(d.value) }));
        }
        const label = el("text", {
          class: "axis-label", x: rotate ? 0 : x + bw / 2, y: rotate ? 0 : H - padB + 16,
          "text-anchor": rotate ? "end" : "middle",
          transform: rotate ? `translate(${x + bw / 2 + 4}, ${H - padB + 12}) rotate(-38)` : null
        });
        label.textContent = d.label;
        svg.appendChild(label);
      });
      svg.appendChild(el("line", { class: "baseline", x1: padL, x2: W - padR, y1: padT + ph, y2: padT + ph }));
      return svg;
    });
  }

  /* ======================================================================
     Horizontal bars — long category labels, ranked magnitude.
     ====================================================================== */
  function barH(node, opts) {
    mount(node, (W) => {
      const items = opts.items;
      const rowH = opts.rowHeight || 30;
      const H = items.length * rowH + 18;
      const labelW = Math.min(opts.labelWidth || 190, W * 0.46);
      const padR = 54;
      const fmt = opts.format || fmtDefault;
      const max = Math.max(...items.map((d) => d.value), 1);
      const pw = W - labelW - padR;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      items.forEach((d, i) => {
        const y = 8 + i * rowH;
        const bh = Math.min(16, rowH - 12);
        const w = Math.max(2, (d.value / max) * pw);
        const color = d.color || opts.color || "var(--series-1)";

        const lbl = el("text", { class: "axis-label", x: labelW - 10, y: y + bh / 2 + 4, "text-anchor": "end", fill: "var(--text-secondary)" });
        lbl.textContent = d.label;
        svg.appendChild(lbl);

        svg.appendChild(el("rect", { x: labelW, y: y, width: pw, height: bh, rx: 4, fill: "var(--surface-3)" }));
        const p = el("path", { class: "mark", d: roundedRight(labelW, y, w, bh, 4), fill: color });
        p.addEventListener("mousemove", (ev) => showTip(ev,
          `<div class="tt__title">${d.label}</div>` +
          row(color, opts.valueName || "Value", fmt(d.value)) +
          (d.pct != null ? row(null, "Share", d.pct.toFixed(1) + "%") : "")));
        p.addEventListener("mouseleave", hideTip);
        svg.appendChild(p);

        const v = el("text", { class: "val-label", x: labelW + pw + 8, y: y + bh / 2 + 4 });
        v.textContent = opts.endLabel ? opts.endLabel(d) : fmt(d.value);
        svg.appendChild(v);
      });
      return svg;
    });
  }

  /* ======================================================================
     Stacked vertical bars — composition across groups.
     opts: { groups:[{label, parts:[{name,value,color}]}], format, height, pct }
     ====================================================================== */
  function stackedBarV(node, opts) {
    mount(node, (W) => {
      const H = opts.height || 250;
      const padB = 34, padL = 44, padT = 14, padR = 8;
      const fmt = opts.format || fmtDefault;
      const totals = opts.groups.map((g) => g.parts.reduce((s, p) => s + p.value, 0));
      const max = opts.pct ? 100 : niceMax(Math.max(...totals, 1));
      const pw = W - padL - padR, ph = H - padT - padB;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      ticks(max, 4).forEach((t) => {
        const y = padT + ph - (t / max) * ph;
        svg.appendChild(el("line", { class: "grid-line", x1: padL, x2: W - padR, y1: y, y2: y }));
        svg.appendChild(Object.assign(el("text", { class: "axis-label", x: padL - 8, y: y + 4, "text-anchor": "end" }),
          { textContent: opts.pct ? Math.round(t) + "%" : fmt(Math.round(t)) }));
      });

      const slot = pw / opts.groups.length;
      const bw = Math.min(54, slot * 0.6);
      opts.groups.forEach((g, i) => {
        const total = totals[i] || 1;
        const x = padL + slot * i + (slot - bw) / 2;
        let acc = 0;
        g.parts.forEach((p) => {
          const val = opts.pct ? (p.value / total) * 100 : p.value;
          const h = (val / max) * ph;
          if (h <= 0) return;
          const y = padT + ph - (acc + val) / max * ph;
          const seg = el("rect", {
            class: "mark", x: x, y: y, width: bw, height: Math.max(1, h - 2), rx: 2, fill: p.color
          });
          seg.addEventListener("mousemove", (ev) => showTip(ev,
            `<div class="tt__title">${g.label}</div>` +
            g.parts.map((q) => row(q.color, q.name,
              fmt(q.value) + (total ? ` · ${((q.value / total) * 100).toFixed(0)}%` : ""))).join("")));
          seg.addEventListener("mouseleave", hideTip);
          svg.appendChild(seg);
          acc += val;
        });
        const lb = el("text", { class: "axis-label", x: x + bw / 2, y: H - padB + 17, "text-anchor": "middle" });
        lb.textContent = g.label;
        svg.appendChild(lb);
      });
      svg.appendChild(el("line", { class: "baseline", x1: padL, x2: W - padR, y1: padT + ph, y2: padT + ph }));
      return svg;
    });
  }

  /* ======================================================================
     Line / area — change over time. Crosshair tooltip across all series.
     opts: { xLabels:[], series:[{name,color,values:[],dashed}], format,
             height, area, yMax, yMin, valueLabels }
     ====================================================================== */
  function line(node, opts) {
    mount(node, (W) => {
      const H = opts.height || 250;
      const padB = 32, padL = opts.padLeft || 52, padT = 18, padR = 14;
      const fmt = opts.format || fmtDefault;
      const all = opts.series.flatMap((s) => s.values.filter((v) => v != null));
      const yMax = opts.yMax != null ? opts.yMax : niceMax(Math.max(...all, 1) * 1.08);
      const yMin = opts.yMin != null ? opts.yMin : 0;
      const pw = W - padL - padR, ph = H - padT - padB;
      const n = opts.xLabels.length;
      const X = (i) => padL + (n === 1 ? pw / 2 : (pw / (n - 1)) * i);
      const Y = (v) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      ticks(yMax - yMin, 4).forEach((t) => {
        const v = yMin + t, y = Y(v);
        svg.appendChild(el("line", { class: "grid-line", x1: padL, x2: W - padR, y1: y, y2: y }));
        svg.appendChild(Object.assign(el("text", { class: "axis-label", x: padL - 8, y: y + 4, "text-anchor": "end" }),
          { textContent: opts.tickFormat ? opts.tickFormat(v) : fmt(Math.round(v)) }));
      });
      opts.xLabels.forEach((l, i) => {
        svg.appendChild(Object.assign(el("text", { class: "axis-label", x: X(i), y: H - padB + 17, "text-anchor": "middle" }),
          { textContent: l }));
      });

      const crosshair = el("line", { class: "baseline", y1: padT, y2: padT + ph, opacity: 0, stroke: "var(--text-muted)", "stroke-dasharray": "3 3" });
      svg.appendChild(crosshair);

      opts.series.forEach((s) => {
        const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
        if (!pts.length) return;
        const d = pts.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join("");
        if (opts.area) {
          svg.appendChild(el("path", {
            d: d + `L${pts[pts.length - 1][0]},${padT + ph}L${pts[0][0]},${padT + ph}Z`,
            fill: s.color, opacity: 0.10
          }));
        }
        svg.appendChild(el("path", {
          d, fill: "none", stroke: s.color, "stroke-width": 2,
          "stroke-linecap": "round", "stroke-linejoin": "round",
          "stroke-dasharray": s.dashed ? "5 4" : null
        }));
        pts.forEach((p) => {
          svg.appendChild(el("circle", { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2 }));
        });
      });

      if (opts.valueLabels) {
        opts.series.forEach((s) => s.values.forEach((v, i) => {
          if (v == null) return;
          svg.appendChild(Object.assign(el("text", { class: "val-label", x: X(i), y: Y(v) - 11, "text-anchor": "middle" }),
            { textContent: fmt(v) }));
        }));
      }

      const hit = el("rect", { x: padL, y: padT, width: pw, height: ph, fill: "transparent" });
      hit.addEventListener("mousemove", (ev) => {
        const r = svg.getBoundingClientRect();
        const rel = (ev.clientX - r.left) * (W / r.width);
        let i = Math.round(((rel - padL) / pw) * (n - 1));
        i = Math.max(0, Math.min(n - 1, i));
        crosshair.setAttribute("x1", X(i)); crosshair.setAttribute("x2", X(i));
        crosshair.setAttribute("opacity", 1);
        showTip(ev, `<div class="tt__title">${opts.xLabels[i]}</div>` +
          opts.series.map((s) => s.values[i] == null ? "" : row(s.color, s.name, fmt(s.values[i]))).join(""));
      });
      hit.addEventListener("mouseleave", () => { crosshair.setAttribute("opacity", 0); hideTip(); });
      svg.appendChild(hit);
      svg.appendChild(el("line", { class: "baseline", x1: padL, x2: W - padR, y1: padT + ph, y2: padT + ph }));
      return svg;
    });
  }

  /* ======================================================================
     Sparkline — trend inside a stat tile. No axes, no tooltip.
     ====================================================================== */
  function sparkline(node, values, color) {
    mount(node, (W) => {
      const H = 34, pad = 3;
      const max = Math.max(...values), min = Math.min(...values);
      const span = max - min || 1;
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });
      const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((v - min) / span) * (H - pad * 2)]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join("");
      svg.appendChild(el("path", { d: d + `L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z`, fill: color, opacity: .12 }));
      svg.appendChild(el("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round" }));
      const last = pts[pts.length - 1];
      svg.appendChild(el("circle", { cx: last[0], cy: last[1], r: 3, fill: color }));
      return svg;
    });
  }

  /* ======================================================================
     Heat strip — one sequential-blue cell per bucket (district × metric).
     opts: { rows:[{label, cells:[{label,value}]}], colLabels, format }
     ====================================================================== */
  function heatstrip(node, opts) {
    mount(node, (W) => {
      const rows = opts.rows, cols = opts.colLabels.length;
      const labelW = Math.min(opts.labelWidth || 130, W * 0.34);
      const rowH = 30, headH = 24;
      const H = rows.length * rowH + headH + 6;
      const cw = (W - labelW - 4) / cols;
      const all = rows.flatMap((r) => r.cells.map((c) => c.value));
      const max = Math.max(...all, 1), min = Math.min(...all, 0);
      const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
      const svg = el("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      opts.colLabels.forEach((c, j) => {
        svg.appendChild(Object.assign(el("text", { class: "axis-label", x: labelW + cw * j + cw / 2, y: 15, "text-anchor": "middle" }),
          { textContent: c }));
      });
      rows.forEach((r, i) => {
        const y = headH + i * rowH;
        svg.appendChild(Object.assign(el("text", { class: "axis-label", x: labelW - 10, y: y + 19, "text-anchor": "end", fill: "var(--text-secondary)" }),
          { textContent: r.label }));
        r.cells.forEach((c, j) => {
          const t = (c.value - min) / (max - min || 1);
          const color = ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
          const cell = el("rect", {
            class: "mark", x: labelW + cw * j + 1, y: y + 2, width: cw - 3, height: rowH - 5,
            rx: 4, fill: color
          });
          cell.addEventListener("mousemove", (ev) => showTip(ev,
            `<div class="tt__title">${r.label} · ${opts.colLabels[j]}</div>` +
            row(color, c.label || "Value", (opts.format || fmtDefault)(c.value))));
          cell.addEventListener("mouseleave", hideTip);
          svg.appendChild(cell);
          const txt = el("text", {
            x: labelW + cw * j + cw / 2, y: y + 19, "text-anchor": "middle",
            "font-size": 11, "font-weight": 600, fill: t > 0.62 ? "#fff" : "#0b0b0b"
          });
          txt.textContent = (opts.cellText || ((c) => Math.round(c.value)))(c);
          svg.appendChild(txt);
        });
      });
      return svg;
    });
  }

  /* ---------- legend (identity is never color-alone) ---------- */
  function legend(node, items) {
    if (!node) return;
    node.className = "legend";
    node.innerHTML = items.map((i) =>
      `<span class="legend__item"><i class="legend__swatch" style="background:${i.color}"></i>${i.label}` +
      (i.value != null ? ` <b class="tnum">${i.value}</b>` : "") + `</span>`).join("");
  }

  global.Viz = { donut, barV, barH, stackedBarV, line, sparkline, heatstrip, legend, niceMax };
})(window);
