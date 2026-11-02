// The ward and the SIR simulation, shared by every live figure in the deck.
window.Sim = (function () {
  const S = {};
  S.init = function (ward) {
    S.W = ward; S.N = ward.pos.length;
    S.nb = Array.from({ length: S.N }, () => []);
    for (const [a, b] of ward.edges) { S.nb[a].push(b); S.nb[b].push(a); }
    S.deg = S.nb.map(a => a.length);
    // Re-lay the ward out with a force layout so people spread evenly over the box (the exported spring layout bunches up).
    if (window.d3) {
      const nodes = ward.pos.map((p, i) => ({ i, x: p[0] * 700, y: p[1] * 500 }));
      const links = ward.edges.map(([a, b]) => ({ source: a, target: b }));
      const sim = d3.forceSimulation(nodes).force("link", d3.forceLink(links).distance(70).strength(.12)).force("charge", d3.forceManyBody().strength(-520))
        .force("collide", d3.forceCollide(22)).force("x", d3.forceX(350).strength(.05)).force("y", d3.forceY(250).strength(.07)).stop();
      for (let k = 0; k < 400; k++) sim.tick();
      const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ward.pos = nodes.map(n => [(n.x - x0) / (x1 - x0), (n.y - y0) / (y1 - y0)]);
    }
  };
  S.ROLE = ["#2563EB", "#16A34A", "#EA580C", "#9CA3AF"];
  S.ROLE_NAME = ["patient", "nurse", "doctor", "admin"];
  S.STATE = { 0: "#E5E7EB", 1: "#DC2626", 2: "#F59E0B" };
  // Discrete-day SIR. Returns {cum: cases-so-far per day, s: final state}. onDay(t, state) is called before each step.
  S.sir = function (beta, gamma, src, T, vacc, onDay) {
    const N = S.N, nb = S.nb, s = new Uint8Array(N);
    if (vacc) for (const v of vacc) s[v] = 2;
    s[src] = 1;
    const cum = [];
    for (let t = 0; t <= T; t++) {
      let c = 0;
      for (let i = 0; i < N; i++) if (s[i] !== 0 && !(vacc && vacc.has(i))) c++;
      cum.push(c);
      if (onDay) onDay(t, s);
      const nw = [], rc = [];
      for (let i = 0; i < N; i++) {
        if (s[i] === 0) {
          let k = 0; for (const j of nb[i]) if (s[j] === 1) k++;
          if (k && Math.random() < 1 - Math.pow(1 - beta, k)) nw.push(i);
        } else if (s[i] === 1 && Math.random() < gamma) rc.push(i);
      }
      for (const i of nw) s[i] = 1; for (const i of rc) s[i] = 2;
    }
    return { cum, s };
  };
  S.mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  S.q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  S.cvar = (a, p = 0.9) => { const s = [...a].sort((x, y) => x - y); return S.mean(s.slice(Math.floor(p * s.length))); };
  return S;
})();
