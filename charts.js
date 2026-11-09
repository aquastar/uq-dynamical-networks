// Every figure in the deck, built as a sequence of "beats": each arrow press reveals one more idea on the same
// figure, with one caption line. A renderer is R.<name>(el, D) and returns { steps: N, show(k), caps: [...] }.
// show(k) must be idempotent: it draws the full state for beat k, so stepping backwards works too.
window.Charts = (function () {
  // The colour contract, used on every figure: blue = our estimate (a band, a posterior, a plan), red = the truth,
  // orange = the check or a warning, grey = the naive baseline, ink = fixed facts (observations, patient zero),
  // light / red / amber = susceptible / infectious / recovered. Roles are shapes (circle, square, diamond, triangle)
  // with a colour each, so nothing on the ward depends on telling green from orange.
  const C = { ink: "#1B2430", muted: "#5B6473", line: "#E3E0D8", blue: "#2563EB", blueSoft: "#E8EEFC", orange: "#EA580C", orangeSoft: "#FDEBE0", red: "#DC2626", green: "#16A34A", grey: "#9CA3AF", light: "#E5E7EB", amber: "#F59E0B" };
  const SYM = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle];
  const symPath = (role, r) => d3.symbol().type(SYM[role]).size(Math.PI * r * r)();
  const R = {};
  const fmtPct = v => Math.round(100 * v) + "%";
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const IMG = n => (R.IMG && R.IMG[n]) || ("img/" + n);   // images live in img/; the self-contained artifact inlines them as data URIs
  const svgIn = (parent, w, h) => d3.select(parent).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");
  const reduce = () => !!R.PRINT || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.2,.8,.2,1)";
  const F = { disp: "'Bricolage Grotesque', 'Source Sans 3', sans-serif" };

  // ---------- layers: a <g> that can be revealed with a draw-in, or hidden ----------
  const cssAnim = (node, props, delay, ms) => {
    node.style.transition = "none"; for (const [k, v0] of props) node.style[k] = v0; void node.getBoundingClientRect();
    node.style.transition = props.map(([k]) => `${k} ${ms}ms ${EASE} ${delay}ms`).join(",");
    setTimeout(() => { for (const [k, , v1] of props) node.style[k] = v1; }, 20);
    setTimeout(() => { node.style.transition = ""; for (const [k] of props) node.style[k] = ""; }, delay + ms + 80);
  };
  const drawIn = (g) => {
    if (reduce()) return;
    g.querySelectorAll("path").forEach(p => { const f = p.getAttribute("fill"); if ((f === "none" || f === null) && p.getAttribute("stroke") && !p.getAttribute("stroke-dasharray") && p.getTotalLength) { const L = p.getTotalLength(); if (L) cssAnim(p, [["strokeDasharray", `${L}px ${L}px`, `${L}px ${L}px`], ["strokeDashoffset", L + "px", "0px"]], 0, 500); } else if (f && f !== "none") { const o = p.getAttribute("opacity"); cssAnim(p, [["opacity", "0", o == null ? "1" : o]], 0, 500); } });
    let i = 0; g.querySelectorAll("circle").forEach(c => { const r = c.getAttribute("r"); if (!+r || c.getAttribute("fill") === "none") return; cssAnim(c, [["r", "0px", r + "px"]], Math.min(600, (i++) * 5), 420); });
    g.querySelectorAll("rect.bar").forEach(rc => { const h = +rc.getAttribute("height"), y = +rc.getAttribute("y"); if (!h) return; cssAnim(rc, [["y", (y + h) + "px", y + "px"], ["height", "0px", h + "px"]], 0, 500); });
    g.querySelectorAll("line.draw").forEach(l => { const L = Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value); cssAnim(l, [["strokeDasharray", `${L}px ${L}px`, `${L}px ${L}px`], ["strokeDashoffset", L + "px", "0px"]], 0, 500); });
    g.querySelectorAll("text").forEach(t => cssAnim(t, [["opacity", "0", "1"]], 150, 500));
  };
  function Layers(svg) {
    const list = [];
    return {
      add: () => { const g = svg.append("g").style("opacity", 0); list.push({ g, shown: false }); return g; },
      show: (pred) => list.forEach((L, i) => { const on = typeof pred === "function" ? pred(i) : i < pred; if (on && !L.shown) { L.g.style("opacity", 1); drawIn(L.g.node()); } else if (!on && L.shown) { L.g.style("opacity", 0); } L.shown = on; }),
    };
  }

  // ---------- the ward ----------
  const WARD_ASPECT = 1.6;
  function ward(parent, opt = {}) {
    const W = Sim.W, N = Sim.N, w = opt.w || 900, h = opt.h || 600, r = opt.r || 9, pad = opt.pad || 34, padT = opt.padT ?? 48, padB = opt.padB ?? 56;
    const svg = svgIn(parent, w, h);
    // every ward is drawn in the same 1.6:1 box, fitted inside the space available and centred, so it is never squashed
    const aw = w - 2 * pad, ah = h - padT - padB, bw = Math.min(aw, ah * WARD_ASPECT), bh = bw / WARD_ASPECT, ox = pad + (aw - bw) / 2, oy = padT + (ah - bh) / 2;
    const P = i => [ox + W.pos[i][0] * bw, oy + W.pos[i][1] * bh];
    const eg = svg.append("g").attr("stroke", C.grey).attr("stroke-opacity", .5).attr("stroke-width", 1.4);
    eg.selectAll("line").data(W.edges).join("line").attr("x1", d => P(d[0])[0]).attr("y1", d => P(d[0])[1]).attr("x2", d => P(d[1])[0]).attr("y2", d => P(d[1])[1]);
    const extra = svg.append("g");
    const ng = svg.append("g");
    const maxDeg = d3.max(Sim.deg); const rad = i => r * (0.85 + 0.45 * Sim.deg[i] / maxDeg);   // hubs slightly larger
    const nodes = ng.selectAll("path").data(d3.range(N)).join("path").attr("class", "node").attr("transform", i => `translate(${P(i)[0]},${P(i)[1]})`).attr("d", i => symPath(W.roles[i], rad(i))).attr("fill", i => Sim.ROLE[W.roles[i]]).attr("stroke", "#fff").attr("stroke-width", 1.6);
    const rings = svg.append("g"), labels = svg.append("g");
    const api = { svg, P, nodes, extra, edges: eg, rings, labels, w, h, box: { x: ox, y: oy, w: bw, h: bh }, rad };
    api.state = s => nodes.attr("fill", i => s ? Sim.STATE[s[i]] : Sim.ROLE[W.roles[i]]);
    api.size = fn => nodes.attr("d", i => symPath(W.roles[i], fn ? fn(i) : rad(i)));
    api.ring = (set, col = C.ink, rr = r + 6, width = 3, dash = null) => { rings.selectAll("circle").data([...set]).join("circle").attr("cx", i => P(i)[0]).attr("cy", i => P(i)[1]).attr("r", rr).attr("fill", "none").attr("stroke", col).attr("stroke-width", width).attr("stroke-dasharray", dash); };
    // items: [colour, label, hollow?, role] (a role draws that role's shape)
    api.legend = (items, x = null, y = h - 8) => { const g = svg.append("g").attr("transform", `translate(${x == null ? ox : x},${y})`); let xx = 0; for (const [col, lab, stroke, role] of items) { if (role != null) g.append("path").attr("transform", `translate(${xx + 7},-6)`).attr("d", symPath(role, 7.5)).attr("fill", col); else g.append("circle").attr("cx", xx + 7).attr("cy", -6).attr("r", 7).attr("fill", stroke ? "#fff" : col).attr("stroke", stroke ? col : "none").attr("stroke-width", 3); g.append("text").attr("x", xx + 20).attr("y", 0).attr("font-size", 18).attr("fill", C.muted).text(lab); xx += 38 + lab.length * 9.5; } return g; };
    return api;
  }
  const roleLegend = [[Sim.ROLE[0], "patient", false, 0], [Sim.ROLE[1], "nurse", false, 1], [Sim.ROLE[2], "doctor", false, 2], [Sim.ROLE[3], "admin", false, 3]];
  const stateLegend = [[C.light, "never infected"], [C.red, "infectious"], [C.amber, "recovered"]];

  // ---------- chart helpers ----------
  function frame(parent, w, h, m = { l: 66, r: 24, t: 24, b: 56 }) {
    const svg = svgIn(parent, w, h); const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    return { svg, g, iw: w - m.l - m.r, ih: h - m.t - m.b, m, w, h };
  }
  function axes(f, x, y, xl, yl, opt = {}) {
    const gx = f.g.append("g").attr("class", "ax-x").attr("transform", `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(opt.xt || 8).tickSize(-f.ih).tickPadding(10));
    const gy = f.g.append("g").attr("class", "ax-y").call(d3.axisLeft(y).ticks(opt.yt || 5).tickSize(-f.iw).tickPadding(10));
    if (opt.noY) gy.remove();
    for (const a of [gx, gy]) { a.select(".domain").remove(); a.selectAll("line").attr("stroke", C.line); a.selectAll("text").attr("fill", C.muted).attr("font-size", 18); }
    if (xl) f.g.append("text").attr("x", f.iw / 2).attr("y", f.ih + 48).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text(xl);
    if (yl) f.g.append("text").attr("transform", "rotate(-90)").attr("x", -f.ih / 2).attr("y", -50).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text(yl);
  }
  // a big annotation on a chart: a short line and a label (multi-line with \n)
  const note = (g, x, y, text, dx, dy, col = C.ink, size = 21) => { const n = g.append("g"); n.append("line").attr("class", "draw").attr("x1", x).attr("y1", y).attr("x2", x + dx).attr("y2", y + dy).attr("stroke", col).attr("stroke-width", 1.6); const ax = x + dx + (dx >= 0 ? 8 : -8); const t = n.append("text").attr("x", ax).attr("y", y + dy + 7).attr("text-anchor", dx >= 0 ? "start" : "end").attr("font-size", size).attr("font-weight", 600).attr("fill", col); String(text).split("\n").forEach((line, i) => t.append("tspan").attr("x", ax).attr("dy", i ? 25 : 0).text(line)); return n; };
  const box = (g, x, y, w, title, lines, col = C.orange, bg = C.orangeSoft) => { const b = g.append("g").attr("transform", `translate(${x},${y})`); b.append("rect").attr("width", w).attr("height", 40 + 28 * lines.length).attr("rx", 12).attr("fill", bg); b.append("text").attr("x", 16).attr("y", 26).attr("font-size", 16).attr("fill", col).attr("font-weight", 600).attr("letter-spacing", 1.5).text(title); lines.forEach((ln, i) => b.append("text").attr("x", 16).attr("y", 56 + 28 * i).attr("font-size", 20).attr("fill", C.ink).text(ln)); return b; };
  const legend = (f, items, x = 8, y = 6) => { const g = f.g.append("g").attr("transform", `translate(${x},${y})`); items.forEach(([col, lab, kind, role], i) => { const gg = g.append("g").attr("transform", `translate(0,${i * 26})`); if (role != null) gg.append("path").attr("transform", "translate(13,9)").attr("d", symPath(role, 7)).attr("fill", col); else if (kind === "band") gg.append("rect").attr("width", 26).attr("height", 14).attr("y", 2).attr("fill", col).attr("opacity", .35); else if (kind === "dot") gg.append("circle").attr("cx", 13).attr("cy", 9).attr("r", 6).attr("fill", col); else gg.append("line").attr("x1", 0).attr("x2", 26).attr("y1", 9).attr("y2", 9).attr("stroke", col).attr("stroke-width", 3.5).attr("stroke-dasharray", kind === "dash" ? "7 5" : null); gg.append("text").attr("x", 36).attr("y", 15).attr("font-size", 18).attr("fill", C.ink).text(lab); }); return g; };
  function bars(g, vals, x, y, opt = {}) {
    const bins = d3.bin().domain(x.domain()).thresholds(opt.bins || 38)(vals);
    const ymax = opt.ymax || d3.max(bins, b => b.length) || 1; y.domain([0, ymax]);
    g.selectAll("rect.bar").data(bins).join("rect").attr("class", "bar").attr("x", b => x(b.x0) + 1).attr("width", b => Math.max(1, x(b.x1) - x(b.x0) - 2)).attr("y", b => y(b.length)).attr("height", b => y(0) - y(b.length)).attr("fill", opt.color || C.blue).attr("rx", 2);
    return bins;
  }
  const controls = (parent) => { const c = el("div", "ctl"); parent.appendChild(c); return c; };
  const button = (c, label, fn, ghost) => { const b = el("button", ghost ? "ghost" : "", label); b.addEventListener("click", fn); c.appendChild(b); return b; };
  const slider = (c, label, min, max, step, val, fn, fmt = v => v) => { const l = el("label", "", `${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${val}"> <span class="val">${fmt(val)}</span>`); c.appendChild(l); const inp = l.querySelector("input"), out = l.querySelector(".val"); inp.addEventListener("input", () => { out.textContent = fmt(+inp.value); fn(+inp.value); }); return inp; };
  const stats = (parent, keys) => { const s = el("div", "stats"); parent.appendChild(s); const o = {}; for (const [k, lab] of keys) { const d = el("div", "stat", `<b>–</b><span>${lab}</span>`); s.appendChild(d); o[k] = d.querySelector("b"); } return o; };
  const lineY = (g, x, y, d, col, w = 3) => g.append("path").datum(d).attr("fill", "none").attr("stroke", col).attr("stroke-width", w).attr("stroke-linejoin", "round").attr("d", d3.line().x((v, i) => x(i)).y(v => y(v)));
  const bandY = (g, x, y, lo, hi, col, op = .22) => g.append("path").datum(d3.range(lo.length)).attr("fill", col).attr("opacity", op).attr("d", d3.area().x(i => x(i)).y0(i => y(lo[i])).y1(i => y(hi[i])));
  const T = f => `translate(${f.m.l},${f.m.t})`;

  // =====================================================================
  // 0 · the ward
  R.ward = (e, D) => {
    const w = ward(e, { w: 1300, h: 640, r: 10 }); const L = Layers(w.svg); const svg = w.svg;
    w.edges.style("opacity", 0); w.nodes.style("opacity", 0);
    const l3 = L.add(); const [sx, sy] = w.P(Sim.W.src);
    l3.append("circle").attr("cx", sx).attr("cy", sy).attr("r", 17).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 3);
    note(l3, sx, sy, "patient zero:\na patient with 4 contacts", 30, 160);
    w.legend(roleLegend, null, 634); const legend = w.svg.select("g:last-of-type");
    // where the ward is: a map with the dot on Lyon and a photograph of the city, large on the first beat, then tucked into the
    // margins either side of the ward (the ward box is 858 wide in a 1300 frame, so each margin is 221) where they stay, in print too
    const G = D.geo, MW = 560, MH = 520, PW = 1100, PH = 736, XW = 900, XH = 639, uid = "w" + Math.random().toString(36).slice(2, 7);
    const clip = (id, cw, ch) => svg.append("clipPath").attr("id", id).append("rect").attr("width", cw).attr("height", ch).attr("rx", 14);
    clip(uid + "m", MW, MH); clip(uid + "p", PW, PH); clip(uid + "x", XW, XH);
    const gMap = svg.append("g"); const mapIn = gMap.append("g").attr("clip-path", `url(#${uid}m)`);
    mapIn.append("rect").attr("width", MW).attr("height", MH).attr("fill", "#E6EEF7");
    const proj = d3.geoMercator().fitExtent([[0, 0], [MW, MH]], { type: "MultiPoint", coordinates: [[-5.4, 42.2], [9.8, 42.2], [9.8, 51.3], [-5.4, 51.3]] }); const gp = d3.geoPath(proj);
    mapIn.append("g").selectAll("path").data(G.features).join("path").attr("d", gp).attr("fill", d => d.properties.name === "France" ? "#FFFFFF" : "#F1EFE9").attr("stroke", "#C3C9D3").attr("stroke-width", 1).style("vector-effect", "non-scaling-stroke");
    gMap.append("rect").attr("width", MW).attr("height", MH).attr("rx", 14).attr("fill", "none").attr("stroke", "#C9CDD6").style("vector-effect", "non-scaling-stroke");
    const [px, py] = proj([2.3522, 48.8566]); const paris = gMap.append("g"); paris.append("circle").attr("r", 4).attr("fill", C.muted); paris.append("text").attr("x", 9).attr("y", 6).attr("font-size", 18).attr("fill", C.muted).text("Paris");
    const [lx, ly] = proj(G.lyon); const mark = gMap.append("g");
    if (!reduce()) { const ring = mark.append("circle").attr("r", 9).attr("fill", "none").attr("stroke", C.red).attr("stroke-width", 3); ring.append("animate").attr("attributeName", "r").attr("values", "9;34").attr("dur", "1.8s").attr("repeatCount", "indefinite"); ring.append("animate").attr("attributeName", "opacity").attr("values", "1;0").attr("dur", "1.8s").attr("repeatCount", "indefinite"); }
    mark.append("circle").attr("r", 9).attr("fill", C.red).attr("stroke", "#fff").attr("stroke-width", 3); mark.append("text").attr("x", 16).attr("y", 9).attr("font-size", 26).attr("font-weight", 700).attr("fill", C.ink).attr("font-family", F.disp).text("Lyon");
    const gPh = svg.append("g"); gPh.append("image").attr("href", IMG("lyon.jpg")).attr("width", PW).attr("height", PH).attr("clip-path", `url(#${uid}p)`);
    const gX = svg.append("g").style("opacity", 0); gX.append("image").attr("href", IMG("vanhems_fig1_counts.png")).attr("width", XW).attr("height", XH).attr("clip-path", `url(#${uid}x)`); gX.append("rect").attr("width", XW).attr("height", XH).attr("rx", 14).attr("fill", "none").attr("stroke", "#C9CDD6").style("vector-effect", "non-scaling-stroke");
    const lines = (g, x, y, size, arr, col = C.muted) => { const t = g.append("text").attr("x", x).attr("y", y).attr("font-size", size).attr("fill", col); arr.forEach((s, i) => t.append("tspan").attr("x", x).attr("dy", i ? size * 1.3 : 0).text(s)); return t; };
    const capBig = lines(svg, 650, 488, 21, ["Lyon, from Fourvière hill. Photo: Aldg692VX, CC BY-SA 4.0.", "The ward: a short-stay geriatric unit of the university hospital, 6 to 10 December 2010."]);
    const capPh = lines(svg, 1087, 218, 15, ["Lyon, France"]).style("opacity", 0);
    const capX = lines(svg, 8, 500, 15, ["Contacts by role, as the authors", "counted them: 2951 patient–nurse,", "97 patient–patient (fig. 1)."]).style("opacity", 0);
    const T = (sel, instant) => instant ? sel : sel.transition("lay").duration(700).ease(d3.easeCubicInOut);
    const lay = (k, instant) => { const big = k === 0, inst = instant || reduce(), ms = .72 * MW / 205;
      T(gMap, inst).attr("transform", big ? "translate(40,30)" : `translate(8,60) scale(${205 / MW})`);
      T(mark, inst).attr("transform", `translate(${lx},${ly}) scale(${big ? 1 : ms})`);
      T(paris, inst).attr("transform", `translate(${px},${py}) scale(${big ? 1 : ms})`);
      T(gPh, inst).attr("transform", big ? `translate(650,40) scale(${610 / PW})` : `translate(1087,60) scale(${205 / PW})`);
      gX.attr("transform", `translate(8,330) scale(${205 / XW})`);
      T(capBig, inst).style("opacity", big ? 1 : 0); T(legend, inst).style("opacity", big ? 0 : 1); T(capPh, inst).style("opacity", big ? 0 : 1); T(gX, inst).style("opacity", k >= 3 ? 1 : 0); T(capX, inst).style("opacity", k >= 3 ? 1 : 0); };
    lay(0, true);
    return { steps: 5, caps: ["A real place. The ward in this tutorial is a short-stay geriatric unit of a university hospital in Lyon, France; the data are four days there, 6 to 10 December 2010.", "29 patients (circles), tracked by proximity badges for four days.", "27 nurses (squares), 11 doctors (diamonds), 8 admin staff (triangles). 75 people. The bigger the mark, the more contacts.", `An edge: at least five minutes face to face, plus the single strongest contact for the four people with none. ${Sim.W.n_edges} contacts, ${Sim.W.mean_contacts} per person. Nurses are the hub, and the authors’ own count says the same: patients met nurses thirty times more often than each other.`, "One person starts every outbreak in Parts 0 to 6. Watch what happens to them."],
      show: k => { lay(k); w.nodes.style("transition", "opacity .5s").style("opacity", i => (k >= 2 || (k >= 1 && Sim.W.roles[i] === 0)) ? 1 : 0); w.edges.style("transition", "opacity .8s").style("opacity", k >= 3 ? 1 : 0); L.show(k >= 4 ? 1 : 0); } };
  };

  // the cover: the ward with an outbreak running through it on a loop, a fresh run each time; below it, the curve of every run so far
  R.cover = (e, D) => {
    const W0 = 720, H0 = 800, T = 40;
    const w = ward(e, { w: W0, h: H0, r: 9.5, pad: 14, padT: 44, padB: 323 });
    w.edges.attr("stroke-opacity", .32);
    w.nodes.attr("stroke-width", 1.6).style("transition", "fill .28s");
    const [sx, sy] = w.P(Sim.W.src);
    w.rings.append("circle").attr("cx", sx).attr("cy", sy).attr("r", 17).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 2.5);
    const mono = "'IBM Plex Mono', ui-monospace, monospace"; const B = w.box;
    const mtext = (x, y, size, col, anchor) => w.svg.append("text").attr("x", x).attr("y", y).attr("font-family", mono).attr("font-size", size).attr("fill", col).attr("text-anchor", anchor || "start");
    mtext(B.x, 24, 15, C.muted).attr("letter-spacing", ".08em").text(`A REAL HOSPITAL WARD · ${Sim.N} PEOPLE · ${Sim.W.edges.length} CONTACTS`);
    const tRun = mtext(B.x + B.w, 24, 15, C.muted, "end").attr("letter-spacing", ".08em");
    const yL = B.y + B.h + 30;
    const tDay = mtext(B.x, yL, 18, C.ink);
    mtext(B.x + B.w, yL, 15, C.muted, "end").text("same ward, same virus, same first patient");
    // the curve of every run so far: day on x, people infected so far on y
    const cx0 = B.x + 34, cx1 = B.x + B.w, cy0 = H0 - 40, cy1 = yL + 46;
    const x = d3.scaleLinear().domain([0, T]).range([cx0, cx1]), y = d3.scaleLinear().domain([0, Sim.N]).range([cy0, cy1]);
    const cg = w.svg.append("g");
    cg.append("line").attr("x1", cx0).attr("x2", cx1).attr("y1", cy0).attr("y2", cy0).attr("stroke", C.line).attr("stroke-width", 1.5);
    mtext(cx0 - 8, cy0 + 5, 14, C.muted, "end").text("0"); mtext(cx0 - 8, cy1 + 5, 14, C.muted, "end").text(String(Sim.N));
    mtext(cx0, cy0 + 22, 14, C.muted).text("day 0"); mtext(cx1, cy0 + 22, 14, C.muted, "end").text(`day ${T}`);
    mtext(cx0, cy1 - 14, 14, C.muted).attr("letter-spacing", ".08em").text("INFECTED SO FAR · EVERY RUN SO FAR");
    const line = d3.line().x((v, i) => x(i)).y(v => y(v)).curve(d3.curveMonotoneX);
    const past = cg.append("g").attr("fill", "none").attr("stroke", C.grey).attr("stroke-opacity", .45).attr("stroke-width", 1.5);
    const cur = cg.append("path").attr("fill", "none").attr("stroke", C.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    let frames = [], cum = [], k = 0, run = 0, hold = 0;
    const fresh = () => { if (cum.length) past.append("path").attr("d", line(cum)); run++; frames = []; const r = Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, T, null, (t, s) => frames.push(new Uint8Array(s))); cum = r.cum; k = 0; };
    const paint = () => { w.state(frames[k]); cur.attr("d", line(cum.slice(0, k + 1))); tDay.text(`day ${k} · ${cum[k]} infected so far`); tRun.text(`RUN ${run}`); };
    if (reduce()) {   // print: one frame, with thirty earlier runs behind it
      for (let i = 0; i < 30; i++) past.append("path").attr("d", line(Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, T).cum));
      fresh(); run = 31; k = 14; paint(); return { steps: 1, caps: [], show: () => { } };
    }
    fresh();
    const section = e.closest("section");
    const tick = () => {
      if (!e.isConnected) { clearInterval(timer); return; }
      if (window.Reveal && Reveal.getCurrentSlide && Reveal.getCurrentSlide() !== section) return;   // paused while another slide is up
      if (k > T) { if (hold++ < 6) { tDay.text(`day ${T} · ${cum[T]} people in the end`); return; } hold = 0; fresh(); }
      paint(); k++;
    };
    paint(); k++; const timer = setInterval(tick, 300);
    return { steps: 1, caps: [], show: () => { } };
  };

  // 0 · four questions, each shown on the ward
  R.fourq = (e, D) => {
    const row = el("div", "fourq grid"); e.appendChild(row); const T = 40;
    const hubs = d3.range(Sim.N).sort((a, b) => Sim.deg[b] - Sim.deg[a]).slice(0, 8);
    let big = null; for (let i = 0; i < 60 && !big; i++) { const fr = []; const r = Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, T, null, (t, s) => fr.push(new Uint8Array(s))); if (r.cum[T] >= 50) big = fr; }
    if (!big) { const fr = []; Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, T, null, (t, s) => fr.push(new Uint8Array(s))); big = fr; }
    const tested = new Set(d3.range(Sim.N).filter(i => (i * 7) % 10 < 3));
    const Q = [
      { k: "Parts 1 to 3", q: "How big will it get?", a: "A forecast, with how sure we are", draw: w => w.state(big[T]) },
      { k: "Part 4", q: "Who is infected right now?", a: "We only test some people, and tests miss cases", draw: w => { const s = big[12]; w.nodes.attr("fill", i => tested.has(i) ? Sim.STATE[s[i]] : "#fff").attr("stroke", i => tested.has(i) ? "#fff" : C.grey); } },
      { k: "Part 6", q: "Who started it?", a: "A name, or a short list of suspects", draw: w => { w.state(D.truth.snapshot8); w.ring(new Set(D.fig11.set90), C.blue, 6.5, 1.6, "3,2"); } },
      { k: "Part 7", q: "Whom do we isolate or vaccinate?", a: "A decision that has to survive being wrong", draw: w => { w.nodes.attr("fill", i => hubs.includes(i) ? C.blue : C.light); w.size(i => hubs.includes(i) ? 7 : w.rad(i)); } },
    ];
    const panels = Q.map(q => {
      const p = el("div", "fq"); row.appendChild(p); const txt = el("div", "txt"); p.appendChild(txt); txt.appendChild(el("p", "k", q.k)); txt.appendChild(el("h3", null, q.q)); txt.appendChild(el("p", "a", q.a));
      const fig = el("div", "figbox"); p.appendChild(fig); const w = ward(fig, { w: 420, h: 270, r: 5, pad: 8, padT: 6, padB: 6 });
      w.edges.attr("stroke-opacity", .25).attr("stroke-width", 1); w.nodes.attr("stroke-width", .8); q.draw(w); return p;
    });
    return { steps: 4, caps: [], show: k => panels.forEach((p, i) => p.classList.toggle("on", i <= k)) };
  };

  // 2 · Bayes in one sentence: the prior, the data, the posterior, as three small figures
  R.bayes3 = (e, D) => {
    const row = el("div", "fourq three"); e.appendChild(row);
    const mk = (k, title, sub, accent) => { const p = el("div", "fq" + (accent ? " accent" : "")); row.appendChild(p); p.appendChild(el("p", "k", k)); p.appendChild(el("h3", null, title)); const fig = el("div", "figbox"); p.appendChild(fig); const a = el("p", "a", sub); p.appendChild(a); return { p, fig }; };
    const M = { l: 44, r: 16, t: 22, b: 54 }, W = 420, H = 300; const bx = () => d3.scaleLinear().domain([0, 0.31]).range([0, W - M.l - M.r]);
    // prior: every β from 1% to 30% equally likely
    const P1 = mk("Before data", "β could be anything from 1% to 30%", "the prior: a flat line");
    { const f = frame(P1.fig, W, H, M), x = bx(), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]); axes(f, x, y, "β, how contagious", "", { xt: 6, noY: true });
      f.g.append("rect").attr("x", x(0.01)).attr("y", y(.45)).attr("width", x(0.30) - x(0.01)).attr("height", f.ih - y(.45)).attr("fill", C.blueSoft).attr("stroke", C.blue).attr("stroke-width", 2).attr("rx", 3); }
    // data: the case counts, days 0 to 10
    const obs = D.truth.C.slice(0, 11); const P2 = mk("Data", "The case counts on days 0 to 10", "what the ward actually showed us");
    { const f = frame(P2.fig, W, H, M), x = d3.scaleLinear().domain([0, 10]).range([0, f.iw]), y = d3.scaleLinear().domain([0, d3.max(obs) * 1.15]).range([f.ih, 0]); axes(f, x, y, "day", "", { xt: 5, yt: 3 });
      f.g.append("path").attr("d", d3.line().x((v, i) => x(i)).y(v => y(v))(obs)).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 2);
      f.g.selectAll("circle").data(obs).join("circle").attr("cx", (v, i) => x(i)).attr("cy", v => y(v)).attr("r", 5.5).attr("fill", C.ink); }
    // posterior: the β values that reproduced those counts (the kept guesses of the next slide)
    const P3 = mk("After data", "Which β values could have produced those counts?", "the posterior: a pile, not a point", true);
    { const f = frame(P3.fig, W, H, M), x = bx(), y = d3.scaleLinear().range([f.ih, 0]); bars(f.g, D.fig4.keep, x, y, { bins: 30, color: C.blue }); axes(f, x, y, "β, how contagious", "", { xt: 6, noY: true }); }
    const panels = [P1.p, P2.p, P3.p]; const cap = e.closest("section").querySelector(".cap");
    return { steps: 4, caps: [], show: k => { panels.forEach((p, i) => p.classList.toggle("on", i <= k)); if (cap) { cap.style.transition = reduce() ? "none" : "opacity .4s"; cap.style.opacity = k >= 3 ? 1 : 0; } } };
  };

  // 0 · two runs
  R.tworuns = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row);
    const panels = [0, 1].map(() => { const d = el("div"); row.appendChild(d); const w = ward(d, { w: 640, h: 520, r: 8 }); w.legend(stateLegend, null, 512); const t = w.svg.append("text").attr("x", 320).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 24).attr("font-weight", 600).attr("fill", C.ink).text("day 0"); w.ring(new Set([Sim.W.src])); return { w, t }; });
    const run = () => panels.forEach(p => { const frames = []; const r = Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, 40, null, (t, s) => frames.push(new Uint8Array(s))); let k = 0; const step = () => { p.w.state(frames[k]); p.t.text(`day ${k}: ${r.cum[k]} infected so far`); k++; if (k < frames.length && !reduce()) setTimeout(step, 60); else { p.w.state(frames[40]); p.t.text(`day 40: ${r.cum[40]} people ever infected`); } }; step(); });
    const c = controls(e); button(c, "Run both again", run); let ran = false;
    return { steps: 2, caps: ["Same ward. Same virus. Same first patient. Day 0.", "Nothing differed except luck in the first few days. Which one is the forecast?"],
      show: k => { if (k >= 1 && !ran) { ran = true; run(); } if (k === 0) { ran = false; panels.forEach(p => { p.w.state(null); p.t.text("day 0"); }); } } };
  };

  // 0 · ladder
  R.ladder = (e, D) => {
    const lit = +e.dataset.lit || 0; const small = e.classList.contains("ladder-corner"); const DV = !!e.closest(".op-right");
    const names = ["Luck", "Numbers we don’t know", "A graph we don’t fully know", "What we can’t see", "A model that is wrong"], subs = ["who coughs on whom. Aleatoric: no measurement removes it.", "how contagious, how long infectious", "contacts the badges never recorded", "30% tested, and tests miss cases", "reality is not the simulator"];
    const w = small ? 250 : 1100, h = small ? 250 : 560, s = small ? .42 : 1;
    const svg = svgIn(e, w, h); const g = svg.append("g").attr("transform", `scale(${s})`);
    g.append("line").attr("x1", 70).attr("x2", 70).attr("y1", 20).attr("y2", 540).attr("stroke", C.ink).attr("stroke-width", 7); g.append("line").attr("x1", 200).attr("x2", 200).attr("y1", 20).attr("y2", 540).attr("stroke", C.ink).attr("stroke-width", 7);
    const rungs = [];
    for (let k = 0; k < 5; k++) { const y = 480 - k * 105, on = k + 1 === lit, done = k + 1 < lit; const gg = g.append("g"); gg.append("line").attr("x1", 70).attr("x2", 200).attr("y1", y).attr("y2", y).attr("stroke", on ? C.orange : done ? C.blue : C.light).attr("stroke-width", 16).attr("stroke-linecap", "round"); if (!small) { gg.append("text").attr("x", 240).attr("y", y - 4).attr("font-size", DV ? 38 : 34).attr("font-family", F.disp).attr("font-weight", on ? 700 : 600).attr("fill", on || done || lit === 0 ? C.ink : C.muted).text(`${k + 1}. ${names[k]}`); gg.append("text").attr("x", 240).attr("y", y + 26).attr("font-size", DV ? 28 : 21).attr("fill", C.muted).text(subs[k]); } rungs.push(gg); }
    if (!small) { g.append("text").attr("transform", "rotate(-90)").attr("x", -480).attr("y", 38).attr("font-size", DV ? 24 : 19).attr("fill", C.grey).attr("text-anchor", "middle").text("aleatoric"); g.append("text").attr("transform", "rotate(-90)").attr("x", -270).attr("y", 38).attr("font-size", DV ? 24 : 19).attr("fill", C.grey).attr("text-anchor", "middle").text("epistemic"); }
    if (small || lit) return null;
    return { steps: 5, caps: ["Rung 1: luck. Who coughs on whom. Nothing you measure removes it.", "Rung 2: two numbers we don’t know. How contagious, how long.", "Rung 3: the graph itself. The badges missed a third of the contacts.", "Rung 4: we only see the tested. Who is infected right now?", "Rung 5: the model is wrong, like every model. We climb from the bottom: Parts 1 to 5 are the rungs, Parts 6 and 7 use all five, Part 8 is the map."],
      show: k => rungs.forEach((r, i) => r.style("transition", "opacity .5s").style("opacity", i <= k ? 1 : .15)) };
  };

  // 1 · rules
  R.rules = (e, D) => {
    const W = Sim.W, src = W.src, nb = Sim.nb[src].slice(0, 3), sub = [src, ...nb];
    const svg = svgIn(e, 1300, 520); const L = Layers(svg);
    const pts = sub.map(i => W.pos[i]); const xs = d3.extent(pts, p => p[0]), ys = d3.extent(pts, p => p[1]);
    const states = [{ [src]: 1 }, { [src]: 1, [nb[0]]: 1 }, { [src]: 2, [nb[0]]: 1, [nb[1]]: 1 }];
    const titles = [["day 0", "patient zero is infectious"], ["day 1", "each contact catches it with probability β"], ["day 2", "patient zero recovers with probability γ"]];
    states.forEach((st, k) => {
      const g = L.add().attr("transform", `translate(${k * 430},0)`);
      const P = i => [60 + (W.pos[i][0] - xs[0]) / ((xs[1] - xs[0]) || 1) * 300, 108 + (W.pos[i][1] - ys[0]) / ((ys[1] - ys[0]) || 1) * 300];
      g.append("text").attr("x", 210).attr("y", 30).attr("text-anchor", "middle").attr("font-size", 23).attr("font-weight", 700).attr("fill", C.ink).text(titles[k][0]); g.append("text").attr("x", 210).attr("y", 58).attr("text-anchor", "middle").attr("font-size", 20).attr("fill", C.muted).text(titles[k][1]);
      for (const a of sub) for (const b of sub) if (a < b && Sim.nb[a].includes(b)) g.append("line").attr("x1", P(a)[0]).attr("y1", P(a)[1]).attr("x2", P(b)[0]).attr("y2", P(b)[1]).attr("stroke", C.grey).attr("stroke-width", 2.5);
      for (const i of sub) g.append("circle").attr("cx", P(i)[0]).attr("cy", P(i)[1]).attr("r", 26).attr("fill", Sim.STATE[st[i] || 0]).attr("stroke", C.ink).attr("stroke-width", 1.5);
      if (k === 1) { const [x1, y1] = P(src), [x2, y2] = P(nb[0]); g.append("text").attr("x", (x1 + x2) / 2 + 16).attr("y", (y1 + y2) / 2 - 10).attr("font-size", 30).attr("fill", C.blue).attr("font-weight", 700).text("β"); }
      if (k === 2) { const [x, y] = P(src); g.append("text").attr("x", x + 34).attr("y", y - 26).attr("font-size", 30).attr("fill", C.blue).attr("font-weight", 700).text("γ"); }
    });
    const lg = svg.append("g").attr("transform", "translate(420,508)"); let x = 0; for (const [col, lab] of [[C.light, "Susceptible"], [C.red, "Infectious"], [C.amber, "Recovered"]]) { lg.append("circle").attr("cx", x + 8).attr("cy", -7).attr("r", 9).attr("fill", col).attr("stroke", C.ink); lg.append("text").attr("x", x + 24).attr("y", 0).attr("font-size", 19).attr("fill", C.muted).text(lab); x += 180; }
    return { steps: 3, caps: ["Each person is Susceptible, Infectious, or Recovered. Day 0: one infectious patient.", "Each day, every infectious contact passes it on with probability β. One of three caught it.", "Each day, an infectious person recovers with probability γ. Two numbers and a graph: that is the whole model."], show: k => L.show(k + 1) };
  };

  // 1 · run it 2000 times
  R.hist2000 = (e, D) => {
    const f = frame(e, 1300, 560); const x = d3.scaleLinear().domain([0, 76]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 520]).range([f.ih, 0]);
    axes(f, x, y, "people ever infected, out of 75", "number of runs");
    const barsG = f.g.append("g"); const L = Layers(f.svg);
    let vals = [], beta = Sim.W.beta, running = false;
    const stat = f.g.append("text").attr("x", f.iw).attr("y", -4).attr("text-anchor", "end").attr("font-size", 20).attr("fill", C.muted);
    const gy = f.g.select(".ax-y");
    const redraw = () => { const mx = d3.max(d3.bin().domain(x.domain()).thresholds(38)(vals), b => b.length) || 0; bars(barsG, vals, x, y, { ymax: Math.max(100, Math.ceil(mx * 1.15 / 50) * 50) }); gy.call(d3.axisLeft(y).ticks(5).tickSize(-f.iw).tickPadding(10)); gy.select(".domain").remove(); gy.selectAll("line").attr("stroke", C.line); gy.selectAll("text").attr("fill", C.muted).attr("font-size", 18); stat.text(vals.length ? `${vals.length} runs` : ""); };
    let out;
    const lDie = L.add().attr("transform", T(f)), lBig = L.add().attr("transform", T(f)), lAvg = L.add().attr("transform", T(f));
    const annotate = () => { [lDie, lBig, lAvg].forEach(l => l.selectAll("*").remove()); if (!vals.length) return; const die = vals.filter(v => v < 15).length / vals.length, big = vals.filter(v => v >= 15); const m = Sim.mean(vals);
      note(lDie, x(2), y(380), `dies out: ${fmtPct(die)} of runs\nfewer than 15 people`, 70, -40);
      note(lBig, x(59), y(300), `big outbreak: ${fmtPct(1 - die)}\n${Sim.q(big, .05)} to ${Sim.q(big, .95)} people`, -20, -60); if (out) { const tenths = Math.round(10 * die); out.caps[2] = `${["Never", "One time", "Two times", "Three times", "Four times", "Five times", "Six times", "Seven times", "Eight times", "Nine times", "Every time"][tenths]} in ten it dies out before reaching 15 people.`; out.caps[3] = `${["Never", "One time", "Two times", "Three times", "Four times", "Five times", "Six times", "Seven times", "Eight times", "Nine times", "Every time"][10 - tenths]} in ten it sweeps the ward.`; out.caps[4] = `A point forecast of ${m.toFixed(0)} is not just imprecise. It describes a world that does not exist.`; }
      lAvg.append("line").attr("class", "draw").attr("x1", x(m)).attr("x2", x(m)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.orange).attr("stroke-width", 3); lAvg.append("text").attr("x", x(m) + 10).attr("y", 24).attr("font-size", 22).attr("font-weight", 700).attr("fill", C.orange).text(`the “average” outbreak: ${m.toFixed(0)} people`); lAvg.append("text").attr("x", x(m) + 10).attr("y", 50).attr("font-size", 20).attr("fill", C.orange).text("it never happens"); };
    let pendingK = 0;
    const section = () => e.closest("section");
    const run = (n, done) => { if (running) return; running = true; let k = 0; const step = () => { for (let i = 0; i < 60 && k < n; i++, k++) vals.push(Sim.sir(beta, Sim.W.gamma, Sim.W.src, 40).cum[40]); redraw(); if (k < n && !reduce()) requestAnimationFrame(step); else { while (k < n) { vals.push(Sim.sir(beta, Sim.W.gamma, Sim.W.src, 40).cum[40]); k++; } redraw(); running = false; if (done) done(); if (section() && !R.PRINT) R.sync(section()); } }; step(); };
    // a new β or Clear empties the histogram and blanks the caption, so no label ever describes a mixture of two βs
    const clear = () => { vals = []; redraw(); annotate(); L.show(0); const cap = section() && section().querySelector(".cap"); if (cap) { cap.__want = ""; cap.textContent = ""; } };
    const c = controls(e); button(c, "Run 200 more", () => run(200, annotate)); button(c, "Clear", clear, true); slider(c, "β", 0.01, 0.30, 0.01, beta, v => { beta = v; clear(); }, v => v.toFixed(2));
    redraw();
    out = { steps: 5, caps: ["The same outbreak, again and again. Each bar counts runs by how many people were infected.", "Two thousand runs. Two peaks. Nothing in between.", "Three times in ten it dies out before reaching 15 people.", "Seven times in ten it sweeps the ward.", `A point forecast of ${D.fig2.mean} is not just imprecise. It describes a world that does not exist.`],
      busy: () => running,
      show: k => { pendingK = k; if (k === 0) { vals = []; redraw(); annotate(); L.show(0); return; } if (vals.length < 2000) { if (!running) run(2000 - vals.length, () => { annotate(); L.show(pendingK - 1); }); } else { annotate(); L.show(k - 1); } } };
    return out;
  };

  // 1 · where it starts
  R.pbig = (e, D) => {
    const f = frame(e, 1300, 560); const x = d3.scaleLinear().domain([0, d3.max(Sim.deg) + 1]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]);
    axes(f, x, y, "number of contacts of patient zero", "chance of a big outbreak (15 or more infected)", { yt: 5 });
    const L = Layers(f.svg); const dots = L.add().attr("transform", T(f));
    const tip = el("div", "tip"); e.style.position = "relative"; e.appendChild(tip);
    dots.selectAll("path").data(d3.range(Sim.N)).join("path").attr("transform", i => `translate(${x(Sim.deg[i])},${y(D.fig3.p_big[i])})`).attr("d", i => symPath(Sim.W.roles[i], 9)).attr("fill", i => Sim.ROLE[Sim.W.roles[i]]).attr("stroke", "#fff").attr("stroke-width", 1.5).attr("opacity", .92)
      .on("mousemove", (ev, i) => { tip.style.opacity = 1; tip.style.left = (ev.offsetX + 14) + "px"; tip.style.top = (ev.offsetY - 10) + "px"; tip.textContent = `${Sim.ROLE_NAME[Sim.W.roles[i]]}, ${Sim.deg[i]} contacts: ${fmtPct(D.fig3.p_big[i])}`; }).on("mouseleave", () => tip.style.opacity = 0);
    legend(f, roleLegend.map(([c, l, s_, r_]) => [c, l, "dot", r_]), f.iw - 130, f.ih - 130);
    const lo = d3.minIndex(Sim.deg), hi = d3.maxIndex(Sim.deg);
    const l2 = L.add().attr("transform", T(f)); note(l2, x(Sim.deg[lo]), y(D.fig3.p_big[lo]), `a ${Sim.ROLE_NAME[Sim.W.roles[lo]]} with ${Sim.deg[lo]} contact: ${fmtPct(D.fig3.p_big[lo])}`, 90, -70);
    const l3 = L.add().attr("transform", T(f)); note(l3, x(Sim.deg[hi]), y(D.fig3.p_big[hi]), `a ${Sim.ROLE_NAME[Sim.W.roles[hi]]} with ${Sim.deg[hi]} contacts: ${fmtPct(D.fig3.p_big[hi])}`, -80, 90);
    return { steps: 3, caps: ["Each dot is one person as patient zero. Hover for who.", "Start with an isolated patient and the outbreak usually dies.", "Start with a doctor who meets everyone and it almost never does. The same virus is a different risk depending on where it enters."], show: k => L.show(k + 1) };
  };

  // 2 · ABC live
  R.abc = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1.35"; right.style.flex = "1"; row.append(left, right);
    const f = frame(left, 720, 480); const x = d3.scaleLinear().domain([0, 10]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 60]).range([f.ih, 0]); axes(f, x, y, "day", "cumulative cases", { xt: 10 });
    const L = Layers(f.svg); const path = f.g.append("path").attr("fill", "none").attr("stroke-width", 4).attr("stroke-linejoin", "round");
    const lObs = L.add().attr("transform", T(f)); const TOL = 4; bandY(lObs, x, y, D.truth.obs.map(v => Math.max(0, v - TOL)), D.truth.obs.map(v => v + TOL), C.light, .9); lObs.selectAll("circle").data(D.truth.obs).join("circle").attr("cx", (v, t) => x(t)).attr("cy", v => y(v)).attr("r", 7).attr("fill", C.ink); note(lObs, x(9), y(D.truth.obs[9]), "the real counts, days 0–10", -160, -40); note(lObs, x(5), y(D.truth.obs[5] + TOL), `the corridor: within ${TOL} cases a day`, -60, -60, C.muted, 18);
    const f2 = frame(right, 520, 480, { l: 40, r: 24, t: 24, b: 56 }); const x2 = d3.scaleLinear().domain([0.01, 0.30]).range([0, f2.iw]), y2 = d3.scaleLinear().domain([0, 10]).range([f2.ih, 0]); axes(f2, x2, y2, "β", "", { xt: 5, noY: true });
    const barsG = f2.g.append("g"); const L2 = Layers(f2.svg); const lTrue = L2.add().attr("transform", T(f2)); lTrue.append("line").attr("class", "draw").attr("x1", x2(Sim.W.beta)).attr("x2", x2(Sim.W.beta)).attr("y1", f2.ih).attr("y2", 0).attr("stroke", C.red).attr("stroke-width", 3); lTrue.append("text").attr("x", x2(Sim.W.beta) + 8).attr("y", 22).attr("font-size", 20).attr("font-weight", 600).attr("fill", C.red).text("the true β, which nobody told it");
    f2.g.append("text").attr("x", 0).attr("y", -6).attr("font-size", 20).attr("font-weight", 600).attr("fill", C.ink).text("kept guesses");
    let kept = [], tried = 0;
    const msg = el("p", "msg"); e.appendChild(msg);
    const st = stats(e, [["tried", "guesses tried"], ["kept", "kept"], ["range", "90% of kept β"]]);
    const redrawPost = () => { bars(barsG, kept, x2, y2, { bins: 29 }); st.tried.textContent = tried; st.kept.textContent = kept.length; st.range.textContent = kept.length > 3 ? `${Sim.q(kept, .05).toFixed(2)} – ${Sim.q(kept, .95).toFixed(2)}` : "–"; };
    const tryBeta = (b, show, fixed) => { const r = fixed ? { cum: fixed.cum } : Sim.sir(b, Sim.W.gamma, Sim.W.src, 10); let d = 0; for (let t = 0; t <= 10; t++) d += Math.abs(r.cum[t] - D.truth.obs[t]); d /= 11; const keep = d <= TOL; tried++; if (keep) kept.push(b); if (show) { path.datum(r.cum).attr("stroke", keep ? C.blue : C.grey).attr("stroke-dasharray", keep ? null : "9 6").attr("d", d3.line().x((v, t) => x(t)).y(v => y(v)).curve(d3.curveMonotoneX)); drawIn(path.node().parentNode); msg.textContent = `β = ${b.toFixed(3)}: misses the real counts by ${d.toFixed(1)} cases a day on average. ${keep ? "Inside the corridor: kept." : "Outside the corridor: thrown away."}`; } return keep; };
    const c = controls(e); let guess = 0.20;
    slider(c, "your guess for β", 0.01, 0.30, 0.005, guess, v => guess = v, v => v.toFixed(3));
    button(c, "Simulate 10 days", () => { tryBeta(guess, true); redrawPost(); });
    button(c, "Draw 500 guesses between 1% and 30%", () => { for (let i = 0; i < 500; i++) tryBeta(0.01 + Math.random() * 0.29, false); redrawPost(); msg.textContent = `500 random guesses: ${kept.length} kept so far. The histogram is the posterior.`; L2.show(1); });
    button(c, "Clear", () => { kept = []; tried = 0; path.attr("d", null); msg.textContent = ""; redrawPost(); L2.show(0); }, true);
    redrawPost();
    return { steps: 4, caps: ["Ten days of case counts. That is all we get to see.", "Line 1: guess a β. Line 2: simulate ten days. This guess, 0.20, leaves the corridor: more than four cases a day from the counts. Thrown away.", "A guess of 0.08 stays inside the corridor. Kept. Line 3: repeat.", "Five hundred guesses later, the kept ones pile up around a value nobody told the algorithm. That pile is the posterior."],
      show: k => { L.show(1); if (k === 0) { path.attr("d", null); msg.textContent = ""; } if (k === 1) tryBeta(0.20, true, D.abc_demo && D.abc_demo.bad); if (k === 2) tryBeta(0.08, true, D.abc_demo && D.abc_demo.good); if (k === 3 && kept.length < 50) { for (let i = 0; i < 500; i++) tryBeta(0.01 + Math.random() * 0.29, false); msg.textContent = `500 random guesses: ${kept.length} kept. The histogram is the posterior.`; } redrawPost(); L2.show(k >= 3 ? 1 : 0); } };
  };

  // 2 · posterior + fan
  R.fan = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1"; right.style.flex = "1.5"; row.append(left, right);
    const f = frame(left, 520, 520, { l: 62, r: 24, t: 40, b: 56 }); const x = d3.scaleLinear().domain([0.01, 0.30]).range([0, f.iw]); const bins = d3.bin().domain([0.01, 0.30]).thresholds(29)(D.fig4.keep); const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length)]).range([f.ih, 0]);
    axes(f, x, d3.scaleLinear().domain([0, 1]).range([f.ih, 0]), "β", "kept guesses", { xt: 4, noY: true }); const L = Layers(f.svg);
    const lPrior = L.add().attr("transform", T(f)); lPrior.append("rect").attr("width", f.iw).attr("height", f.ih * .2).attr("y", f.ih * .8).attr("fill", C.light);
    const lPriorLab = L.add().attr("transform", T(f)); lPriorLab.append("text").attr("x", f.iw / 2).attr("y", -14).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text("before data: β anywhere from 1% to 30%");
    const lPost = L.add().attr("transform", T(f)); lPost.selectAll("rect.bar").data(bins).join("rect").attr("class", "bar").attr("x", b => x(b.x0) + 1).attr("width", b => x(b.x1) - x(b.x0) - 2).attr("y", b => y(b.length)).attr("height", b => f.ih - y(b.length)).attr("fill", C.blue).attr("rx", 2); lPost.append("text").attr("x", f.iw / 2).attr("y", -14).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text("after ten days of counts");
    const lTrue = L.add().attr("transform", T(f)); lTrue.append("line").attr("class", "draw").attr("x1", x(Sim.W.beta)).attr("x2", x(Sim.W.beta)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.red).attr("stroke-width", 3); lTrue.append("text").attr("x", x(Sim.W.beta) + 8).attr("y", 20).attr("font-size", 19).attr("font-weight", 600).attr("fill", C.red).text("true β");
    const g = frame(right, 780, 520); const xd = d3.scaleLinear().domain([0, 40]).range([0, g.iw]), yd = d3.scaleLinear().domain([0, 75]).range([g.ih, 0]); axes(g, xd, yd, "day", "cumulative cases", { xt: 8 }); const L2 = Layers(g.svg);
    const lObs = L2.add().attr("transform", T(g)); lObs.selectAll("circle").data(D.truth.obs).join("circle").attr("cx", (v, t) => xd(t)).attr("cy", v => yd(v)).attr("r", 6).attr("fill", C.ink); lObs.append("line").attr("x1", xd(10)).attr("x2", xd(10)).attr("y1", 0).attr("y2", g.ih).attr("stroke", C.grey).attr("stroke-dasharray", "7 5"); lObs.append("text").attr("x", xd(10) + 8).attr("y", g.ih - 10).attr("font-size", 19).attr("fill", C.grey).text("today");
    const lBand = L2.add().attr("transform", T(g)); bandY(lBand, xd, yd, D.fig4.q05, D.fig4.q95, C.blue, .25); lineY(lBand, xd, yd, D.fig4.q50, C.blue, 3); note(lBand, xd(30), yd(D.fig4.q95[30]), "90% band: every plausible β,\nrun forward from today’s ward", -60, -60, C.blue);
    const lTruth = L2.add().attr("transform", T(g)); lineY(lTruth, xd, yd, D.truth.C, C.red, 3.5); note(lTruth, xd(22), yd(D.truth.C[22]), "what actually happened", 40, 70, C.red);
    const lCheck = L2.add().attr("transform", T(g)); box(lCheck, g.iw - 340, g.ih - 130, 330, "DID THE BAND COVER THE TRUTH?", [`Days 11–40: inside on ${fmtPct(D.fig4.coverage)} of days.`, `Width: ${D.fig4.width20} people.`]);
    return { steps: 4, caps: [`The posterior from the last slide, ${D.fig4.beta_lo} to ${D.fig4.beta_hi} with the true β inside, and the ten days of counts. Today is day 10. What happens next?`, "Run forward with every plausible β from today’s ward, assuming we know exactly who is infected today (Part 4 removes that assumption). The band is the forecast: not a line, a band.", "The red line is what actually happened.", "The test we run at the end of every part: did the band contain it, and how wide was it?"],
      show: k => { L.show(i => i !== 1); L2.show(k + 1); } };
  };

  // 2 · sensitivity
  R.sobol = (e, D) => {
    const S = D.sobol; const items = [["who patient zero is", S.who, C.blue], ["β, how contagious", S["β"], C.blue], ["γ, how long infectious", S["γ"], C.blue], ["luck", S.luck, C.light]];
    const f = frame(e, 1300, 520, { l: 330, r: 110, t: 20, b: 56 }); const x = d3.scaleLinear().domain([0, 100]).range([0, f.iw]), y = d3.scaleBand().domain(items.map(d => d[0])).range([0, f.ih]).padding(.3);
    const L = Layers(f.svg); items.forEach(d => { const g = L.add().attr("transform", T(f)); g.append("rect").attr("class", "bar").attr("x", 0).attr("y", y(d[0])).attr("height", y.bandwidth()).attr("width", x(d[1])).attr("fill", d[2]).attr("rx", 8); g.append("text").attr("x", -16).attr("text-anchor", "end").attr("y", y(d[0]) + y.bandwidth() / 2 + 9).attr("font-size", 26).attr("fill", C.ink).attr("font-weight", 600).text(d[0]); g.append("text").attr("x", x(d[1]) + 14).attr("y", y(d[0]) + y.bandwidth() / 2 + 10).attr("font-size", 30).attr("fill", C.ink).attr("font-weight", 700).attr("font-family", F.disp).text(d[1] + "%"); });
    f.g.append("text").attr("x", f.iw / 2).attr("y", f.ih + 44).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text("share of the spread of the final size each unknown explains on its own (first-order Sobol index; β 3–15%, γ 8–30%, any patient zero)");
    const frac = v => v >= 45 ? "half" : v >= 30 ? "a third" : v >= 22 ? "a quarter" : v >= 17 ? "a fifth" : v >= 12 ? "a seventh" : "a small share"; const ratio = S["β"] / Math.max(1, S["γ"]); const times = ratio >= 2.5 ? "three times" : ratio >= 1.5 ? "twice" : "about as much";
    return { steps: 4, caps: [`Which unknown should we spend money measuring? Who patient zero is explains ${frac(S.who)} of the spread: ${S.who}%.`, `β, how contagious: ${S["β"]}%. Contact tracing to pin it down pays ${times} ${times === "about as much" ? "as" : "what"} measuring recovery ${times === "about as much" ? "does" : "pays"}.`, `γ, how long people stay infectious: ${S["γ"]}%.`, `And ${S.luck}% is luck. We checked: interactions between the unknowns account for about one point of it. No measurement removes it. That is rung 1 again.`], show: k => L.show(k + 1) };
  };

  // 3 · graph uncertainty
  R.graphunc = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1"; right.style.flex = "1.5"; row.append(left, right);
    const w = ward(left, { w: 560, h: 520, r: 7 }); const P = w.P; const L = Layers(w.svg); w.ring(new Set([Sim.W.src])); const MP = D.fig6.miss_pct || 35;
    const missed = L.add().attr("stroke", C.red).attr("stroke-dasharray", "6 4").attr("stroke-width", 1.8); missed.selectAll("line").data(D.fig6.missed).join("line").attr("x1", d => P(d[0])[0]).attr("y1", d => P(d[0])[1]).attr("x2", d => P(d[1])[0]).attr("y2", d => P(d[1])[1]); missed.append("text").attr("x", 280).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.red).text(`red dashed: the real contacts the badges missed, ${MP}%`);
    w.svg.append("text").attr("x", 280).attr("y", 512).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text("grey: what the badges recorded · ring: patient zero");
    const g = frame(right, 780, 520); const x = d3.scaleLinear().domain([0, 40]).range([0, g.iw]), y = d3.scaleLinear().domain([0, 75]).range([g.ih, 0]); axes(g, x, y, "day", "cumulative cases", { xt: 8 }); const L2 = Layers(g.svg);
    g.svg.append("defs").append("pattern").attr("id", "hatch").attr("width", 9).attr("height", 9).attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)").append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 9).attr("stroke", C.muted).attr("stroke-width", 1.6);
    const lRec = L2.add().attr("transform", T(g)); lRec.append("path").datum(d3.range(41)).attr("fill", "url(#hatch)").attr("opacity", .6).attr("d", d3.area().x(t => x(t)).y0(t => y(D.fig6.lg[t])).y1(t => y(D.fig6.hg[t]))); note(lRec, x(38), y(D.fig6.hg[38]), "90% band if we trust\nthe recorded graph", -20, 160, C.muted);
    const lTruth = L2.add().attr("transform", T(g)); lineY(lTruth, x, y, D.truth.C, C.red, 3.5); note(lTruth, x(14), y(D.truth.C[14]), "what actually happened:\nabove the band", 50, 80, C.red);
    const lBlue = L2.add().attr("transform", T(g)); bandY(lBlue, x, y, D.fig6.lb, D.fig6.hb, C.blue, .25); note(lBlue, x(33), y(D.fig6.hb[33]), "90% band averaged over plausible full graphs", -30, -34, C.blue);
    const lCheck = L2.add().attr("transform", T(g)); box(lCheck, g.iw - 352, g.ih - 130, 344, "COVERAGE · WIDTH, AFTER DAY 10", [`recorded graph: ${D.fig6.cov_recorded}% of days · ${D.fig6.width_recorded} wide`, `plausible graphs: ${D.fig6.cov_plausible}% of days · ${D.fig6.width_plausible} wide`]);
    return { steps: 5, caps: [`The badges recorded ${Sim.W.n_edges - D.fig6.missed.length} contacts. Trust that graph and forecast: the hatched band.`, `What actually happened runs above the band: after day 10 it is outside on ${100 - D.fig6.cov_recorded}% of days, from a band that claimed 90%.`, `Because a third of the contacts are missing: we removed ${D.fig6.miss_pct || 35}%, the share Génois et al. measured badges miss. The graph is thinner than reality.`, `Treat the graph as uncertain too: every unknown input is a random variable you push through the model. Average over plausible full graphs: wider, and it holds the truth on ${D.fig6.cov_plausible}% of days.`, `The price of honesty: a band ${Math.round(100 * (D.fig6.width_plausible / D.fig6.width_recorded - 1))}% wider. The alternative held the truth on ${D.fig6.cov_recorded}% of days. Both bands start on day 0, so both include the runs that die out.`],
      show: k => { L2.show(i => (i === 0) || (i === 1 && k >= 1) || (i === 2 && k >= 3) || (i === 3 && k >= 4)); L.show(k >= 2 ? 1 : 0); } };
  };

  // 3 · three ways
  R.threeways = (e, D) => {
    const W = Sim.W, cn = D.corner.nodes; const svg = svgIn(e, 1300, 520); const L = Layers(svg);
    const pts = cn.map(i => W.pos[i]), xs = d3.extent(pts, p => p[0]), ys = d3.extent(pts, p => p[1]);
    const P = (i, ox) => [ox + 60 + (W.pos[i][0] - xs[0]) / ((xs[1] - xs[0]) || 1) * 300, 100 + (W.pos[i][1] - ys[0]) / ((ys[1] - ys[0]) || 1) * 300];
    const titles = ["(a) a probability on each contact", "(b) a position cloud per person", "(c) contacts inferred from the outbreak"];
    const gs = [0, 1, 2].map(k => { const g = L.add(); g.append("text").attr("x", k * 430 + 210).attr("y", 34).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 600).attr("fill", C.ink).text(titles[k]); return g; });
    for (const [u, v, p] of D.corner.prob) { const a = P(u, 0), b = P(v, 0); gs[0].append("line").attr("x1", a[0]).attr("y1", a[1]).attr("x2", b[0]).attr("y2", b[1]).attr("stroke", C.blue).attr("stroke-width", 1 + 7 * p).attr("opacity", Math.min(1, .2 + p)); if (p < 1) gs[0].append("text").attr("x", (a[0] + b[0]) / 2).attr("y", (a[1] + b[1]) / 2 - 8).attr("font-size", 18).attr("font-weight", 600).attr("fill", C.ink).attr("text-anchor", "middle").text(fmtPct(p)); }
    cn.forEach(i => gs[0].append("path").attr("transform", `translate(${P(i, 0)[0]},${P(i, 0)[1]})`).attr("d", symPath(W.roles[i], 14)).attr("fill", Sim.ROLE[W.roles[i]]).attr("stroke", "#fff").attr("stroke-width", 2));
    gs[0].append("text").attr("x", 210).attr("y", 470).attr("text-anchor", "middle").attr("font-size", 18).attr("fill", C.muted).text("thick = recorded · thin = guessed from the roles");
    const rnd = d3.randomNormal.source(d3.randomLcg(0.42));
    cn.forEach((i, k) => { const [cx, cy] = P(i, 430); const sp = D.corner.cloud[k] * 700; const g = gs[1].append("g").attr("fill", Sim.ROLE[W.roles[i]]).attr("opacity", .3); const n = rnd(0, sp); for (let j = 0; j < 120; j++) g.append("circle").attr("cx", cx + n()).attr("cy", cy + n()).attr("r", 2.6); gs[1].append("path").attr("transform", `translate(${cx},${cy})`).attr("d", symPath(W.roles[i], 9)).attr("fill", Sim.ROLE[W.roles[i]]).attr("stroke", "#fff"); });
    gs[1].append("text").attr("x", 640).attr("y", 470).attr("text-anchor", "middle").attr("font-size", 18).attr("fill", C.muted).text("close clouds mean a likely contact");
    for (const [u, v, s] of D.corner.infer) { const a = P(u, 860), b = P(v, 860); gs[2].append("line").attr("x1", a[0]).attr("y1", a[1]).attr("x2", b[0]).attr("y2", b[1]).attr("stroke", C.blue).attr("stroke-width", 1 + 8 * s).attr("opacity", Math.min(1, .2 + s)); }
    for (const [u, v] of D.corner.true_edges) { const a = P(u, 860), b = P(v, 860); gs[2].append("line").attr("x1", a[0]).attr("y1", a[1]).attr("x2", b[0]).attr("y2", b[1]).attr("stroke", C.red).attr("stroke-width", 1.6).attr("stroke-dasharray", "3 4"); }
    cn.forEach(i => gs[2].append("path").attr("transform", `translate(${P(i, 860)[0]},${P(i, 860)[1]})`).attr("d", symPath(W.roles[i], 14)).attr("fill", Sim.ROLE[W.roles[i]]).attr("stroke", "#fff").attr("stroke-width", 2));
    gs[2].append("text").attr("x", 1070).attr("y", 470).attr("text-anchor", "middle").attr("font-size", 18).attr("fill", C.muted).text("blue = inferred weight · red dotted = the true contacts");
    return { steps: 3, caps: [`${cn.length} people: patient zero and ${cn.length - 1} neighbours. Recorded contacts are certain; every other pair gets a probability from how often those roles meet.`, "Or give each person a cloud of possible positions. Close clouds mean a likely contact; few recorded contacts, a wider cloud.", "Or watch the outbreak itself: who fell ill the day after whom recovers the contacts, with a weight on each."], show: k => L.show(k + 1) };
  };

  // 4 · kalman
  R.kalman = (e, D) => {
    const f = frame(e, 1300, 500, { l: 30, r: 30, t: 30, b: 56 }); const x = d3.scaleLinear().domain([0, 40]).range([0, f.iw]), y = d3.scaleLinear().domain([0, .2]).range([f.ih, 0]); axes(f, x, y, "number of infected people in the ward right now", "", { noY: true });
    const xs = d3.range(0, 40.01, .2); const gauss = (m, s) => xs.map(v => [v, Math.exp(-((v - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI))]);
    const L = Layers(f.svg); const cols = [C.blue, C.ink, C.blue]; const layers = cols.map(() => L.add().attr("transform", T(f)));
    const paths = cols.map((col, i) => layers[i].append("path").attr("fill", "none").attr("stroke", col).attr("stroke-width", i === 2 ? 5 : 3.5).attr("stroke-dasharray", i === 0 ? "10 7" : null)); const labels = cols.map((col, i) => layers[i].append("text").attr("font-size", 22).attr("font-weight", 600).attr("fill", col));
    let m0 = 18, s0 = 5, mz = 26, sz = 3; const st = stats(e, [["k", "weight on the tests: K = σ²<sub>model</sub> / (σ²<sub>model</sub> + σ²<sub>tests</sub>)"], ["m", "combined estimate"], ["s", "give or take"]]);
    const draw = () => { const sp = 1 / Math.sqrt(1 / s0 ** 2 + 1 / sz ** 2), mp = (m0 / s0 ** 2 + mz / sz ** 2) / (1 / s0 ** 2 + 1 / sz ** 2); const ln = d3.line().x(d => x(d[0])).y(d => y(Math.min(d[1], .2))); [[m0, s0, `predict: the model says about ${m0} ± ${s0}`], [mz, sz, `measure: the tests say about ${mz} ± ${sz}`], [mp, sp, `combine: about ${mp.toFixed(0)} ± ${sp.toFixed(1)}, narrower than both`]].forEach(([m, s, t], i) => { paths[i].attr("d", ln(gauss(m, s))); labels[i].attr("x", x(m) + (i === 0 ? -10 : 12)).attr("text-anchor", i === 0 ? "end" : "start").attr("y", y(Math.min(.2, 1 / (s * Math.sqrt(2 * Math.PI)))) - 10).text(t); }); const K = s0 ** 2 / (s0 ** 2 + sz ** 2); st.k.textContent = K.toFixed(2); st.m.textContent = mp.toFixed(1); st.s.textContent = sp.toFixed(1); };
    const c = controls(e); slider(c, "model’s give-or-take σ<sub>model</sub>", 1, 10, .5, s0, v => { s0 = v; draw(); }); slider(c, "tests’ give-or-take σ<sub>tests</sub>", 1, 10, .5, sz, v => { sz = v; draw(); }); draw();
    return { steps: 3, caps: ["Predict: from yesterday, the model says about 18 infected today, give or take 5.", "Measure: the tests come in and say about 26, give or take 3.", "Combine: a weighted average, closer to the more confident source, and narrower than both. That is the whole Kalman filter. Drag the sliders."], show: k => L.show(k + 1) };
  };

  // 4 · particles
  R.particles = (e, D) => {
    const W = Sim.W, svg = svgIn(e, 1300, 520); const L = Layers(svg); const rows = [["1. predict", "advance each copy one day"], ["2. measure", "compare each with today’s tests"], ["3. resample", "keep the good, drop the bad"]];
    const P = (i, ox, oy) => [ox + 3 + W.pos[i][0] * 140, oy + 14 + W.pos[i][1] * 88]; const PD = D.particles.day || 12;
    const mini = (g, ox, oy, s, title, col) => { g.selectAll(null).data(d3.range(Sim.N)).join("circle").attr("cx", i => P(i, ox, oy)[0]).attr("cy", i => P(i, ox, oy)[1]).attr("r", 3.2).attr("fill", i => Sim.STATE[s[i]]); g.append("text").attr("x", ox + 73).attr("y", oy - 26).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 600).attr("fill", C.ink).text(title[0]); g.append("text").attr("x", ox + 73).attr("y", oy - 6).attr("text-anchor", "middle").attr("font-size", 18).attr("fill", col || C.ink).text(title[1]); };
    const oys = [50, 215, 380];
    const gs = rows.map((t, r) => { const g = L.add(); g.append("text").attr("x", 10).attr("y", oys[r] + 48).attr("font-size", 23).attr("fill", C.ink).attr("font-weight", 700).text(t[0]); g.append("text").attr("x", 10).attr("y", oys[r] + 76).attr("font-size", 18).attr("fill", C.muted).text(t[1]); return g; });
    D.particles.copies.forEach((s, k) => { const ox = 330 + k * 160; mini(gs[0], ox, oys[0], s, [`copy ${k + 1}`, `${s.filter(v => v === 1).length} infectious`]); mini(gs[1], ox, oys[1], s, ["fits the tests", fmtPct(D.particles.w[k])], D.particles.w[k] > .1 ? C.blue : C.grey); mini(gs[2], ox, oys[2], D.particles.copies[D.particles.kept[k]], ["kept", `copy ${D.particles.kept[k] + 1}`]); });
    const fit = D.particles.w.map((v, k) => v > .1 ? k + 1 : null).filter(v => v != null); const fitTxt = fit.length === 1 ? `Copy ${fit[0]} matches; the others don’t.` : `Copies ${fit.slice(0, -1).join(", ")} and ${fit[fit.length - 1]} fit, copy ${D.particles.w.indexOf(Math.max(...D.particles.w)) + 1} best; the others don’t.`;
    return { steps: 3, caps: [`Our ward is not a bell curve. So keep 1000 copies of it, each a possible true state. Here are six, on day ${PD}.`, `Compare each copy with today’s test results. ${fitTxt}`, "Duplicate the copies that fit, drop the ones that don’t. Same predict–measure–combine loop, with a crowd instead of a Gaussian. A particle filter."], show: k => L.show(k + 1) };
  };

  // 4 · filter tracking
  R.filter = (e, D) => {
    const f = frame(e, 1300, 560); const days = d3.range(41); const x = d3.scaleLinear().domain([0, 40]).range([0, f.iw]), y = d3.scaleLinear().domain([0, Math.max(45, d3.max(D.fig8.hi), d3.max(D.fig8.obs) * D.fig8.scale * 1.04)]).range([f.ih, 0]); axes(f, x, y, "day", "people infectious right now", { xt: 8 });
    const L = Layers(f.svg);
    const lObs = L.add().attr("transform", T(f)); lObs.selectAll("circle").data(D.fig8.obs_days).join("circle").attr("cx", t => x(t)).attr("cy", (t, k) => y(D.fig8.obs[k] * D.fig8.scale)).attr("r", 6).attr("fill", C.ink); note(lObs, x(40), y(D.fig8.obs[20] * D.fig8.scale), `positive tests × ${D.fig8.scale}: noisy, with false positives`, -30, -90);
    const lBand = L.add().attr("transform", T(f)); bandY(lBand, x, y, D.fig8.lo, D.fig8.hi, C.blue, .25); lineY(lBand, x, y, D.fig8.md, C.blue, 3); note(lBand, x(14), y(D.fig8.hi[14]), "the filter’s 90% band,\nupdated every two days", 60, -30, C.blue);
    const lTruth = L.add().attr("transform", T(f)); lineY(lTruth, x, y, D.truth.I, C.red, 3.5); note(lTruth, x(16), y(D.truth.I[16]), "the truth, which nobody observes", 70, 50, C.red);
    const lMiss = L.add().attr("transform", T(f)); days.forEach(t => { if (D.truth.I[t] < D.fig8.lo[t] || D.truth.I[t] > D.fig8.hi[t]) lMiss.append("circle").attr("cx", x(t)).attr("cy", y(D.truth.I[t])).attr("r", 11).attr("fill", "none").attr("stroke", C.orange).attr("stroke-width", 3); });
    const R8 = D.fig8.rep; box(lMiss, f.iw - 420, 8, 410, "COVERAGE · WIDTH", [`this outbreak: ${D.fig8.days_in} of 41 days, ${D.fig8.coverage}% · width ${D.fig8.width}`].concat(R8 ? [`${R8.outbreaks} fresh outbreaks: ${R8.coverage}% · width ${R8.width}`] : []));
    return { steps: 4, caps: ["What the filter sees: 30% of the ward tested every two days, scaled up. Noisy.", "The filter’s band: wide while the outbreak takes off, narrower as evidence accumulates. Its copies also allow a small chance of a case walking in from outside, so no copy dies for good.", "Now reveal the truth, hidden from the filter. It tracks, mostly.", (() => { const R8 = D.fig8.rep, c1 = D.fig8.coverage, c2 = R8 ? R8.coverage : c1; return `Count the misses: ${c1}% on this outbreak, when it claimed 90%. One run of 41 dependent days cannot settle it, so repeat on ${R8 ? R8.outbreaks : 0} fresh outbreaks: ${c2}%. ${c2 < 88 ? "Over-confident. Hold that thought: Part 5 is the fix." : "Honest. Not every model is: Part 5 is for the ones that aren’t."}`; })()], show: k => L.show(k + 1) };
  };

  // 4 · uncertainty map
  R.uncmap = (e, D) => {
    const w = ward(e, { w: 1300, h: 600, r: 10 }); const col = d3.scaleSequential(d3.interpolateOranges).domain([0, .25]); const L = Layers(w.svg);
    const tip = el("div", "tip"); e.style.position = "relative"; e.appendChild(tip);
    w.nodes.on("mousemove", (ev, i) => { tip.style.opacity = 1; tip.style.left = (ev.offsetX + 14) + "px"; tip.style.top = (ev.offsetY - 10) + "px"; tip.textContent = `${Sim.ROLE_NAME[Sim.W.roles[i]]}: P(infected) ${fmtPct(D.fig9.pinf[i])}, uncertainty ${D.fig9.unc[i].toFixed(2)}${D.fig9.tested[i] ? (D.fig9.pos20[i] ? " · tested positive" : " · tested negative") : " · not tested"}`; }).on("mouseleave", () => tip.style.opacity = 0);
    const lg = w.legend([[C.red, "tested today: positive"], [C.ink, "tested today: negative", true]], null, 592).style("opacity", 0);
    const grad = w.svg.append("defs").append("linearGradient").attr("id", "og"); grad.append("stop").attr("offset", "0%").attr("stop-color", col(0)); grad.append("stop").attr("offset", "100%").attr("stop-color", col(.25));
    const l3 = L.add(); l3.append("rect").attr("x", 980).attr("y", 580).attr("width", 200).attr("height", 14).attr("rx", 4).attr("fill", "url(#og)"); l3.append("text").attr("x", 980).attr("y", 572).attr("font-size", 17).attr("fill", C.muted).text("untested: darker = the filter is less sure");
    const top = d3.range(Sim.N).filter(i => !D.fig9.tested[i]).sort((a, b) => D.fig9.unc[b] - D.fig9.unc[a]).slice(0, 5);
    const l4 = L.add(); top.forEach(i => { const [x, y] = w.P(i); l4.append("circle").attr("cx", x).attr("cy", y).attr("r", 18).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 2.5).attr("stroke-dasharray", "5 4"); }); const [tx, ty] = w.P(top[0]); note(l4, tx, ty, "test these five next", 70, -50);
    l3.append("text").attr("x", 980).attr("y", 548).attr("font-size", 17).attr("fill", C.muted).text("size: how likely infected");
    return { steps: 4, caps: ["Day 20. Each person gets their own “how sure am I that you’re infected”.", "Outlined: the people tested today. Red, positive; white, negative. About them the filter is sure.", "The untested: colour is how unsure the filter is, size is how likely infected. The graph fills them in from their neighbours: an untested nurse next to three positives is probably positive.", "The darkest marks are whom to test next. The uncertainty map is a testing strategy, not a report."],
      show: k => { w.nodes.style("transition", "fill .6s, stroke .4s").attr("fill", i => k >= 1 && D.fig9.tested[i] ? (D.fig9.pos20[i] ? C.red : "#fff") : k >= 2 ? col(D.fig9.unc[i]) : C.light).attr("stroke", i => k >= 1 && D.fig9.tested[i] ? C.ink : "#fff").attr("stroke-width", i => k >= 1 && D.fig9.tested[i] ? 3 : 1.6); w.size(k >= 2 ? (i => D.fig9.tested[i] ? 9 : 5 + 11 * D.fig9.pinf[i]) : null); lg.style("opacity", k >= 1 ? 1 : 0); L.show(i => (i === 0 && k >= 2) || (i === 1 && k >= 3)); } };
  };

  // 5 · conformal
  R.conformal = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1.4"; right.style.flex = "1"; row.append(left, right);
    const f = frame(left, 740, 480); const x = d3.scaleLinear().domain([.5, .95]).range([0, f.iw]), y = d3.scaleLinear().domain([.4, 1]).range([f.ih, 0]); axes(f, x, y, "confidence the band claims", "how often the truth was inside", { xt: 5, yt: 6 });
    const L = Layers(f.svg);
    const l0 = L.add().attr("transform", T(f)); l0.append("line").attr("x1", x(.5)).attr("y1", y(.5)).attr("x2", x(.95)).attr("y2", y(.95)).attr("stroke", C.grey).attr("stroke-dasharray", "7 5").attr("stroke-width", 2.5); note(l0, x(.85), y(.85), "honest: says 85%, is right 85%", -30, -80, C.muted, 19);
    const ln = d3.line().x((v, i) => x(D.fig10.levels[i])).y(v => y(v)).curve(d3.curveMonotoneX);
    const l1 = L.add().attr("transform", T(f)); l1.append("path").datum(D.fig10.cov_naive).attr("fill", "none").attr("stroke", C.grey).attr("stroke-width", 4).attr("d", ln); note(l1, x(.9), y(D.fig10.cov_naive[8]), "the model’s own ± 2 band", -60, 90, C.muted);
    const l2 = L.add().attr("transform", T(f)); l2.append("path").datum(D.fig10.cov_conf).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 4).attr("d", ln); note(l2, x(.75), y(D.fig10.cov_conf[5]), "same model,\nconformal band", -40, -70, C.blue);
    const mark = f.g.append("g");
    const g = frame(right, 520, 480); const yw = d3.scaleLinear().domain([0, d3.max(D.fig10.w_conf) + 2]).range([g.ih, 0]); const xw = d3.scaleLinear().domain([.5, .95]).range([0, g.iw]); axes(g, xw, yw, "confidence the band claims", "band width, people", { xt: 5 });
    const L2 = Layers(g.svg); const l3 = L2.add().attr("transform", T(g)); const lw = d3.line().x((v, i) => xw(D.fig10.levels[i])).y(v => yw(v)).curve(d3.curveMonotoneX); l3.append("path").datum(D.fig10.w_naive).attr("fill", "none").attr("stroke", C.grey).attr("stroke-width", 4).attr("d", lw); l3.append("path").datum(D.fig10.w_conf).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 4).attr("d", lw); note(l3, xw(.9), yw(D.fig10.w_conf[8]), "the price of honesty", -140, -20, C.blue); const mark2 = g.g.append("g");
    const st = stats(e, [["nc", "model’s own band: coverage"], ["nw", "its width"], ["cc", "conformal band: coverage"], ["cw", "its width"]]);
    const erfinv = v => { const a = .147, l = Math.log(1 - v * v), t = 2 / (Math.PI * a) + l / 2; return Math.sign(v) * Math.sqrt(Math.sqrt(t * t - l / a) - t); };
    const upd = a => { const z = Math.sqrt(2) * erfinv(a), abs = D.fig10.res_cal.map(Math.abs), qh = Sim.q(abs, Math.min(1, Math.ceil((abs.length + 1) * a) / abs.length)); const nc = D.fig10.res_test.filter(r => Math.abs(r) <= z * 2).length / D.fig10.res_test.length, cc = D.fig10.res_test.filter(r => Math.abs(r) <= qh).length / D.fig10.res_test.length; st.nc.textContent = fmtPct(nc); st.nw.textContent = (4 * z).toFixed(1); st.cc.textContent = fmtPct(cc); st.cw.textContent = (2 * qh).toFixed(1); mark.selectAll("*").remove(); mark.append("line").attr("x1", x(a)).attr("x2", x(a)).attr("y1", 0).attr("y2", f.ih).attr("stroke", C.ink).attr("stroke-dasharray", "4 4"); mark2.selectAll("*").remove(); mark2.append("line").attr("x1", xw(a)).attr("x2", xw(a)).attr("y1", 0).attr("y2", g.ih).attr("stroke", C.ink).attr("stroke-dasharray", "4 4"); };
    const c = controls(e); slider(c, "confidence the band claims", 50, 95, 5, 90, v => upd(v / 100), v => v + "%"); upd(.9);
    return { steps: 4, caps: ["A new, deliberately simple forecaster: it knows β and γ but ignores the network. Structurally wrong, like every real model. An honest band sits on the diagonal.", `Its own ± 2 band claims 90% and delivers ${D.fig10.naive_cov}%. Below the line: over-confident. Most deep models are.`, `The same forecaster with a conformal band, three lines of code and ${D.fig10.n_cal || 300} past cases: it follows the claim. ${D.fig10.conf_cov}% at 90.`, `The price: a band ${Math.round(D.fig10.conf_width)} people wide instead of ${Math.round(D.fig10.naive_width)}. Drag the claimed confidence.`], show: k => { L.show(k + 1); L2.show(k >= 3 ? 1 : 0); } };
  };

  // 5 · forecast hub
  R.hub = (e, D) => {
    const f = frame(e, 1300, 560); const x = d3.scaleLinear().domain([.4, 1.02]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]); axes(f, x, y, "confidence the band claimed", "how often the truth was inside", { xt: 0, yt: 5 }); f.g.select(".ax-x").remove();
    for (const [v, lab] of [[.5, "50% band"], [.95, "95% band"]]) f.g.append("text").attr("x", x(v)).attr("y", f.ih + 30).attr("text-anchor", "middle").attr("font-size", 20).attr("fill", C.muted).text(lab);
    const L = Layers(f.svg);
    const l0 = L.add().attr("transform", T(f)); l0.append("line").attr("x1", x(.4)).attr("y1", y(.4)).attr("x2", x(1)).attr("y2", y(1)).attr("stroke", C.grey).attr("stroke-dasharray", "7 5").attr("stroke-width", 2.5);
    const tip = el("div", "tip"); e.style.position = "relative"; e.appendChild(tip); const jit = d3.randomNormal.source(d3.randomLcg(3))(0, .008);
    const pts = []; for (const [name, [c95, c50]] of Object.entries(D.hub)) { if (name === "COVIDhub-ensemble") continue; const j = jit(); pts.push({ name, x: .5 + j, y: c50 }, { name, x: .95 + j, y: c95 }); }
    l0.selectAll("circle.m").data(pts).join("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", d => d.name === "UMass-MechBayes" ? 9 : 8).attr("fill", d => d.name === "UMass-MechBayes" ? C.blue : C.grey).attr("opacity", .85).on("mousemove", (ev, d) => { tip.style.opacity = 1; tip.style.left = (ev.offsetX + 14) + "px"; tip.style.top = (ev.offsetY - 10) + "px"; tip.textContent = `${d.name}: ${fmtPct(d.y)}`; }).on("mouseleave", () => tip.style.opacity = 0);
    const c95 = Object.entries(D.hub).filter(([n]) => n !== "COVIDhub-ensemble").map(([, v]) => v[0]); const nClose = c95.filter(v => Math.abs(v - .95) <= .05).length, nModels = c95.length; const words = ["none", "one", "two", "three", "four", "five", "six"];
    note(l0, x(.95), y(.31), `${nModels} models, 55 locations, 79 weeks. Hover for names.`, -120, 40, C.muted, 19);
    const l1 = L.add().attr("transform", T(f)); note(l1, x(.95), y(.93), `only ${words[nClose] || nClose} of ${nModels} within five points of 95%`, -200, -30, C.orange);
    const ens = D.hub["COVIDhub-ensemble"]; const l2 = L.add().attr("transform", T(f)); l2.selectAll("circle").data([[.5, ens[1]], [.95, ens[0]]]).join("circle").attr("cx", d => x(d[0])).attr("cy", d => y(d[1])).attr("r", 14).attr("fill", C.blue); note(l2, x(.5), y(ens[1]), `the ensemble of all models: ${ens[1]} and ${ens[0]}`, 60, -80, C.blue);
    return { steps: 3, caps: [`Leaving the ward for one slide. The US COVID-19 Forecast Hub: ${nModels} models, one of them the Hub’s own baseline, forecasting deaths in the 50 states and five more locations for 79 weeks. Same test as ours.`, `Individual models’ 95% bands held the truth between ${Math.round(100 * d3.min(c95))}% and ${Math.round(100 * d3.max(c95))}% of the time. Almost all over-confident.`, `Best calibrated and most accurate overall: the ensemble of everyone, at ${Math.round(100 * ens[0])}% for its 95% band; ${nClose === 1 ? "one single model matched it" : (words[nClose] || nClose) + " single models came close"}. Several models disagreeing is Part 4’s crowd of copies, with models instead of simulations.`], show: k => L.show(k + 1) };
  };

  // 6 · rumor tree
  R.tree = (e, D) => {
    const Tr = D.tree, svg = svgIn(e, 1300, 540); const L = Layers(svg); const nodes = Tr.nodes.map(id => ({ id })), links = Tr.edges.map(([s, t]) => ({ source: s, target: t }));
    const sim = d3.forceSimulation(nodes).force("link", d3.forceLink(links).id(d => d.id).distance(110)).force("charge", d3.forceManyBody().strength(-500)).force("center", d3.forceCenter(300, 250)).stop(); for (let i = 0; i < 300; i++) sim.tick();
    Tr.cands.forEach((c, k) => { const g = L.add().attr("transform", `translate(${k * 640},0)`); g.selectAll("line").data(links).join("line").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y).attr("stroke", C.grey).attr("stroke-width", 3); g.selectAll("circle").data(nodes).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 22).attr("fill", d => Tr.infected.includes(d.id) ? C.red : C.light).attr("stroke", "#fff").attr("stroke-width", 2);
      const r = L.add().attr("transform", `translate(${k * 640},0)`); const cn = nodes.find(d => d.id === c); r.append("circle").attr("cx", cn.x).attr("cy", cn.y).attr("r", 29).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 5); r.append("text").attr("x", 320).attr("y", 496).attr("text-anchor", "middle").attr("font-size", 22).attr("fill", C.ink).attr("font-weight", 600).text("if the outlined person started it:"); r.append("text").attr("x", 320).attr("y", 526).attr("text-anchor", "middle").attr("font-size", 22).attr("fill", C.ink).text(`${Tr.orders[k]} possible order${Tr.orders[k] > 1 ? "s" : ""} of infection`); });
    const wn = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]; const Cap = t => String(t).charAt(0).toUpperCase() + String(t).slice(1); const o0 = Tr.orders[0], o1 = Tr.orders[1]; const ratio = o1 ? o0 / o1 : o0;
    return { steps: 3, caps: [`${Cap(wn[Tr.nodes.length] || Tr.nodes.length)} people cut from the ward. ${Cap(wn[Tr.infected.length] || Tr.infected.length)} are infected. Who started it?`, `If the person in the middle started it, the infection could have spread in ${wn[o0] || o0} different order${o0 === 1 ? "" : "s"}.`, `If the person at the edge started it, ${o1 === 1 ? "only one" : wn[o1] || o1}. So the middle is about ${ratio === Math.round(ratio) ? (wn[ratio] || ratio) + " times" : ratio.toFixed(1) + " times"} as likely. That is rumour centrality. And once everyone is infected, nobody can be told apart.`], show: k => L.show(i => i === 0 || (i === 1 && k >= 1) || (i >= 2 && k >= 2)) };
  };

  // 6 · source posterior
  R.source = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const a = el("div"), b = el("div"); row.append(a, b);
    const w1 = ward(a, { w: 640, h: 520, r: 8 }); w1.state(D.truth.snapshot8.map(v => v ? 1 : 0)); w1.ring(new Set([Sim.W.src])); w1.svg.append("text").attr("x", 320).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 23).attr("font-weight", 600).attr("fill", C.ink).text(`day 8: ${D.fig11.infected} people infected so far. Who started it?`);
    const w2 = ward(b, { w: 640, h: 520, r: 8 }); const col = d3.scaleSequential(d3.interpolateBlues).domain([0, d3.max(D.fig11.post)]); w2.ring(new Set([Sim.W.src])); w2.svg.append("text").attr("x", 320).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 23).attr("font-weight", 600).attr("fill", C.ink).text("how likely is each person to be patient zero?");
    const tip = el("div", "tip"); b.style.position = "relative"; b.appendChild(tip); w2.nodes.on("mousemove", (ev, i) => { if (!D.truth.snapshot8[i]) return; tip.style.opacity = 1; tip.style.left = (ev.offsetX + 14) + "px"; tip.style.top = (ev.offsetY - 10) + "px"; tip.textContent = `${Sim.ROLE_NAME[Sim.W.roles[i]]}: ${fmtPct(D.fig11.post[i])}`; }).on("mouseleave", () => tip.style.opacity = 0);
    const top = D.fig11.post.indexOf(d3.max(D.fig11.post)); const L = Layers(w2.svg); const side = px => px < 320 ? 1 : -1; const lTop = L.add(); const [tx, ty] = w2.P(top); const wrong = top !== Sim.W.src; lTop.append("circle").attr("cx", tx).attr("cy", ty).attr("r", 16).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 4); note(lTop, tx, ty, `the top suspect${wrong ? ". Wrong." : ""}`, side(tx) * 90, 62 - ty, wrong ? C.orange : C.blue);
    const lSet = L.add(); lSet.selectAll("circle").data(D.fig11.set90).join("circle").attr("cx", i => w2.P(i)[0]).attr("cy", i => w2.P(i)[1]).attr("r", 14).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 3).attr("stroke-dasharray", "5 4"); const [sx, sy] = w2.P(Sim.W.src); note(lSet, sx, sy, `the 90% set, dashed: ${D.fig11.set_size} people.\nPatient zero (ink ring) is ${D.fig11.in_set ? "inside" : "outside"}.`, side(sx) * 90, (w2.h - 48) - sy, C.blue);
    const R100 = D.rep100, nMin = R100.min_infected || 1; const rep = el("div", "check rep", `The 90% set held patient zero <b>${R100.set_hit_pct}%</b> of the time, ${R100.set_size} people on average. The single top suspect was right <b>${R100.top1_pct}%</b> of the time. Outbreaks with at least ${nMin} infected on day 8.`); rep.style.transition = "opacity .4s"; rep.style.opacity = 0; e.appendChild(rep);
    return { steps: 5, caps: [`Day 8. ${D.fig11.infected} people infected. Patient zero is marked, but we are not supposed to know that.`, "Part 2’s three lines, run once per suspect: how well does an outbreak started by this person reproduce the day-8 picture? A score, not an exact likelihood. Hover for each one’s probability.", `The single most likely suspect. ${top === Sim.W.src ? "Right this time, but a single name is a gamble." : "Wrong. A single name would have sent the contact tracers to the wrong person."}`, `The smallest set holding 90% of the probability: ${D.fig11.set_size} of the ${D.fig11.infected} infected. The truth is ${D.fig11.in_set ? "inside" : "outside"}, and ${D.fig11.uninfected} uninfected people are cleared.`, `Over a hundred outbreaks with at least ${nMin} infected, the set held the source ${R100.set_hit_pct}% of the time; the single best guess, ${R100.top1_pct}%. ${R100.set_hit_pct < 88 ? "Under the 90 it claimed: the over-confidence Part 5 fixes." : "Close to the 90 it claimed."}`],
      show: k => { w2.nodes.style("transition", "fill .6s").attr("fill", i => k >= 1 ? (D.truth.snapshot8[i] ? col(D.fig11.post[i]) : C.light) : C.light); L.show(i => (i === 0 && k >= 2) || (i === 1 && k >= 3)); rep.style.opacity = k >= 4 ? 1 : 0; } };
  };

  // 7 · vaccinate
  R.vax = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const a = el("div"), b = el("div"); a.style.flex = "1.2"; b.style.flex = "1"; row.append(a, b);
    const w = ward(a, { w: 700, h: 500, r: 9 }); let vacc = new Set(), prev = null, plan = ""; const ringV = () => w.ring(vacc, C.blue, 15, 3.5); w.nodes.style("cursor", "pointer").on("click", (ev, i) => { if (vacc.has(i)) vacc.delete(i); else vacc.add(i); ringV(); cnt.textContent = `${vacc.size} vaccinated`; plan = "your plan"; });
    w.svg.append("text").attr("x", w.box.x).attr("y", 30).attr("font-size", 20).attr("font-weight", 600).attr("fill", C.blue).text("click a person to vaccinate them (blue ring)");
    const f = frame(b, 560, 420, { l: 30, r: 24, t: 40, b: 56 }); const x = d3.scaleLinear().domain([0, 76]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]); axes(f, x, y, "people infected, out of 75", "", { noY: true }); const barsG = f.g.append("g"); const ann = f.g.append("g");
    const st = stats(b, [["m", "average"], ["c", "bad day: worst 10%"], ["d", "died out"], ["p", "previous plan: avg / bad day"]]);
    let last = null, base = null, hubs = null; const runIt = () => { const sizes = []; for (let i = 0; i < 300; i++) { let s; do { s = Math.floor(Math.random() * Sim.N); } while (vacc.has(s)); sizes.push(Sim.sir(Sim.W.beta, Sim.W.gamma, s, 40, vacc).cum[40]); } bars(barsG, sizes, x, y); const m = Sim.mean(sizes), cv = Sim.cvar(sizes); ann.selectAll("*").remove(); ann.append("line").attr("x1", x(m)).attr("x2", x(m)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.blue).attr("stroke-width", 3); ann.append("text").attr("x", x(m) - 8).attr("y", 18).attr("text-anchor", "end").attr("font-size", 20).attr("font-weight", 700).attr("fill", C.blue).text(`average ${m.toFixed(0)}`); ann.append("line").attr("x1", x(cv)).attr("x2", x(cv)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.orange).attr("stroke-width", 3); ann.append("text").attr("x", x(cv) + 8).attr("y", 18).attr("font-size", 20).attr("font-weight", 700).attr("fill", C.orange).text(`bad day ${cv.toFixed(0)}`); st.m.textContent = m.toFixed(0); st.c.textContent = cv.toFixed(0); st.d.textContent = fmtPct(sizes.filter(v => v < 15).length / sizes.length); st.p.textContent = prev || "–"; prev = `${m.toFixed(0)} / ${cv.toFixed(0)}`; last = { m: Math.round(m), cv: Math.round(cv) }; if (plan === "no vaccination") base = last; if (plan === "the 8 most connected") hubs = last; f.svg.select("text.ttl").remove(); f.svg.append("text").attr("class", "ttl").attr("x", f.m.l).attr("y", 26).attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text(`300 outbreaks, ${vacc.size} vaccinated${plan ? " (" + plan + ")" : ""}`); };
    const c = controls(e); const cnt = el("span", "", "0 vaccinated");
    const pickHubs = () => { vacc = new Set(d3.range(Sim.N).sort((p, q) => Sim.deg[q] - Sim.deg[p]).slice(0, 8)); ringV(); cnt.textContent = "8 vaccinated"; plan = "the 8 most connected"; };
    button(c, "Run 300 outbreaks", runIt); button(c, "Pick the 8 most connected", pickHubs, true); button(c, "Pick 8 at random", () => { vacc = new Set(); while (vacc.size < 8) vacc.add(Math.floor(Math.random() * Sim.N)); ringV(); cnt.textContent = "8 vaccinated"; plan = "8 at random"; }, true); button(c, "Clear", () => { vacc = new Set(); ringV(); cnt.textContent = "0 vaccinated"; plan = ""; }, true); c.appendChild(cnt);
    const who = () => { const top8 = d3.range(Sim.N).sort((p, q) => Sim.deg[q] - Sim.deg[p]).slice(0, 8), cnts = [0, 0, 0, 0]; top8.forEach(i => cnts[Sim.W.roles[i]]++); const w_ = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"]; const parts = cnts.map((n, r) => n ? `${w_[n]} ${Sim.ROLE_NAME[r]}${n > 1 ? "s" : ""}` : null).filter(Boolean); return parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]; };
    const baseline = () => { vacc = new Set(); ringV(); cnt.textContent = "0 vaccinated"; plan = "no vaccination"; runIt(); };
    const out = { steps: 4, caps: ["Eight doses, before the next outbreak. Patient zero is unknown, so it is drawn at random among the unvaccinated. Click people to vaccinate them.", "No vaccination: 300 outbreaks. The bad day is the average of the worst 10%.", `Vaccinate the eight most connected: ${who()}.`, "The bad day falls far less than the average, and is still a ward-wide outbreak. If the job is to prevent the catastrophe, “best on average” is the wrong objective. Ask the room for their eight."],
      show: k => { if (k === 1) baseline(); if (k === 2) { if (!base) baseline(); pickHubs(); runIt(); } if (k === 3 && (!base || !hubs)) { baseline(); pickHubs(); runIt(); }
        if (base) out.caps[1] = `No vaccination: 300 outbreaks. Average ${base.m}, bad day ${base.cv}. The bad day is the average of the worst 10%.`;
        if (base && hubs) { const drop = Math.round(100 * (1 - hubs.m / base.m)); out.caps[2] = `Vaccinate the eight most connected: ${who()}. The average drops by ${drop}%, ${base.m} to ${hubs.m}.`; out.caps[3] = `The bad day falls far less, ${base.cv} to ${hubs.cv}, and is still a ward-wide outbreak. If the job is to prevent the catastrophe, “best on average” is the wrong objective. Ask the room for their eight.`; } } };
    return out;
  };

  // 7 · picks
  R.picks = (e, D) => {
    const row = el("div", "vrow"); e.appendChild(row); const other = new Set([...D.picks.obs.filter(v => !D.picks.real.includes(v)), ...D.picks.real.filter(v => !D.picks.obs.includes(v))]); const Ls = [];
    [["the 8 most connected in the RECORDED graph", D.picks.obs, D.picks.obs_mean, D.picks.obs_cvar], ["the 8 most connected in the REAL graph", D.picks.real, D.picks.real_mean, D.picks.real_cvar]].forEach(([t, picks, m, cv]) => { const d = el("div"); row.appendChild(d); const w = ward(d, { w: 640, h: 480, r: 7 }); w.nodes.attr("opacity", i => picks.includes(i) ? 1 : .4); const L = Layers(w.svg); Ls.push(L); const l0 = L.add(); l0.selectAll("circle").data(picks).join("circle").attr("cx", i => w.P(i)[0]).attr("cy", i => w.P(i)[1]).attr("r", 15).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 3.5); l0.append("text").attr("x", 320).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 600).attr("fill", C.ink).text(t); l0.append("text").attr("x", 320).attr("y", 470).attr("text-anchor", "middle").attr("font-size", 20).attr("fill", C.muted).text(`average ${m}, bad day ${cv}`); const l1 = L.add(); l1.selectAll("circle").data(picks.filter(v => other.has(v))).join("circle").attr("cx", i => w.P(i)[0]).attr("cy", i => w.P(i)[1]).attr("r", 15).attr("fill", "none").attr("stroke", C.orange).attr("stroke-width", 4); });
    const nDiff = 8 - D.picks.common, wn = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "All eight"];
    return { steps: 3, caps: ["Part 3 again. Pick the eight from the badge data, the recorded graph.", "Pick the eight from the real graph.", nDiff === 0 ? "The same eight people: on this ward the badges saw enough of the hubs. You cannot know that in advance, which is why Han et al. pick the set that works for every graph consistent with the data." : `${wn[nDiff]} of the eight change${nDiff === 1 ? "s" : ""} (orange). Here the outcomes barely differ, but you cannot know that in advance: Han et al. pick the set that works for every graph consistent with the data.`], show: k => { Ls[0].show(k >= 2 ? 2 : 1); Ls[1].show(k >= 2 ? 2 : k >= 1 ? 1 : 0); } };
  };

  // =====================================================================
  // pass 2 · the Part 4 filter, fixed by the three lines (Part 5)
  R.filterfix = (e, D) => {
    const P = D.p2.filterfix, ADD = P.mode === "add", f = frame(e, 1300, 520); const x = d3.scaleLinear().domain([0, 40]).range([0, f.iw]), y = d3.scaleLinear().domain([0, Math.max(45, ADD ? d3.max(D.fig8.hi) + P.q + 2 : d3.max(D.fig8.hi) * P.q + 2)]).range([f.ih, 0]); axes(f, x, y, "day", "people infectious right now", { xt: 8 });
    const L = Layers(f.svg); const half = D.fig8.hi.map((h, t) => 0.5 * (h - D.fig8.lo[t]) + 0.5); const lo2 = D.fig8.md.map((m, t) => Math.max(0, ADD ? m - P.q : m - P.q * half[t])), hi2 = D.fig8.md.map((m, t) => ADD ? m + P.q : m + P.q * half[t]);
    const l0 = L.add().attr("transform", T(f)); bandY(l0, x, y, D.fig8.lo, D.fig8.hi, C.grey, .3); lineY(l0, x, y, D.fig8.md, C.grey, 3); lineY(l0, x, y, D.truth.I, C.red, 3.5); note(l0, x(14), y(D.fig8.hi[14]), "the filter’s own 90% band", 60, -30, C.muted); note(l0, x(16), y(D.truth.I[16]), "the truth", 70, 50, C.red);
    box(l0, f.iw - 420, 8, 410, "20 FRESH OUTBREAKS, BEFORE", [`inside ${P.cov_before}% of days · width ${P.width_before}`]);
    const l1 = L.add().attr("transform", T(f)); bandY(l1, x, y, lo2, hi2, C.blue, .18); l1.append("path").datum(d3.range(41)).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 2.5).attr("stroke-dasharray", "7 5").attr("d", d3.line().x(t => x(t)).y(t => y(hi2[t]))); l1.append("path").datum(d3.range(41)).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 2.5).attr("stroke-dasharray", "7 5").attr("d", d3.line().x(t => x(t)).y(t => y(lo2[t]))); note(l1, x(27), y(hi2[27]), ADD ? `conformal: the filter’s centre ± ${Math.round(P.q)} people` : `the same band × ${P.q.toFixed(2)}`, 40, -70, C.blue);
    box(l1, f.iw - 420, 128, 410, "20 HELD-OUT OUTBREAKS, AFTER", [`inside ${P.cov_after}% of days · width ${P.width_after}`]);
    return { steps: 3, caps: [`Back to Part 4’s filter, on ${P.n_test} more outbreaks, a different twenty from Part 4’s ${D.fig8.rep.coverage}%: its 90% band held the truth ${P.cov_before}% of the time. Same over-confidence.`, ADD ? `Line 1: ${P.n_cal} past outbreaks, ${P.n_cal * 41} days. Line 2: how far the truth sat from the filter’s centre, in people; the 90th percentile is ${Math.round(P.q)}. Line 3: report centre ± ${Math.round(P.q)}.` : `Line 1: ${P.n_cal} past outbreaks. Line 2: how far the truth fell outside, in band-widths; the 90th percentile is ${P.q.toFixed(2)}. Line 3: stretch every band by that factor.`, `On ${P.n_test} outbreaks it had never seen: ${P.cov_after}%. The catch, said again: we calibrated across outbreaks, which are exchangeable, not across days, which are not.`], show: k => L.show(k >= 1 ? 2 : 1) };
  };

  // pass 2 · metrics: coverage, width, interval score, PIT, CRPS
  R.metrics = (e, D) => {
    const M = D.p2.metrics; const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1"; right.style.flex = "1.5"; row.append(left, right);
    const f = frame(left, 520, 480, { l: 56, r: 20, t: 36, b: 56 }); const x = d3.scaleLinear().domain([0, 1]).range([0, f.iw]), y = d3.scaleLinear().domain([0, d3.max(M.pit_hist) * 1.1]).range([f.ih, 0]); axes(f, x, y, "where the truth fell in the forecast distribution", "", { xt: 5, yt: 4 });
    const L = Layers(f.svg); const l0 = L.add().attr("transform", T(f)); l0.selectAll("rect.bar").data(M.pit_hist).join("rect").attr("class", "bar").attr("x", (v, i) => x(i / 10) + 2).attr("width", x(.1) - 4).attr("y", v => y(v)).attr("height", v => f.ih - y(v)).attr("fill", C.orange).attr("rx", 3); l0.append("line").attr("x1", 0).attr("x2", f.iw).attr("y1", y(M.n_pit / 10)).attr("y2", y(M.n_pit / 10)).attr("stroke", C.ink).attr("stroke-dasharray", "7 5").attr("stroke-width", 2); l0.append("text").attr("x", f.iw - 4).attr("y", y(M.n_pit / 10) - 10).attr("text-anchor", "end").attr("font-size", 18).attr("fill", C.ink).text("honest: flat"); l0.append("text").attr("x", f.iw / 2).attr("y", -12).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text("PIT histogram, the simple model of Part 5");
    const R8 = D.fig8.rep; const rowsAll = M.rows.flatMap(r => r.part.startsWith("Part 4") ? [r, { part: `Part 4 · particle filter, ${R8.outbreaks} fresh outbreaks`, cov: R8.coverage, width: R8.width, iscore: "–", crps: null }] : [r]);
    const tbl = el("table", "map metrics"); right.appendChild(tbl); const cols = ["forecaster", "coverage", "width", "interval score", "CRPS"]; tbl.innerHTML = `<tr>${cols.map((c, i) => `<th class="c${i}">${c}</th>`).join("")}</tr>` + rowsAll.map(r => `<tr><td>${r.part}</td><td class="num c1">${r.cov}%</td><td class="num c2">${r.width}</td><td class="num c3">${r.iscore}</td><td class="num c4">${r.crps == null ? "–" : r.crps}</td></tr>`).join("");
    const setCols = n => tbl.querySelectorAll(".c3, .c4").forEach(c => c.style.opacity = (c.classList.contains("c3") && n >= 1) || (c.classList.contains("c4") && n >= 3) ? 1 : 0);
    return { steps: 4, caps: ["Two numbers have scored every part: coverage and width. The field keeps a few more, and they agree with ours.", "The interval score adds them up: the width, plus, for every miss, 20 times the distance by which it missed. One number, lower is better; the Forecast Hub ranks models with its multi-level version, WIS.", "The PIT histogram asks where the truth landed in the forecast distribution. Honest forecasters give a flat histogram; the simple model of Part 5 piles up at one end and in the middle: too narrow, and the wrong shape.", "CRPS scores the whole distribution, not one band: the distance between the forecast’s CDF and the truth. For a Gaussian it is a formula; for 1000 copies, a sum."],
      show: k => { setCols(k); L.show(k >= 2 ? 1 : 0); } };
  };

  // pass 2 · a surrogate: a GP emulator of final size, checked, rebuilt, and fixed
  R.surrogate = (e, D) => {
    const S = D.p2.surrogate, f = frame(e, 1300, 520, { l: 66, r: 70, t: 24, b: 56 }); const x = d3.scaleLinear().domain([0.02, 0.20]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 76]).range([f.ih, 0]); axes(f, x, y, "β, how contagious", "people ever infected", { xt: 9 });
    const yp = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]); const n = S.grid.length, idx = d3.range(n);
    const L = Layers(f.svg); const l0 = L.add().attr("transform", T(f)); l0.selectAll("circle").data(S.xtr).join("circle").attr("cx", v => x(v)).attr("cy", (v, i) => y(S.ytr[i])).attr("r", 6).attr("fill", C.ink); note(l0, x(0.045), y(2), `${S.n_train} simulations: the training set`, 70, -50);
    const l1 = L.add().attr("transform", T(f)); const lo = S.mu.map((m, i) => Math.max(0, m - 1.645 * S.sd[i])), hi = S.mu.map((m, i) => Math.min(76, m + 1.645 * S.sd[i])); l1.append("path").datum(idx).attr("fill", C.grey).attr("opacity", .25).attr("d", d3.area().x(i => x(S.grid[i])).y0(i => y(lo[i])).y1(i => y(hi[i]))); l1.append("path").datum(idx).attr("fill", "none").attr("stroke", C.grey).attr("stroke-width", 3).attr("d", d3.line().x(i => x(S.grid[i])).y(i => y(S.mu[i]))); box(l1, 8, 8, 400, "ONE GAUSSIAN PROCESS, 90% BAND", [`fresh runs inside: ${S.cov_gp}% · width ${S.w_gp}`], C.muted, "#F3F4F6");
    const l2 = L.add().attr("transform", T(f)); const lo2 = S.mu_big.map((m, i) => Math.max(15, m - 1.645 * S.sd_big[i])), hi2 = S.mu_big.map((m, i) => Math.min(76, m + 1.645 * S.sd_big[i])); l2.append("path").datum(idx).attr("fill", C.blue).attr("opacity", .25).attr("d", d3.area().x(i => x(S.grid[i])).y0(i => y(lo2[i])).y1(i => y(hi2[i]))); l2.append("path").datum(idx).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 3).attr("d", d3.line().x(i => x(S.grid[i])).y(i => y(S.mu_big[i])));
    l2.append("path").datum(idx).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 3).attr("stroke-dasharray", "8 5").attr("d", d3.line().x(i => x(S.grid[i])).y(i => yp(S.pdie[i]))); const gr = f.g.append("g").attr("class", "ax-y").attr("transform", `translate(${f.iw},0)`).call(d3.axisRight(yp).ticks(4).tickFormat(d3.format(".0%")).tickSize(0).tickPadding(8)); gr.select(".domain").remove(); gr.selectAll("text").attr("fill", C.ink).attr("font-size", 17); gr.style("opacity", 0); l2.node().__axis = gr;
    note(l2, x(S.grid[8]), yp(S.pdie[8]), "P(dies out | β): a second emulator, dashed", 50, 50, C.ink); note(l2, x(S.grid[30]), y(hi2[30]), "if it takes off: size band", -40, -50, C.blue);
    l2.selectAll("circle").data(S.xte).join("circle").attr("cx", v => x(v)).attr("cy", (v, i) => y(S.yte[i])).attr("r", 4).attr("fill", C.red).attr("opacity", .7); box(l2, f.iw - 430, f.ih - 236, 420, "TWO-PART EMULATOR, BIG BRANCH", [`fresh runs inside: ${S.cov_two}% · width ${S.w_two}`]);
    const l3 = L.add().attr("transform", T(f)); const lo3 = S.mu_big.map((m, i) => Math.max(15, m - S.q * S.sd_big[i])), hi3 = S.mu_big.map((m, i) => Math.min(76, m + S.q * S.sd_big[i])); for (const arr of [lo3, hi3]) l3.append("path").datum(idx).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 2.5).attr("stroke-dasharray", "7 5").attr("d", d3.line().x(i => x(S.grid[i])).y(i => y(arr[i]))); box(l3, f.iw - 430, f.ih - 152, 420, "SAME EMULATOR, CONFORMAL", [`fresh runs inside: ${S.cov_cf}% · width ${S.w_cf}`]);
    return { steps: 4, caps: [`The 3-line algorithm needed thousands of simulations. On a city that is days. So run ${S.n_train} and learn the map from β to the outcome.`, `A Gaussian process, the standard emulator: a smooth mean with a band. It holds ${S.cov_gp}% of fresh runs, but only by being ${S.w_gp} people wide: it fits one hump to a two-hump outcome. Honest and useless.`, `Emulate the shape instead: one emulator for the chance of dying out (dashed, right axis), one for the size if it takes off (blue). Fresh runs (red): of those that take off, ${S.cov_two}% inside, width ${S.w_two}.`, `Part 5’s three lines on the size emulator: ${S.cov_cf}%, width ${S.w_cf}. A surrogate is a model of a model: check it, calibrate it, like any other forecaster.`],
      show: k => { L.show(i => (i === 0) || (i === 1 && k === 1) || (i === 2 && k >= 2) || (i === 3 && k >= 3)); gr.style("opacity", k >= 2 ? 1 : 0); } };
  };

  // pass 2 · deep-learning bands on one ward regressor
  R.dl = (e, D) => {
    const L_ = D.p2.dl, rows = L_.rows; const f = frame(e, 1300, 480, { l: 330, r: 40, t: 50, b: 50 }); const y = d3.scaleBand().domain(rows.map(r => r[0])).range([0, f.ih]).padding(.32); const xc = d3.scaleLinear().domain([0, 100]).range([0, f.iw * .5]), xw = d3.scaleLinear().domain([0, d3.max(rows, r => r[2]) * 1.15]).range([0, f.iw * .36]); const ox = f.iw * .62;
    f.g.append("text").attr("x", xc(50)).attr("y", -20).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text("coverage of the 90% band"); f.g.append("text").attr("x", ox + xw.range()[1] / 2).attr("y", -20).attr("text-anchor", "middle").attr("font-size", 21).attr("font-weight", 600).attr("fill", C.ink).text("width, people");
    f.g.append("line").attr("x1", xc(90)).attr("x2", xc(90)).attr("y1", -4).attr("y2", f.ih).attr("stroke", C.ink).attr("stroke-dasharray", "6 5").attr("stroke-width", 2); f.g.append("text").attr("x", xc(90)).attr("y", f.ih + 28).attr("text-anchor", "middle").attr("font-size", 18).attr("fill", C.ink).text("claimed 90%");
    const L = Layers(f.svg); const cols = [C.orange, C.blue, C.green, C.ink];
    rows.forEach((r, i) => { const g = L.add().attr("transform", T(f)); g.append("text").attr("x", -16).attr("y", y(r[0]) + y.bandwidth() / 2 + 8).attr("text-anchor", "end").attr("font-size", 23).attr("font-weight", 600).attr("fill", C.ink).text(r[0]); g.append("rect").attr("class", "bar").attr("x", 0).attr("y", y(r[0])).attr("height", y.bandwidth()).attr("width", xc(r[1])).attr("fill", r[1] >= 85 ? C.blue : C.orange).attr("rx", 6); g.append("text").attr("x", xc(r[1]) + 10).attr("y", y(r[0]) + y.bandwidth() / 2 + 9).attr("font-size", 24).attr("font-weight", 700).attr("font-family", F.disp).attr("fill", C.ink).text(r[1] + "%"); g.append("rect").attr("class", "bar").attr("x", ox).attr("y", y(r[0])).attr("height", y.bandwidth()).attr("width", xw(r[2])).attr("fill", C.light).attr("rx", 6); g.append("text").attr("x", ox + xw(r[2]) + 10).attr("y", y(r[0]) + y.bandwidth() / 2 + 9).attr("font-size", 24).attr("font-weight", 700).attr("font-family", F.disp).attr("fill", C.ink).text(r[2]); });
    f.g.append("text").attr("x", f.iw / 2 - 100).attr("y", f.ih + 44).attr("text-anchor", "middle").attr("font-size", 17).attr("fill", C.muted).text(`a 3-input network (${L_.inputs}) predicting ${L_.target}; ${L_.n_train} training runs, ${L_.n_cal} calibration, ${L_.n_test} test; trained live in numpy, ${L_.secs} s`);
    const verdict = c => c < 85 ? "over-confident" : c > 95 ? "wider than it needs to be" : "honest, this time";
    return { steps: 4, caps: [`A neural network that predicts the final size from β, γ and patient zero, with its own “give or take” output. Its 90% band holds ${rows[0][1]}%: ${verdict(rows[0][1])}. The width is Part 1’s luck: most of the spread is irreducible.`, `Train five from different random starts and pool them, a deep ensemble: the disagreement between them is the model’s own doubt. ${rows[1][1]}%, width ${rows[1][2]}.`, `MC dropout: one net, dropout left on at prediction time, 50 passes. ${rows[2][1]}%, width ${rows[2][2]}. Both are heuristics: sometimes right, never a promise, and only the check tells you which.`, `The three lines again, on the first net: ${rows[3][1]}%, width ${rows[3][2]}, guaranteed. Wider than the ward, because the final size is a die-out or a sweep and one band must straddle both; Part 2’s emulator split them and got ${D.p2.surrogate.w_two}. Any deep model, any band: the recipe does not care what is inside.`],
      show: k => L.show(k + 1) };
  };

  // pass 2 · the same loop at 10^4 and 10^5 nodes
  R.scale = (e, D) => {
    const S = D.p2.scale; const tbl = el("table", "map scale"); e.appendChild(tbl);
    const fmt = n => n >= 1000 ? n.toLocaleString("en-US") : n;
    tbl.innerHTML = `<tr><th>nodes</th><th>edges</th><th>one 40-day run</th><th>2000 runs (Part 1)</th><th>filter, 100 copies, 40 days (Part 4)</th><th>conformal quantile (Part 5)</th><th>90% band of the final size</th></tr>` + S.rows.map(r => `<tr><td class="num">${fmt(r.n)}</td><td class="num">${fmt(r.edges)}</td><td class="num">${r.run_s < 0.01 ? "< 10 ms" : r.run_s.toFixed(2) + " s"}</td><td class="num">${r.mc2000_min * 60 < 1 ? "< 1 s" : r.mc2000_min < 1 ? Math.round(r.mc2000_min * 60) + " s" : r.mc2000_min.toFixed(1) + " min"}</td><td class="num">${r.pf_40days_100copies_min * 60 < 1 ? "< 1 s" : r.pf_40days_100copies_min < 1 ? Math.round(r.pf_40days_100copies_min * 60) + " s" : r.pf_40days_100copies_min.toFixed(1) + " min"}</td><td class="num">${r.conformal_s < 0.001 ? "< 1 ms" : Math.round(r.conformal_s * 1000) + " ms"}</td><td class="num">${r.attack_lo} – ${r.attack_hi}</td></tr>`).join("");
    const trs = [...tbl.querySelectorAll("tr")].slice(1); trs.forEach(t => t.style.opacity = 0);
    const p = el("p", "small muted", `${S.machine}. ${S.note}.`); e.appendChild(p);
    return { steps: 4, caps: ["The ward, 75 people: every tool today ran in seconds. Measured, not estimated.", `Ten thousand nodes, a preferential-attachment graph with hubs like our nurses: one run takes ${S.rows[1].run_s.toFixed(2)} s and 2000 runs ${Math.round(S.rows[1].mc2000_min * 60)} seconds. The filter with 100 copies tracks 40 days in ${Math.round(S.rows[1].pf_40days_100copies_min * 60)} seconds. Nothing hurts yet.`, `A hundred thousand nodes: 2000 runs is ${S.rows[2].mc2000_min} minutes, the filter with 100 copies about ${Math.round(S.rows[2].pf_40days_100copies_min * 60)} seconds per 40 days, and 100 copies are not enough in that many dimensions. Conformal is still one quantile.`, "At a million nodes the simulation runs parallelise for free; the filter needs local or ensemble versions; posteriors need surrogates. That is the cost column of the map, measured."],
      show: k => trs.forEach((t, i) => { t.style.transition = "opacity .4s"; t.style.opacity = i <= Math.min(k, 2) ? 1 : 0; }) };
  };

  // pass 2 · which method when
  R.flow = (e, D) => {
    const svg = svgIn(e, 1300, 540); const L = Layers(svg);
    const qbox = (g, x, y, w, txt) => { g.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", 64).attr("rx", 14).attr("fill", C.blueSoft); g.append("text").attr("x", x + w / 2).attr("y", y + 39).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 600).attr("fill", C.ink).text(txt); };
    const abox = (g, x, y, w, lines, col = C.orangeSoft) => { g.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", 30 + 26 * lines.length).attr("rx", 12).attr("fill", col); lines.forEach((t, i) => g.append("text").attr("x", x + w / 2).attr("y", y + 32 + 26 * i).attr("text-anchor", "middle").attr("font-size", 19).attr("font-weight", i ? 400 : 600).attr("fill", C.ink).text(t)); };
    const arrow = (g, x1, y1, x2, y2, lab) => { g.append("line").attr("class", "draw").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2).attr("stroke", C.muted).attr("stroke-width", 2.5); if (lab) g.append("text").attr("x", (x1 + x2) / 2 + 8).attr("y", (y1 + y2) / 2 + 6).attr("font-size", 18).attr("fill", C.muted).attr("font-weight", 600).text(lab); };
    const steps = [
      ["Can you run the simulator thousands of times?", ["no: fit a surrogate first (Part 2)", "then check it like any model"], ["yes: Monte Carlo, quantiles (Part 1)"]],
      ["Which inputs are unknown?", ["the numbers: a posterior (Part 2)", "then sensitivity: which to measure"], ["the graph: sample graphs (Part 3)", "and rerun"]],
      ["Can you see the state, or only a few tests?", ["a few tests: a filter (Part 4)", "the map says whom to test next"], ["the whole state: no filter needed"]],
      ["Do you have past cases it was not trained on?", ["yes: conformal (Part 5)", "exchangeable units; adapt under drift"], ["no: an ensemble, checked live"]],
      ["Is a decision riding on it?", ["yes: optimise against the set (Part 7)", "average · bad day · worst case"], ["no: report the band and its check"]],
    ];
    steps.forEach((st, i) => { const g = L.add(); const y = 10 + i * 104; qbox(g, 20, y, 470, st[0]); arrow(g, 490, y + 32, 540, y + 32); abox(g, 540, y, 400, st[1]); arrow(g, 940, y + 32, 980, y + 32); abox(g, 980, y, 310, st[2], "#F3F4F6"); if (i < steps.length - 1) arrow(g, 255, y + 64, 255, y + 104); });
    return { steps: 5, caps: ["Five questions, in the order you would ask them on Monday. First: can you afford to run the model thousands of times?", "Second: what don’t you know? The numbers get a posterior; the graph gets a distribution of graphs. Both are random variables you push through the model.", "Third: can you see the state? If you only have a few noisy tests, you need a filter, and the filter tells you whom to test next.", "Fourth: do you have past cases to calibrate on? Then three lines give any model a guarantee. If not, an ensemble, and keep checking.", "Last: is a decision riding on it? Then optimise against the set, and choose the notch of the risk dial before you choose the people."],
      show: k => L.show(k + 1) };
  };

  // pass 2 · the risk dial: three plans for eight doses
  R.riskdial = (e, D) => {
    const R_ = D.p2.dial, order = R_.order, cols = [C.blue, C.orange, C.ink]; const row = el("div", "vrow"); e.appendChild(row); const left = el("div"), right = el("div"); left.style.flex = "1"; right.style.flex = "1.15"; row.append(left, right);
    const w = ward(left, { w: 560, h: 500, r: 7 }); w.nodes.attr("opacity", .45); const L = Layers(w.svg); const ringL = order.map((lab, i) => { const g = L.add(); g.selectAll("circle").data(R_.plans[lab].set).join("circle").attr("cx", v => w.P(v)[0]).attr("cy", v => w.P(v)[1]).attr("r", 15 - 3 * i).attr("fill", "none").attr("stroke", cols[i]).attr("stroke-width", 3.2); return g; });
    w.legend(order.map((lab, i) => [cols[i], lab, true]), null, 492);
    const f = frame(right, 640, 500, { l: 20, r: 20, t: 24, b: 56 }); const x = d3.scaleLinear().domain([0, 76]).range([0, f.iw]); axes(f, x, d3.scaleLinear().domain([0, 1]).range([f.ih, 0]), "people infected, out of 75", "", { noY: true, xt: 8 });
    const L2 = Layers(f.svg); const rowH = f.ih / 3; f.g.select(".ax-x").selectAll("line").attr("stroke", "none");
    order.forEach((lab, i) => { const g = L2.add().attr("transform", T(f)); const pl = R_.plans[lab]; const y0 = i * rowH; const bins = d3.bin().domain([0, 76]).thresholds(38)(pl.sizes); const ymax = d3.max(bins, b => b.length); const y = d3.scaleLinear().domain([0, ymax]).range([y0 + rowH - 6, y0 + 30]);
      g.selectAll("rect.bar").data(bins).join("rect").attr("class", "bar").attr("x", b => x(b.x0) + 1).attr("width", b => Math.max(1, x(b.x1) - x(b.x0) - 2)).attr("y", b => y(b.length)).attr("height", b => y(0) - y(b.length)).attr("fill", cols[i]).attr("opacity", .55).attr("rx", 2);
      [[pl.mean, "average", C.blue], [pl.cvar, "bad day", C.orange], [pl.worst, "worst", C.ink]].forEach(([v, t, c], j) => { g.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", y0 + 28).attr("y2", y0 + rowH - 6).attr("stroke", c).attr("stroke-width", j === i ? 4 : 2).attr("stroke-dasharray", j === i ? null : "4 4"); g.append("text").attr("x", x(v)).attr("y", y0 + (j === 1 ? 24 : 8)).attr("text-anchor", j === 2 ? "start" : j === 1 ? "end" : "middle").attr("dx", j === 2 ? 4 : j === 1 ? -4 : 0).attr("font-size", 17).attr("font-weight", j === i ? 700 : 400).attr("fill", c).text(`${t} ${Math.round(v)}`); });
      g.append("text").attr("x", x(6)).attr("y", y0 + rowH - 14).attr("font-size", 20).attr("font-weight", 700).attr("fill", cols[i]).text(`pick for the ${lab}`); });
    const WN = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "All eight"]; const same = (a, b) => a.length === b.length && a.every(v => b.includes(v)); const p0 = R_.plans[order[0]], p1 = R_.plans[order[1]], p2 = R_.plans[order[2]]; const swap12 = p1.set.filter(v => !p0.set.includes(v)).length, swap23 = p2.set.filter(v => !p1.set.includes(v)).length;
    return { steps: 4, caps: [`Notch 1, the average. Greedy search over the 25 most connected for the eight that minimise the average outbreak: average ${Math.round(p0.mean)}, bad day ${Math.round(p0.cvar)}, worst ${p0.worst}.`, same(p0.set, p1.set) ? `Notch 2, the bad day: minimise the average of the worst 10% (CVaR). On this ward it picks the same eight people: the hubs dominate every notch.` : `Notch 2, the bad day: minimise the average of the worst 10% (CVaR). ${WN[swap12]} of the eight change${swap12 === 1 ? "s" : ""}: bad day ${Math.round(p1.cvar)} against ${Math.round(p0.cvar)}.`, `Notch 3, the worst case: minimise the single worst scenario. ${WN[swap23]} ${swap23 === 1 ? "person changes" : "people change"}; worst ${p2.worst} against ${p1.worst}, average ${Math.round(p2.mean)} against ${Math.round(p1.mean)}. On this ward the notches nearly agree.`, `${WN[R_.common]} of the eight are in all three plans. That is this ward: one tight hub. On a graph with several communities the notches disagree, and the notch is a choice about whose bad day you protect. Between 2 and 3 sits “distributionally robust”: best across every distribution close to the data.`],
      show: k => { ringL.forEach((g, i) => g.style("opacity", i <= k ? 1 : 0)); L2.show(Math.min(3, k + 1)); } };
  };

  // pass 3 · Tool 1's check as a figure: the 2000 runs, the band we reported, and the share it holds
  R.toolcheck = (e, D) => {
    const F2 = D.fig2, vals = F2.finals, f = frame(e, 760, 440, { l: 60, r: 20, t: 30, b: 56 }); const x = d3.scaleLinear().domain([0, 76]).range([0, f.iw]), y = d3.scaleLinear().range([f.ih, 0]);
    const L = Layers(f.svg); const l0 = L.add().attr("transform", T(f)); const bins = bars(l0, vals, x, y, { bins: 38 }); axes(f, x, y, "people ever infected, out of 75", "runs", { xt: 8, yt: 4 }); l0.selectAll("rect.bar").attr("fill", C.grey);
    const big = vals.filter(v => v >= 15), lo = F2.big_lo, hi = F2.big_hi, inside = big.filter(v => v >= lo && v <= hi).length / big.length;
    const l1 = L.add().attr("transform", T(f)); l1.append("rect").attr("x", x(lo)).attr("width", x(hi) - x(lo)).attr("y", 0).attr("height", f.ih).attr("fill", C.blue).attr("opacity", .18); l1.selectAll("rect.bar").data(bins.filter(b => b.x0 >= lo - 1 && b.x1 <= hi + 1)).join("rect").attr("class", "bar").attr("x", b => x(b.x0) + 1).attr("width", b => Math.max(1, x(b.x1) - x(b.x0) - 2)).attr("y", b => y(b.length)).attr("height", b => y(0) - y(b.length)).attr("fill", C.blue).attr("rx", 2);
    note(l1, x((lo + hi) / 2), y(d3.max(bins, b => b.length)), `the band we report: ${lo} to ${hi}`, -40, -10, C.blue); l1.append("rect").attr("x", x(0)).attr("width", x(15)).attr("y", 0).attr("height", f.ih).attr("fill", C.light).attr("opacity", .6); note(l1, x(7), y(d3.max(bins, b => b.length) * .55), `dies out: ${Math.round(100 * F2.p_dieout)}%,\nreported as its own number`, 60, -30, C.ink, 19);
    const l2 = L.add().attr("transform", T(f)); box(l2, f.iw * .17, f.ih * .6, f.iw * .54, "DID THE BAND COVER THE TRUTH?", [`big-outbreak runs inside: ${fmtPct(inside)} · width ${hi - lo}`]);
    return { steps: 3, caps: [`Two thousand runs of the model. Tool 1 reads the histogram, nothing more.`, `Report two things: the chance it dies out, ${Math.round(100 * F2.p_dieout)}%, and the 5%–95% range of the runs that take off, ${lo} to ${hi}.`, `The check: of the runs that took off, ${fmtPct(inside)} sit in the band. At least 90% by construction, because here the model is the truth. From Part 2 on it won’t be.`], show: k => L.show(k + 1) };
  };

  // pass 3 · the 3-line recipe as a figure: the calibration errors, the 90th-percentile cut, and forecast ± q
  R.recipe = (e, D) => {
    const abs = D.fig10.res_cal.map(Math.abs), n = abs.length, qh = Sim.q(abs, Math.min(1, Math.ceil((n + 1) * .9) / n)); const f = frame(e, 760, 440, { l: 56, r: 20, t: 30, b: 100 }); const x = d3.scaleLinear().domain([0, d3.max(abs) + 1]).range([0, f.iw]), y = d3.scaleLinear().range([f.ih, 0]);
    const L = Layers(f.svg); const l0 = L.add().attr("transform", T(f)); const bins = bars(l0, abs, x, y, { bins: 40, color: C.ink }); axes(f, x, y, "", "", { xt: 8, yt: 3, noY: true }); f.g.append("text").attr("x", f.iw / 2).attr("y", f.ih + 92).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text("|truth − forecast| on the calibration cases, people"); l0.append("text").attr("x", 0).attr("y", -10).attr("font-size", 19).attr("font-weight", 600).attr("fill", C.ink).text(`${n} calibration cases, scored once each`);
    const l1 = L.add().attr("transform", T(f)); l1.append("rect").attr("x", x(qh)).attr("width", f.iw - x(qh)).attr("y", 0).attr("height", f.ih).attr("fill", C.orangeSoft); l1.append("line").attr("class", "draw").attr("x1", x(qh)).attr("x2", x(qh)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.orange).attr("stroke-width", 3); l1.append("text").attr("x", x(qh) + 8).attr("y", 24).attr("font-size", 20).attr("font-weight", 700).attr("fill", C.orange).text(`q = ${qh.toFixed(1)}: the 90th percentile`); l1.append("text").attr("x", x(qh) + 8).attr("y", 48).attr("font-size", 18).attr("fill", C.orange).text("10% of past errors were larger");
    const l2 = L.add().attr("transform", T(f)); const yb = f.ih + 44; l2.append("line").attr("class", "draw").attr("x1", x(0)).attr("x2", x(qh)).attr("y1", yb).attr("y2", yb).attr("stroke", C.blue).attr("stroke-width", 5); l2.append("text").attr("x", x(0)).attr("y", yb + 24).attr("text-anchor", "start").attr("font-size", 19).attr("font-weight", 600).attr("fill", C.blue).text(`report forecast ± ${qh.toFixed(1)}: holds 90% of the time`);
    return { steps: 3, caps: [], show: k => L.show(k + 1) };
  };

  // pass 3 · every band in the deck on one line: what it claimed against what it delivered
  R.dumbbell = (e, D) => {
    const F2 = D.fig2, big = F2.finals.filter(v => v >= 15), c1 = Math.round(100 * big.filter(v => v >= F2.big_lo && v <= F2.big_hi).length / big.length), P2 = D.p2 || {};
    const rows = [["Part 1 · 2000 runs, big branch", c1, F2.big_hi - F2.big_lo], ["Part 2 · fan, every plausible β", Math.round(100 * D.fig4.coverage), D.fig4.width20], ["Part 3 · recorded graph", D.fig6.cov_recorded, D.fig6.width_recorded], ["Part 3 · plausible graphs", D.fig6.cov_plausible, D.fig6.width_plausible], ["Part 4 · filter, 20 fresh outbreaks", D.fig8.rep.coverage, D.fig8.rep.width]]
      .concat(P2.filterfix ? [["Part 5 · the filter, conformal", P2.filterfix.cov_after, P2.filterfix.width_after]] : []).concat([["Part 5 · simple model, its own ± 2", D.fig10.naive_cov, D.fig10.naive_width], ["Part 5 · simple model, conformal", D.fig10.conf_cov, Math.round(D.fig10.conf_width)]])
      .concat(P2.surrogate ? [["Part 2 · one GP surrogate", P2.surrogate.cov_gp, P2.surrogate.w_gp], ["Part 2 · two-part surrogate, conformal", P2.surrogate.cov_cf, P2.surrogate.w_cf]] : []).concat(P2.dl ? P2.dl.rows.map(r => [`Part 5 · ${r[0]}`, r[1], r[2]]) : []).concat([["Part 6 · 90% suspect set (people)", D.rep100.set_hit_pct, D.rep100.set_size]]);
    const f = frame(e, 1300, 520, { l: 420, r: 215, t: 36, b: 50 }); const x = d3.scaleLinear().domain([0, 100]).range([0, f.iw]), y = d3.scaleBand().domain(rows.map(r => r[0])).range([0, f.ih]).padding(.25);
    const gx = f.g.append("g").attr("class", "ax-x").attr("transform", `translate(0,${f.ih})`).call(d3.axisBottom(x).ticks(5).tickSize(-f.ih).tickPadding(8).tickFormat(v => v + "%")); gx.select(".domain").remove(); gx.selectAll("line").attr("stroke", C.line); gx.selectAll("text").attr("fill", C.muted).attr("font-size", 17);
    f.g.append("line").attr("x1", x(90)).attr("x2", x(90)).attr("y1", -8).attr("y2", f.ih).attr("stroke", C.ink).attr("stroke-dasharray", "6 5").attr("stroke-width", 2); f.g.append("text").attr("x", x(90)).attr("y", -14).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 600).attr("fill", C.ink).text("claimed: 90%"); f.g.append("text").attr("x", f.iw + 80).attr("y", -14).attr("font-size", 17).attr("fill", C.muted).text("width");
    const L = Layers(f.svg); const l0 = L.add().attr("transform", T(f)), l1 = L.add().attr("transform", T(f)), l2 = L.add().attr("transform", T(f));
    rows.forEach(([lab, cov, wd]) => { const cy = y(lab) + y.bandwidth() / 2, over = cov < 85; l0.append("text").attr("x", -14).attr("y", cy + 6).attr("text-anchor", "end").attr("font-size", 18).attr("fill", C.ink).text(lab); l0.append("circle").attr("cx", x(90)).attr("cy", cy).attr("r", 7).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 2.5);
      l1.append("line").attr("class", "draw").attr("x1", x(90)).attr("x2", x(cov)).attr("y1", cy).attr("y2", cy).attr("stroke", over ? C.orange : C.blue).attr("stroke-width", 3); l1.append("circle").attr("cx", x(cov)).attr("cy", cy).attr("r", 8).attr("fill", over ? C.orange : C.blue); l1.append("text").attr("x", x(cov) + (cov >= 90 ? 14 : -14)).attr("y", cy + 6).attr("text-anchor", cov >= 90 ? "start" : "end").attr("font-size", 17).attr("font-weight", 600).attr("fill", over ? C.orange : C.blue).text(cov + "%"); l1.append("text").attr("x", f.iw + 80).attr("y", cy + 6).attr("font-size", 17).attr("fill", C.ink).text(wd); });
    const nOver = rows.filter(r => r[1] < 85).length; const safeRow = rows.findIndex((r, i) => i >= 2 && rows.slice(i, i + 4).length === 4 && rows.slice(i, i + 4).every(q => q[1] >= 85)); box(l2, 8, safeRow >= 0 ? y(rows[safeRow][0]) - 4 : f.ih - 100, 372, "THE COUNT", [`${nOver} of ${rows.length} bands under 85%`, `every one caught by the check, not the method`]);
    return { steps: 3, caps: [`${rows.length} bands, all of which claimed 90%. The hollow dot is the claim.`, "The filled dot is what the check found. Blue: honest, or wider than it needed to be. Orange: over-confident.", `${["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][nOver] || nOver} were over-confident. No method on this list knew that about itself; the check is what told us, and the three lines are what fixed the ones we fixed. The width column is the price each one paid.`], show: k => L.show(k + 1) };
  };

  // ---------- caption + beat plumbing ----------
  const mounted = new WeakMap();

  // =====================================================================
  // Part 0 · why graphs. Four things that spread on a graph, each alive in its own panel.
  // The ward is real; the other three graphs are synthetic illustrations built from a seeded generator, so they are
  // the same on every machine. Colours follow the state contract: light = untouched, red = active, amber = done.
  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const nbList = (n, edges) => { const nb = Array.from({ length: n }, () => []); for (const [a, b] of edges) { nb[a].push(b); nb[b].push(a); } return nb; };
  // preferential attachment: a social graph with hubs
  const socialGraph = (n, seed) => { const rnd = mulberry(seed), edges = [[0, 1], [1, 2], [0, 2]], ends = [0, 1, 1, 2, 0, 2]; for (let i = 3; i < n; i++) { const m = rnd() < .35 ? 2 : 1; const picked = new Set(); while (picked.size < m) picked.add(ends[Math.floor(rnd() * ends.length)]); for (const j of picked) { edges.push([i, j]); ends.push(i, j); } } return edges; };
  // a lattice with some links missing: a transmission grid
  const latticeGraph = (cols, rows, keep, seed) => { const rnd = mulberry(seed), edges = [], id = (c, r) => r * cols + c; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (c + 1 < cols && rnd() < keep) edges.push([id(c, r), id(c + 1, r)]); if (r + 1 < rows && rnd() < keep) edges.push([id(c, r), id(c, r + 1)]); } return edges; };
  const latticePos = (cols, rows, w, h, jitter, seed) => { const rnd = mulberry(seed), pos = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pos.push([14 + c * (w - 28) / (cols - 1) + jitter * (rnd() - .5), 14 + r * (h - 28) / (rows - 1) + jitter * (rnd() - .5)]); return pos; };
  const forcePos = (n, edges, w, h, seed) => { const rnd = mulberry(seed); const nodes = d3.range(n).map(i => ({ i, x: w * rnd(), y: h * rnd() })); const links = edges.map(([a, b]) => ({ source: a, target: b })); const sim = d3.forceSimulation(nodes).randomSource(rnd).force("link", d3.forceLink(links).distance(26).strength(.5)).force("charge", d3.forceManyBody().strength(-55)).force("center", d3.forceCenter(w / 2, h / 2)).force("collide", d3.forceCollide(8)).stop(); for (let k = 0; k < 300; k++) sim.tick(); const xs = nodes.map(d => d.x), ys = nodes.map(d => d.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return nodes.map(d => [12 + (d.x - x0) / (x1 - x0) * (w - 24), 12 + (d.y - y0) / (y1 - y0) * (h - 24)]); };
  // SIR-type spread on any graph; returns one frame (Uint8Array of states) per day
  const spreadFrames = (nb, beta, gamma, src, T, rnd) => { const n = nb.length, s = new Uint8Array(n); s[src] = 1; const fr = [new Uint8Array(s)]; for (let t = 0; t < T; t++) { const nw = [], rc = []; for (let i = 0; i < n; i++) { if (s[i] === 0) { let k = 0; for (const j of nb[i]) if (s[j] === 1) k++; if (k && rnd() < 1 - Math.pow(1 - beta, k)) nw.push(i); } else if (s[i] === 1 && rnd() < gamma) rc.push(i); } for (const i of nw) s[i] = 1; for (const i of rc) s[i] = 2; fr.push(new Uint8Array(s)); if (!nw.length && !rc.length && !s.includes(1)) break; } return fr; };
  // a local load-redistribution cascade in the spirit of Motter & Lai 2002 (they use betweenness load and recompute it globally): load = degree,
  // capacity = (1 + α) × load; a failed node hands its load to its working neighbours; whoever is over capacity fails next.
  // α is lowered in small steps until the cascade reaches between 40% and 85% of the grid, so the panel shows a partial blackout, not a wipe-out.
  const cascadeFrames = (nb, src) => { const n = nb.length; let fallback = null; for (const alpha of [0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1]) { const load = nb.map(a => a.length), cap = load.map(l => (1 + alpha) * l + .01), s = new Uint8Array(n); s[src] = 1; const fr = [new Uint8Array(s)]; for (let step = 0; step < 14; step++) { const just = []; for (let i = 0; i < n; i++) if (s[i] === 1) just.push(i); if (!just.length) break; for (const i of just) { const alive = nb[i].filter(j => s[j] === 0); for (const j of alive) load[j] += load[i] / alive.length; s[i] = 2; } for (let i = 0; i < n; i++) if (s[i] === 0 && load[i] > cap[i]) s[i] = 1; fr.push(new Uint8Array(s)); } const reached = fr[fr.length - 1].filter(v => v).length / n; if (reached >= .4 && reached <= .85) return fr; if (reached >= .4 && !fallback) fallback = fr; } return fallback || [new Uint8Array(n)]; };
  R.spreads = (e, D) => {
    const row = el("div", "fourq grid"); e.appendChild(row); const W = 420, H = 270; const rnd = mulberry(7);
    const panel = (k, h, a) => { const p = el("div", "fq"); row.appendChild(p); const txt = el("div", "txt"); p.appendChild(txt); txt.appendChild(el("p", "k", k)); txt.appendChild(el("h3", null, h)); const pa = el("p", "a", a); txt.appendChild(pa); const fig = el("div", "figbox"); p.appendChild(fig); return { p, fig, a: pa }; };
    // the real record behind a drawing: an image over the figbox, shown on the last beat, with its own caption
    const real = (q, src, cap, labels) => { const r = el("div", "real"); if (labels) r.appendChild(el("div", "lab", labels.map(s => `<span>${s}</span>`).join(""))); const im = el("img"); im.src = IMG(src); im.alt = ""; r.appendChild(im); q.fig.appendChild(r); q.p.__real = { cap, drawn: q.a.textContent, a: q.a }; };
    // a small graph drawing with a state painter; roads draw the jam on the streets, the others on the nodes
    const graph = (fig, pos, edges, opt = {}) => { const svg = svgIn(fig, W, H); const eg = svg.append("g").selectAll("line").data(edges).join("line").attr("x1", d => pos[d[0]][0]).attr("y1", d => pos[d[0]][1]).attr("x2", d => pos[d[1]][0]).attr("y2", d => pos[d[1]][1]).attr("stroke", C.grey).attr("stroke-opacity", opt.roads ? .9 : .45).attr("stroke-width", opt.roads ? 5 : 1.1).attr("stroke-linecap", "round"); const deg = nbList(pos.length, edges).map(a => a.length); const ng = svg.append("g").selectAll("circle").data(d3.range(pos.length)).join("circle").attr("cx", i => pos[i][0]).attr("cy", i => pos[i][1]).attr("r", i => opt.roads ? 3.2 : opt.r ? opt.r(deg[i]) : 4.5).attr("fill", C.light).attr("stroke", "#fff").attr("stroke-width", 1);
      return s => { ng.attr("fill", i => Sim.STATE[s[i]]); if (opt.roads) eg.attr("stroke", d => (s[d[0]] && s[d[1]]) ? (s[d[0]] === 1 || s[d[1]] === 1 ? C.red : C.amber) : C.grey); } };
    const P = [];
    // 1 · the real ward, a virus
    { const q = panel("Disease · a hospital ward", "Who gets sick depends on who met whom", "The real ward of this tutorial: 75 people, four days of badge contacts, one virus running."); const w = ward(q.fig, { w: W, h: H, r: 5, pad: 8, padT: 6, padB: 6 }); w.edges.attr("stroke-opacity", .25).attr("stroke-width", 1); w.nodes.attr("stroke-width", .8);
      P.push({ p: q.p, paint: s => w.state(s), make: () => { const fr = []; Sim.sir(Sim.W.beta, Sim.W.gamma, Sim.W.src, 30, null, (t, s) => fr.push(new Uint8Array(s))); return fr; } }); }
    // 2 · a social network, a rumour
    { const n = 80, edges = socialGraph(n, 11), nb = nbList(n, edges), pos = forcePos(n, edges, W, H, 5); const q = panel("Rumours · social network", "A false claim reaches the hubs first", "During COVID a rumour and the virus never touched, yet coupled through what people chose to do."); real(q, "cinelli_fig2_top.png", "The record: who posted about COVID, day by day, early 2020. Fitted like an epidemic, R₀ and all."); const deg = nb.map(a => a.length), md = Math.max(...deg); const paint = graph(q.fig, pos, edges, { r: d => 3 + 7 * Math.sqrt(d / md) }); const leaves = d3.range(n).filter(i => deg[i] === 1);
      P.push({ p: q.p, paint, make: () => spreadFrames(nb, .45, .12, leaves[Math.floor(rnd() * leaves.length)], 30, rnd) }); }
    // 3 · a power grid, a cascade
    { const cols = 10, rows = 6, n = cols * rows, edges = latticeGraph(cols, rows, .8, 21), nb = nbList(n, edges), pos = latticePos(cols, rows, W, H, 22, 23); const q = panel("Failures · a power grid", "One line trips, its load moves next door", "Neighbours overload and trip in turn. The 2003 North American blackout left 50 million people without power."); real(q, "blackout_pair.jpg", "The record: night lights the evening before, and at 21:03 on 14 August 2003, Toronto to New York gone dark (NOAA/DMSP).", ["13 August 2003", "14 August, 21:03"]); const paint = graph(q.fig, pos, edges, {}); const hubs = d3.range(n).filter(i => nb[i].length >= 3);
      P.push({ p: q.p, paint, make: () => cascadeFrames(nb, hubs[Math.floor(rnd() * hubs.length)]) }); }
    // 4 · a road network, a jam
    { const cols = 10, rows = 6, n = cols * rows, edges = latticeGraph(cols, rows, 1.01, 1), nb = nbList(n, edges), pos = latticePos(cols, rows, W, H, 0, 1); const q = panel("Traffic · a road network", "A blocked street jams the next one", "Flow on one street depends on flow on all the others. Each of these is a graph plus a dynamic on it, and each forecast of it needs error bars."); const paint = graph(q.fig, pos, edges, { roads: true });
      P.push({ p: q.p, paint, make: () => spreadFrames(nb, .26, .22, Math.floor(rnd() * n), 40, rnd) }); }
    // the loops: each panel replays a fresh run while its slide is up; print and reduced motion show the end of one run
    const section = e.closest("section"); let on = 0;
    P.forEach((q, i) => { q.frames = q.make(); q.k = 0; q.hold = 0; q.paint(q.frames[0]); });
    const tick = () => { if (window.Reveal && Reveal.getCurrentSlide && Reveal.getCurrentSlide() !== section) return; P.forEach((q, i) => { if (i >= on) return; if (q.k >= q.frames.length) { if (q.hold++ < 5) return; q.hold = 0; q.frames = q.make(); q.k = 0; } q.paint(q.frames[q.k++]); }); };
    let timer = null; if (!reduce()) timer = setInterval(() => { if (!e.isConnected) { clearInterval(timer); return; } tick(); }, 330);
    // print and reduced motion: the frame with the most activity, so the page shows the spreading rather than the aftermath
    const liveliest = fr => fr.reduce((b, f, i) => f.filter(v => v === 1).length > fr[b].filter(v => v === 1).length ? i : b, 0);
    return { steps: 5, caps: [], show: k => { on = Math.min(k, 3) + 1; P.forEach((q, i) => { q.p.classList.toggle("on", i <= k); if (reduce() && i <= k) q.paint(q.frames[liveliest(q.frames)]); const r = q.p.__real; if (r) { q.p.classList.toggle("show-real", k >= 4); r.a.textContent = k >= 4 ? r.cap : r.drawn; } }); } };
  };

  // Part 0 · graphs are everywhere: five real networks drawn from their data, each with something moving on it
  R.everywhere = (e, D) => {
    const E = D.everywhere.panels, G = D.geo; const row = el("div", "fourq every"); e.appendChild(row); const fmt = n => n.toLocaleString("en-US");
    const card = (cls, k, h, a) => { const p = el("div", "fq" + (cls ? " " + cls : "")); row.appendChild(p); const txt = el("div", "txt"); p.appendChild(txt); txt.appendChild(el("p", "k", k)); txt.appendChild(el("h3", null, h)); txt.appendChild(el("p", "a", a)); const fig = el("div", "figbox"); p.appendChild(fig); return { p, fig }; };
    const P = [];
    // a graph panel: one path for every edge, a circle per node, positions precomputed in figures/make_everywhere.py
    const draw = (fig, pos, edges, r, W, H) => { const svg = svgIn(fig, W, H); const pad = 10; const X = i => pad + pos[i][0] * (W - 2 * pad), Y = i => pad + pos[i][1] * (H - 2 * pad);
      svg.append("path").attr("d", edges.map(([a, b]) => `M${X(a).toFixed(1)},${Y(a).toFixed(1)}L${X(b).toFixed(1)},${Y(b).toFixed(1)}`).join("")).attr("stroke", C.grey).attr("stroke-opacity", .3).attr("stroke-width", .7).attr("fill", "none");
      const ng = svg.append("g").selectAll("circle").data(d3.range(pos.length)).join("circle").attr("cx", X).attr("cy", Y).attr("r", r).attr("fill", C.light); const act = svg.append("g");
      return s => { ng.attr("fill", i => Sim.STATE[s[i]]); act.selectAll("circle").data(d3.range(pos.length).filter(i => s[i] === 1)).join("circle").attr("cx", X).attr("cy", Y).attr("r", r * 2.2).attr("fill", Sim.STATE[1]).attr("stroke", "#fff").attr("stroke-width", .8); }; };
    // something moving: a spreading pulse whose rate is set by the mean degree, or a load cascade on the grid
    // the grid: the shared cascade wants 40% of the nodes to fall, which one failure never does on the real grid; here a blackout of 8 to 60% counts
    const blackout = (nb, src) => { const n = nb.length; let best = null, bestR = 0; for (const alpha of [0.9, 0.7, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12, 0.08, 0.05, 0.03]) {
      const load = nb.map(a => a.length), cap = load.map(l => (1 + alpha) * l + .01), s = new Uint8Array(n); s[src] = 1; const fr = [new Uint8Array(s)];
      for (let step = 0; step < 16; step++) { const just = []; for (let i = 0; i < n; i++) if (s[i] === 1) just.push(i); if (!just.length) break; for (const i of just) { const alive = nb[i].filter(j => s[j] === 0); for (const j of alive) load[j] += load[i] / alive.length; s[i] = 2; } for (let i = 0; i < n; i++) if (s[i] === 0 && load[i] > cap[i]) s[i] = 1; fr.push(new Uint8Array(s)); }
      const reached = fr[fr.length - 1].filter(v => v).length / n; if (reached >= .08 && reached <= .6) return fr; if (reached <= .6 && reached > bestR) { bestR = reached; best = fr; } } return best || [new Uint8Array(n)]; };
    const pulse = (q, nb, kind) => { const n = nb.length, deg = nb.map(a => a.length), md = d3.mean(deg), rnd = mulberry(11 + n), hubs = d3.range(n).filter(i => deg[i] >= 3);
      const active = f => { let c = 0; for (const v of f) if (v === 1) c++; return c; };
      // a run that fizzles after a node or two shows nothing: redraw until the wave reaches 8% of the nodes at some point (or keep the best of 25 tries)
      const takeoff = () => { let best = null, bc = -1; for (let t = 0; t < 25; t++) { const fr = spreadFrames(nb, Math.min(.5, Math.max(.01, .6 / md)), .3, hubs[Math.floor(rnd() * hubs.length)], 40, rnd); const c = d3.max(fr, active); if (c >= .08 * n) return fr; if (c > bc) { bc = c; best = fr; } } return best; };
      q.make = kind === "cascade" ? () => blackout(nb, hubs[Math.floor(rnd() * hubs.length)]) : takeoff; };
    // the world on top: the busiest airports and the routes among them, as great circles
    { const F = E.flights, W0 = 800, H0 = 300; const q = card("wide", "Flights · world airports", `${fmt(F.n)} airports, ${fmt(F.m)} routes`, `The ${fmt(F.n)} busiest of ${fmt(F.raw_n)} airports with scheduled service, and every route among them. The dots are where the airports are.`);
      const svg = svgIn(q.fig, W0, H0); const proj = d3.geoNaturalEarth1().fitExtent([[0, 0], [W0, H0]], { type: "MultiPoint", coordinates: [[-180, 0], [180, 0], [0, -50], [0, 72]] }); const gp = d3.geoPath(proj);
      svg.append("path").datum(G.world).attr("d", gp).attr("fill", "#EFEDE6");
      svg.append("path").datum({ type: "MultiLineString", coordinates: F.edges.map(([a, b]) => [F.lonlat[a], F.lonlat[b]]) }).attr("d", gp).attr("stroke", C.grey).attr("stroke-opacity", .22).attr("stroke-width", .6).attr("fill", "none");
      const pts = F.lonlat.map(ll => proj(ll)); const ng = svg.append("g").selectAll("circle").data(d3.range(F.n)).join("circle").attr("cx", i => pts[i][0]).attr("cy", i => pts[i][1]).attr("r", 3).attr("fill", C.light).attr("stroke", "#fff").attr("stroke-width", .6); const act = svg.append("g");
      q.paint = s => { ng.attr("fill", i => Sim.STATE[s[i]]); act.selectAll("circle").data(d3.range(F.n).filter(i => s[i] === 1)).join("circle").attr("cx", i => pts[i][0]).attr("cy", i => pts[i][1]).attr("r", 6.5).attr("fill", Sim.STATE[1]).attr("stroke", "#fff").attr("stroke-width", 1); }; pulse(q, nbList(F.n, F.edges), "spread"); P.push(q); }
    const specs = [["brain", "Brain · a worm's neurons", d => `${fmt(d.n)} neurons, ${fmt(d.m)} connections`, "Every neuron of C. elegans, joined by its synapses and gap junctions.", 3.2, "spread"],
      ["grid", "Power · western US grid", d => `${fmt(d.n)} stations, ${fmt(d.m)} lines`, "Generators, transformers and substations, joined by high-voltage lines.", 1.5, "cascade"],
      ["science", "Science · coauthors", d => `${fmt(d.n)} scientists, ${fmt(d.m)} coauthorships`, "The largest connected group of network scientists, joined by shared papers.", 2.6, "spread"],
      ["blogs", "Politics · blog links", d => `${fmt(d.n)} blogs, ${fmt(d.m)} links`, "US political blogs before the 2004 election, joined when one links to the other.", 1.8, "spread"]];
    for (const [key, k, hh, a, r, kind] of specs) { const d = E[key]; const q = card("", k, hh(d), a); q.paint = draw(q.fig, d.pos, d.edges, r, 420, 230); pulse(q, nbList(d.n, d.edges), kind); P.push(q); }
    // the loops, as on the four-things slide: each panel replays a fresh run while the second beat is up
    const section = e.closest("section"); let on = false;
    // the still frame (print, reduced motion): the one whose active share is nearest 8%, so the wave shows without flooding the drawing
    const still = fr => { const tgt = Math.max(5, .08 * fr[0].length); let b = 0, bd = Infinity; fr.forEach((f, i) => { let c = 0; for (const v of f) if (v === 1) c++; const d = Math.abs(c - tgt); if (d < bd) { bd = d; b = i; } }); return b; };
    P.forEach(q => { q.frames = q.make(); q.k = 0; q.hold = 0; q.paint(q.frames[0]); });
    const tick = () => { if (!on || (window.Reveal && Reveal.getCurrentSlide && Reveal.getCurrentSlide() !== section)) return; P.forEach(q => { if (q.k >= q.frames.length) { if (q.hold++ < 5) return; q.hold = 0; q.frames = q.make(); q.k = 0; } q.paint(q.frames[q.k++]); }); };
    let timer = null; if (!reduce()) timer = setInterval(() => { if (!e.isConnected) { clearInterval(timer); return; } tick(); }, 330);
    return { steps: 2, caps: ["Five real networks, drawn from their data, not sketched: a worm’s nervous system, a power grid, the world’s air routes, a field’s coauthorships, a country’s political blogs.", "And on every one of them something moves: a signal, a failure, a delay, an idea, a link. Each is a graph plus a dynamic on it, and each forecast of it needs error bars."],
      show: k => { on = k >= 1; P.forEach(q => { q.p.classList.add("on"); if (k === 0) { q.frames = q.make(); q.k = 0; q.paint(q.frames[0]); } else if (reduce()) q.paint(q.frames[still(q.frames)]); }); } };
  };

  // Part 0 · Braess's paradox: 4000 drivers, two routes, then a free shortcut that makes everyone slower
  R.braess = (e, D) => {
    const f = frame(e, 1300, 560, { l: 30, r: 30, t: 30, b: 20 }); const g = f.g; const L = Layers(g); const svg = f.svg; const uid = Math.random().toString(36).slice(2, 7);
    const N = { s: [70, 250], A: [450, 55], B: [450, 445], t: [830, 250] }; const DR = 4000;
    const edges = [["s", "A", "1 min per 100 cars"], ["A", "t", "45 min"], ["s", "B", "45 min"], ["B", "t", "1 min per 100 cars"]];
    const upper = d => d[1] === "A" || d[0] === "A";   // the two roads via A: labels above, flows below; via B the other way round
    const mid = (a, b, off) => { const [x1, y1] = N[a], [x2, y2] = N[b]; const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); return [(x1 + x2) / 2 - dy / len * off, (y1 + y2) / 2 + dx / len * off]; };
    const lines = g.append("g").selectAll("line").data(edges).join("line").attr("x1", d => N[d[0]][0]).attr("y1", d => N[d[0]][1]).attr("x2", d => N[d[1]][0]).attr("y2", d => N[d[1]][1]).attr("stroke", C.blue).attr("stroke-linecap", "round").style("transition", "stroke-width .7s, opacity .7s");
    // labels run along their road: rotated about the offset midpoint, so a long label never crosses the line
    const along = (d, off) => { const [x1, y1] = N[d[0]], [x2, y2] = N[d[1]], [mx, my] = mid(d[0], d[1], off); return `rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI},${mx},${my})`; };
    g.append("g").selectAll("text").data(edges).join("text").attr("x", d => mid(d[0], d[1], upper(d) ? -26 : 26)[0]).attr("y", d => mid(d[0], d[1], upper(d) ? -26 : 26)[1] + 7).attr("transform", d => along(d, upper(d) ? -26 : 26)).attr("text-anchor", "middle").attr("font-size", 21).attr("fill", C.muted).text(d => d[2]);
    const flows = g.append("g").selectAll("text").data(edges).join("text").attr("x", d => mid(d[0], d[1], upper(d) ? 30 : -30)[0]).attr("y", d => mid(d[0], d[1], upper(d) ? 30 : -30)[1] + 8).attr("transform", d => along(d, upper(d) ? 30 : -30)).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 700).attr("fill", C.blue).style("transition", "opacity .7s");
    // the shortcut: layer 0 is the dashed marker when it is just built; layer 1 is the same road thick, with its traffic, once everyone uses it
    const lS = L.add(); lS.append("line").attr("x1", N.A[0]).attr("y1", N.A[1] + 30).attr("x2", N.B[0]).attr("y2", N.B[1] - 30).attr("stroke", C.orange).attr("stroke-width", 4).attr("stroke-dasharray", "10 8").attr("stroke-linecap", "round");
    lS.append("text").attr("x", N.A[0] + 26).attr("y", 250).attr("font-size", 21).attr("fill", C.orange).attr("font-weight", 600).text("new shortcut: 0 min");
    const lU = L.add(); lU.append("line").attr("x1", N.A[0]).attr("y1", N.A[1] + 30).attr("x2", N.B[0]).attr("y2", N.B[1] - 30).attr("stroke", C.orange).attr("stroke-width", 3 + 16).attr("stroke-linecap", "round");
    lU.append("text").attr("x", N.A[0] - 22).attr("y", 258).attr("transform", `rotate(-90,${N.A[0] - 22},250)`).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 700).attr("fill", C.orange).text(`${DR} cars`);
    const nodes = g.append("g"); for (const [k, [x, y]] of Object.entries(N)) { const end = k === "s" || k === "t"; nodes.append("circle").attr("cx", x).attr("cy", y).attr("r", end ? 44 : 30).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 3); nodes.append("text").attr("x", x).attr("y", y + (end ? 9 : 11)).attr("text-anchor", "middle").attr("font-size", end ? 24 : 30).attr("font-weight", 700).attr("fill", C.ink).attr("font-family", F.disp).text(k === "s" ? "home" : k === "t" ? "work" : k); }
    // the numbers, in a block on the right
    const bx = 905; const big = g.append("text").attr("x", bx).attr("y", 215).attr("font-size", 60).attr("font-weight", 700).attr("fill", C.ink).attr("font-family", F.disp);
    const sub1 = g.append("text").attr("x", bx).attr("y", 256).attr("font-size", 22).attr("fill", C.muted), sub2 = g.append("text").attr("x", bx).attr("y", 286).attr("font-size", 22).attr("fill", C.muted);
    const lX = L.add(); lX.append("text").attr("x", bx).attr("y", 354).attr("font-size", 21).attr("font-weight", 600).attr("fill", C.orange).text("both old routes would now take 85,"); lX.append("text").attr("x", bx).attr("y", 382).attr("font-size", 21).attr("font-weight", 600).attr("fill", C.orange).text("so nobody gains by switching back.");
    // the fifth beat: Seoul. Live, the photo covers the network and the numbers stay; in print it is a strip under the numbers so the network stays too
    const lP = L.add(); const P_ = reduce(); const [ix, iy, iw, ich] = P_ ? [905, 405, 365, 100] : [80, 8, 740, 740 * 733 / 1100]; const ih = iw * 733 / 1100;
    svg.append("clipPath").attr("id", "seoul" + uid).append("rect").attr("x", ix).attr("y", iy).attr("width", iw).attr("height", ich).attr("rx", 14);
    if (!P_) lP.append("rect").attr("x", -30).attr("y", -30).attr("width", 925).attr("height", 560).attr("fill", "#fff");
    lP.append("image").attr("href", IMG("seoul.jpg")).attr("x", ix).attr("y", P_ ? iy - (ih - ich) / 2 : iy).attr("width", iw).attr("height", ih).attr("clip-path", `url(#seoul${uid})`);
    lP.append("rect").attr("x", ix).attr("y", iy + ich - 36).attr("width", iw).attr("height", 36).attr("fill", "#000").attr("opacity", .45).attr("clip-path", `url(#seoul${uid})`);
    lP.append("text").attr("x", ix + 14).attr("y", iy + ich - 12).attr("font-size", 18).attr("font-weight", 600).attr("fill", "#fff").style("stroke", "none").text(P_ ? "Seoul, Cheonggyecheon" : "Seoul, Cheonggyecheon: the expressway that stood here came down in 2005");
    const setFlows = k => { const fl = k < 2 ? [DR / 2, DR / 2, DR / 2, DR / 2] : [DR, 0, 0, DR]; lines.attr("stroke-width", (d, i) => 3 + 16 * fl[i] / DR).style("opacity", (d, i) => fl[i] ? 1 : .25); flows.text((d, i) => fl[i] ? `${fl[i]} cars` : "").style("opacity", (d, i) => fl[i] ? 1 : 0);
      if (k < 2) { big.text("65 min"); sub1.text("every driver, either route"); sub2.text(`${DR / 2} cars each way: 20 + 45`); } else { big.text("80 min"); sub1.text("every driver, via the shortcut: was 65"); sub2.text(`${DR} cars: 40 + 0 + 40`); } };
    setFlows(0);
    return { steps: 5, caps: ["4000 people drive from home to work. Two routes, each a slow road that takes one minute per hundred cars, then a fixed 45-minute road. They split evenly: 65 minutes each.", "The city builds a free shortcut between the two junctions.", "Everyone takes it: at each step it looks faster. Now every driver needs 80 minutes, and nobody can do better by switching alone.", "A network is not the sum of its roads. What happens at one node depends on every other node, so we model the graph and the dynamics on it together, and that is before any uncertainty is added.", "Seoul took the lesson literally. In 2005 the elevated Cheonggye expressway came down to uncover the stream beneath it, and travel times around it improved rather than worsened. Braess in reverse, in a real city."],
      show: k => { setFlows(k); L.show(k >= 4 ? 4 : k >= 2 ? 3 : k >= 1 ? 1 : 0); } };
  };

  // Part 0 · what uncertainty quantification is: a number, a spread, then the check and the decision, on the ward's own numbers
  R.whatuq = (e, D) => {
    const row = el("div", "fourq three"); e.appendChild(row); const F2 = D.fig2, Mg = D.p2.manager, finals = F2.finals, n = finals.length;
    const mk = (k, title, sub, accent) => { const p = el("div", "fq" + (accent ? " accent" : "")); row.appendChild(p); p.appendChild(el("p", "k", k)); p.appendChild(el("h3", null, title)); const fig = el("div", "figbox"); p.appendChild(fig); p.appendChild(el("p", "a", sub)); return { p, fig }; };
    const M = { l: 30, r: 16, t: 24, b: 54 }, W = 420, H = 300; const xs = () => d3.scaleLinear().domain([0, 76]).range([0, W - M.l - M.r]);
    const pShort = Math.round(100 * finals.filter(v => v > F2.mean).length / n), q90 = Sim.q(finals, .9);
    const P1 = mk("What most reports give", `One number: ${F2.mean} people`, `the average over ${n} simulated outbreaks of the same virus on the same ward`);
    { const f = frame(P1.fig, W, H, M), x = xs(), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]); axes(f, x, y, "people ever infected, out of 75", "", { xt: 6, noY: true });
      f.g.append("line").attr("x1", x(F2.mean)).attr("x2", x(F2.mean)).attr("y1", f.ih).attr("y2", y(.25)).attr("stroke", C.orange).attr("stroke-width", 4); f.g.append("circle").attr("cx", x(F2.mean)).attr("cy", y(.25)).attr("r", 11).attr("fill", C.orange); f.g.append("text").attr("x", x(F2.mean)).attr("y", y(.25) - 22).attr("text-anchor", "middle").attr("font-size", 24).attr("font-weight", 700).attr("fill", C.orange).text(F2.mean); }
    const P2 = mk("What the question deserves", `A spread: ${Mg.p_dieout}% nothing, otherwise ${F2.big_lo} to ${F2.big_hi} nine times in ten`, `the same ${n} outbreaks, all of them: two worlds, and the average sits in neither`);
    { const f = frame(P2.fig, W, H, M), x = xs(), y = d3.scaleLinear().range([f.ih, 0]); bars(f.g, finals, x, y, { bins: 38, color: C.blue }); axes(f, x, y, "people ever infected, out of 75", "", { xt: 6, noY: true });
      f.g.append("line").attr("x1", x(F2.mean)).attr("x2", x(F2.mean)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.orange).attr("stroke-width", 3).attr("stroke-dasharray", "6 5"); }
    const P3 = mk("Then check it, then use it", `Plan for the bad day, ${Mg.cvar} beds, and test the spread`, `${F2.mean} beds fall short in ${pShort}% of outbreaks; the worst tenth averages ${Mg.cvar}. Every part today ends by checking its spread against what happened.`, true);
    { const f = frame(P3.fig, W, H, M), x = xs(), y = d3.scaleLinear().range([f.ih, 0]); const bins = bars(f.g, finals, x, y, { bins: 38, color: C.grey }); f.g.selectAll("rect.bar").attr("fill", b => b.x0 >= q90 ? C.blue : C.light); axes(f, x, y, "people ever infected, out of 75", "", { xt: 6, noY: true });
      f.g.append("line").attr("x1", x(Mg.cvar)).attr("x2", x(Mg.cvar)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.blue).attr("stroke-width", 3); f.g.append("text").attr("x", x(Mg.cvar) - 8).attr("y", 18).attr("text-anchor", "end").attr("font-size", 21).attr("font-weight", 700).attr("fill", C.blue).text(`bad day: ${Mg.cvar}`);
      f.g.append("line").attr("x1", x(F2.mean)).attr("x2", x(F2.mean)).attr("y1", f.ih).attr("y2", 0).attr("stroke", C.orange).attr("stroke-width", 3).attr("stroke-dasharray", "6 5"); f.g.append("text").attr("x", x(F2.mean) - 8).attr("y", 18).attr("text-anchor", "end").attr("font-size", 21).attr("font-weight", 700).attr("fill", C.orange).text(`${F2.mean}`); }
    const panels = [P1.p, P2.p, P3.p]; const cap = e.closest("section").querySelector(".cap");
    return { steps: 4, caps: [], show: k => { panels.forEach((p, i) => p.classList.toggle("on", i <= k)); if (cap) { cap.style.transition = reduce() ? "none" : "opacity .4s"; cap.style.opacity = k >= 3 ? 1 : 0; } } };
  };

  // Part 0 · two kinds of uncertainty, on the ward: luck (the spread at a known β) and not knowing (the posterior over β)
  R.twokinds = (e, D) => {
    const row = el("div", "fourq two"); e.appendChild(row); const F2 = D.fig2, F4 = D.fig4;
    const mk = (k, title, sub) => { const p = el("div", "fq"); row.appendChild(p); p.appendChild(el("p", "k", k)); p.appendChild(el("h3", null, title)); const fig = el("div", "figbox"); p.appendChild(fig); p.appendChild(el("p", "a", sub)); return { p, fig }; };
    const M = { l: 30, r: 16, t: 24, b: 54 }, W = 560, H = 310;
    const P1 = mk("Luck · aleatoric", "Same ward, same virus, same first patient", `${F2.runs} runs, ${F2.runs} endings. The randomness of which contacts passed the virus on, and on which day. No amount of data about the virus shrinks this spread.`);
    { const f = frame(P1.fig, W, H, M), x = d3.scaleLinear().domain([0, 76]).range([0, f.iw]), y = d3.scaleLinear().range([f.ih, 0]); bars(f.g, F2.finals, x, y, { bins: 38, color: C.blue }); axes(f, x, y, "people ever infected, β known", "", { xt: 6, noY: true }); }
    const P2 = mk("Not knowing · epistemic", "How contagious is it? We do not know β yet", `Before any data β could be anything from 1% to 30%. Ten days of case counts narrowed it to ${Math.round(100 * F4.beta_lo)}% to ${Math.round(100 * F4.beta_hi)}%. More data shrinks this one.`);
    { const f = frame(P2.fig, W, H, M), x = d3.scaleLinear().domain([0, 0.31]).range([0, f.iw]), y = d3.scaleLinear().range([f.ih, 0]); bars(f.g, F4.keep, x, y, { bins: 30, color: C.blue }); const ymax = y.domain()[1], flatH = F4.keep.length / 29;   // the same 232 draws spread flat over the 29 prior bins
      f.g.append("rect").attr("x", x(0.01)).attr("y", y(flatH)).attr("width", x(0.30) - x(0.01)).attr("height", f.ih - y(flatH)).attr("fill", C.blueSoft).attr("stroke", C.blue).attr("stroke-width", 1.5).attr("stroke-dasharray", "6 5").attr("rx", 3).lower(); axes(f, x, y, "β, how contagious", "", { xt: 6, noY: true });
      f.g.append("text").attr("x", x(0.25)).attr("y", y(flatH) - 10).attr("text-anchor", "middle").attr("font-size", 19).attr("fill", C.muted).text("before data: flat"); f.g.append("text").attr("x", x(F4.beta_hi) + 10).attr("y", y(ymax * .8)).attr("font-size", 19).attr("fill", C.blue).attr("font-weight", 600).text("after ten days"); }
    const panels = [P1.p, P2.p]; const cap = e.closest("section").querySelector(".cap");
    return { steps: 3, caps: [], show: k => { panels.forEach((p, i) => p.classList.toggle("on", i <= k)); if (cap) { cap.style.transition = reduce() ? "none" : "opacity .4s"; cap.style.opacity = k >= 2 ? 1 : 0; } } };
  };

  R.mount = (section, D) => {
    section.querySelectorAll("[data-viz]").forEach(e => {
      if (mounted.has(e)) return;
      const fn = R[e.dataset.viz]; let v = null;
      try { v = fn ? fn(e, D) : null; } catch (err) { console.error(e.dataset.viz, err); e.textContent = "figure failed: " + err.message; }
      mounted.set(e, v || { steps: 1, show: () => { }, caps: [] });
      if (v && v.steps > 1 && !e.classList.contains("ladder-corner")) { const bi = e.dataset.beatIndex ? e.dataset.beatIndex.split(",").map(Number) : null; for (let i = 1; i < v.steps; i++) { const s = el("span", "fragment beat"); s.dataset.beat = i; if (bi) s.dataset.fragmentIndex = bi[i - 1]; section.appendChild(s); } }
      if (e.querySelector(".ctl")) { const h = section.querySelector("h2"); if (h && !h.querySelector(".live")) h.appendChild(Object.assign(document.createElement("span"), { className: "live", textContent: "live" })); }
    });
    R.sync(section);
  };
  // <span data-num="fig8.rep.coverage"> gets the number from data.json, so captions never go stale
  R.fill = (root, D) => { const X = Object.assign({}, D); X.fig2 = Object.assign({ dieout_pct: Math.round(100 * D.fig2.p_dieout), big_width: D.fig2.big_hi - D.fig2.big_lo }, D.fig2); X.fig4 = Object.assign({ cov_pct: Math.round(100 * D.fig4.coverage) }, D.fig4); X.fig10 = Object.assign({ conf_width_r: Math.round(D.fig10.conf_width) }, D.fig10);
    root.querySelectorAll("[data-num]").forEach(sp => { const v = sp.dataset.num.split(".").reduce((o, k) => (o == null ? o : o[k]), X); if (v != null) sp.textContent = v; });
    const q = root.getElementById && root.getElementById("p5q"), R8 = D.fig8 && D.fig8.rep; if (q && R8) q.textContent = R8.coverage < 88 ? `“Part 4’s filter said 90% and delivered ${R8.coverage}%. Can we fix the band without touching the model?”` : `“Part 4’s filter kept its promise. Most models don’t: they say 90% and deliver less. Can we fix a band without touching the model?”`; };
  R.showAll = (section) => { section.querySelectorAll("[data-viz]").forEach(e => { const v = mounted.get(e); if (!v) return; const kk = v.steps - 1; e.__k = kk; v.show(kk); const cap = section.querySelector(".cap"); if (cap && v.caps && v.caps.length) { cap.__want = v.caps[kk] || ""; cap.textContent = cap.__want; cap.style.opacity = 1; } }); };
  R.sync = (section) => {
    const k = section.querySelectorAll(".beat.visible").length;
    section.querySelectorAll("[data-viz]").forEach(e => { const v = mounted.get(e); if (!v) return; const kk = Math.min(k, v.steps - 1); if (e.__k !== kk) { e.__k = kk; v.show(kk); } const cap = section.querySelector(".cap"); if (cap && v.caps && v.caps.length && !(v.busy && v.busy())) { const t = v.caps[kk] || ""; if (cap.textContent !== t && cap.__want !== t) { cap.__want = t; cap.style.opacity = 0; setTimeout(() => { if (cap.__want === t) { cap.textContent = t; cap.style.opacity = 1; } }, 160); } } });
  };
  return R;
})();
