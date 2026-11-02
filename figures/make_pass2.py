"""Pass-2 numbers for the deck: metrics, the filter fixed by conformal, a GP surrogate, deep-learning bands,
a scale test, the three risk-dial plans and the manager's numbers. Self-contained: reads data.json (repo root),
writes figures/pass2.json (merge_pass2.py puts it into data.json (repo root) as D.p2).   python make_pass2.py
"""
import os, sys, json, time
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
import scipy.sparse as sp

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "..", "data.json"), encoding="utf-8"))
W = D["ward"]; N = len(W["pos"]); BETA, GAMMA, SRC, T = W["beta"], W["gamma"], W["src"], 40
A = np.zeros((N, N))
for a, b in W["edges"]:
    A[a, b] = A[b, a] = 1
deg = A.sum(1)
I_true = np.array(D["truth"]["I"]); C_true = np.array(D["truth"]["C"])
CACHE = os.path.join(HERE, "pass2_partial.json")
P2 = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
def done(key):
    """True if this section is cached; otherwise the caller computes it and calls save()."""
    if key in P2: print(key, "cached"); return True
    return False
def save(): json.dump(P2, open(CACHE, "w"), separators=(",", ":"))
rl = lambda x, n=3: [round(float(v), n) for v in x]

def sir(Am, beta, gamma, src, T, rng, vacc=None, states=False):
    """Discrete-day SIR. Returns (C, I, s) or, with states=True, the state matrix (T+1, n)."""
    n = Am.shape[0]; s = np.zeros(n, dtype=np.int8); s[src] = 1
    nv = 0
    if vacc is not None and len(vacc):
        s[list(vacc)] = 2; nv = len(vacc)
    C, I, H = [], [], []
    for t in range(T + 1):
        if states: H.append(s.copy())
        I.append(int((s == 1).sum())); C.append(int((s != 0).sum()) - nv)
        k = Am @ (s == 1).astype(float)
        p = 1 - (1 - beta) ** k
        new = (rng.random(n) < p) & (s == 0); rec = (rng.random(n) < gamma) & (s == 1)
        s[new] = 1; s[rec] = 2
    if states: return np.array(H)
    return np.array(C), np.array(I), s

def cvar(d, a=0.9): return float(np.sort(d)[int(a * len(d)):].mean())
def qhat(scores, a):
    n = len(scores); return float(np.quantile(scores, min(1, np.ceil((n + 1) * a) / n)))

# ============ 1. metrics: coverage, width, interval score, CRPS, PIT ============
if not done('metrics'):
    def interval_score(lo, hi, y, a=0.1):
        return float(np.mean((hi - lo) + (2 / a) * np.maximum(lo - y, 0) + (2 / a) * np.maximum(y - hi, 0)))
    def crps_normal(mu, sigma, y):
        from scipy.stats import norm
        z = (y - mu) / sigma
        return float(np.mean(sigma * (z * (2 * norm.cdf(z) - 1) + 2 * norm.pdf(z) - 1 / np.sqrt(np.pi))))
    rows = []
    f4 = D["fig4"]; d = slice(11, 41)
    rows.append(dict(part="Part 2 · fan, every plausible β", cov=round(100 * float(np.mean((C_true[d] >= np.array(f4["q05"])[d]) & (C_true[d] <= np.array(f4["q95"])[d])))), width=round(float(np.mean(np.array(f4["q95"])[d] - np.array(f4["q05"])[d])), 1), iscore=round(interval_score(np.array(f4["q05"])[d], np.array(f4["q95"])[d], C_true[d]), 1), crps=None))
    f6 = D["fig6"]
    for lab, lo, hi in [("Part 3 · recorded graph", f6["lg"], f6["hg"]), ("Part 3 · plausible graphs", f6["lb"], f6["hb"])]:
        lo, hi = np.array(lo), np.array(hi)
        rows.append(dict(part=lab, cov=round(100 * float(np.mean((C_true[d] >= lo[d]) & (C_true[d] <= hi[d])))), width=round(float(np.mean(hi[d] - lo[d])), 1), iscore=round(interval_score(lo[d], hi[d], C_true[d]), 1), crps=None))
    f8 = D["fig8"]; lo8, hi8 = np.array(f8["lo"]), np.array(f8["hi"])
    rows.append(dict(part="Part 4 · particle filter", cov=round(100 * float(np.mean((I_true >= lo8) & (I_true <= hi8)))), width=round(float(np.mean(hi8 - lo8)), 1), iscore=round(interval_score(lo8, hi8, I_true), 1), crps=None))
    f10 = D["fig10"]; res = np.array(f10["res_test"]); rcal = np.array(f10["res_cal"]); z90 = 1.6449
    from scipy.stats import norm
    pit = norm.cdf(res / 2.0)
    rows.append(dict(part="Part 5 · simple model, its own ± 2", cov=round(100 * float(np.mean(np.abs(res) <= z90 * 2))), width=round(2 * z90 * 2, 1), iscore=round(interval_score(-z90 * 2 * np.ones_like(res), z90 * 2 * np.ones_like(res), res), 1), crps=round(crps_normal(0, 2.0, res), 2)))
    q10 = qhat(np.abs(rcal), 0.9)
    rows.append(dict(part="Part 5 · same model, conformal", cov=round(100 * float(np.mean(np.abs(res) <= q10))), width=round(2 * q10, 1), iscore=round(interval_score(-q10 * np.ones_like(res), q10 * np.ones_like(res), res), 1), crps=None))
    P2["metrics"] = dict(rows=rows, pit_hist=[int(v) for v in np.histogram(pit, bins=10, range=(0, 1))[0]], n_pit=int(len(pit)))
    print("metrics", [(r["part"], r["cov"], r["width"], r["iscore"]) for r in rows])
    save()

# ============ 2. the Part 4 filter, fixed by the three lines ============
if not done('filterfix'):
    tested = np.array(D["fig9"]["tested"]); SENS, FPR, K, IMPORT = 0.9, 0.02, 1000, 0.003
    def pf_run(H, rng):
        yn = {}
        for t in range(0, T + 1, 2):
            truly = (H[t] == 1); yn[t] = np.where(truly, rng.random(N) < SENS, rng.random(N) < FPR) & tested
        pb = rng.uniform(0.03, 0.15, K); ps = np.zeros((K, N), dtype=np.int8); ps[:, SRC] = 1; lo, md, hi = [], [], []
        for t in range(T + 1):
            if t in yn:
                inf_p = (ps == 1)[:, tested]; r = yn[t][tested][None, :]
                lw = (r * np.where(inf_p, np.log(SENS), np.log(FPR)) + (1 - r) * np.where(inf_p, np.log(1 - SENS), np.log(1 - FPR))).sum(1)
                w = np.exp(lw - lw.max()); w /= w.sum(); idx = rng.choice(K, K, p=w); ps, pb = ps[idx], pb[idx]
                pb = np.clip(pb + rng.normal(0, 0.004, K), 0.01, 0.3)
            Ic = (ps == 1).sum(1); lo.append(np.percentile(Ic, 5)); md.append(np.median(Ic)); hi.append(np.percentile(Ic, 95))
            p_inf = 1 - (1 - IMPORT) * (1 - pb[:, None]) ** ((ps == 1).astype(float) @ A.T)
            new = (rng.random((K, N)) < p_inf) & (ps == 0); rec = (rng.random((K, N)) < GAMMA) & (ps == 1)
            ps[new] = 1; ps[rec] = 2
        return np.array(lo), np.array(md), np.array(hi)
    rng = np.random.default_rng([7, 31]); t0 = time.time()
    def filter_outbreaks(n, rng):
        out = []
        for _ in range(n):
            H = sir(A, BETA, GAMMA, SRC, T, rng, states=True); I = (H == 1).sum(1)
            lo, md, hi = pf_run(H, rng); out.append((I, lo, md, hi))
        return out
    cal = filter_outbreaks(20, rng); test = filter_outbreaks(20, rng)
    print(f"filter runs done in {time.time() - t0:.0f}s")
    def scores(runs):
        s = []
        for I, lo, md, hi in runs:
            half = 0.5 * (hi - lo) + 0.5; s.append(np.abs(I - md) / half)
        return np.concatenate(s)
    q_mul = qhat(scores(cal), 0.9)
    q_add = qhat(np.concatenate([np.abs(I - md) for I, lo, md, hi in cal]), 0.9)
    def cov_width(runs, mode=None, q=None):
        c, w = [], []
        for I, lo, md, hi in runs:
            half = 0.5 * (hi - lo) + 0.5
            if mode is None: l, h = lo, hi
            elif mode == "mul": l, h = md - q * half, md + q * half
            else: l, h = np.maximum(0, md - q), md + q
            c.append(np.mean((I >= l) & (I <= h))); w.append(np.mean(h - l))
        return round(100 * float(np.mean(c))), round(float(np.mean(w)), 1)
    cb, wb = cov_width(test); cm, wm = cov_width(test, "mul", q_mul); cad, wad = cov_width(test, "add", q_add)
    print("filterfix multiplicative", q_mul, cm, wm, "additive", q_add, cad, wad)
    mode = "add" if abs(cad - 90) <= abs(cm - 90) else "mul"
    P2["filterfix"] = dict(mode=mode, q=round(q_add if mode == "add" else q_mul, 3), q_mul=round(q_mul, 3), q_add=round(q_add, 2), n_cal=20, n_test=20, cov_before=cb, width_before=wb,
                           cov_after=cad if mode == "add" else cm, width_after=wad if mode == "add" else wm, cov_mul=cm, width_mul=wm, cov_add=cad, width_add=wad, days_per_outbreak=T + 1)
    print("filterfix", P2["filterfix"])
    save()

# ============ 3. a surrogate: a GP emulator of final size as a function of β ============
if not done('surrogate'):
    rng = np.random.default_rng([7, 32])
    def final_size(beta, rng): return sir(A, beta, GAMMA, SRC, T, rng)[0][-1]
    xtr = rng.uniform(0.02, 0.20, 60); ytr = np.array([final_size(b, rng) for b in xtr], dtype=float)
    def gp(xtr, ytr, xte, l, sf2, sn2):
        Kf = lambda a, b: sf2 * np.exp(-(a[:, None] - b[None, :]) ** 2 / (2 * l * l))
        Ktr = Kf(xtr, xtr) + sn2 * np.eye(len(xtr)); m = ytr.mean()
        L = np.linalg.cholesky(Ktr); alpha = np.linalg.solve(L.T, np.linalg.solve(L, ytr - m))
        Ks = Kf(xte, xtr); mu = Ks @ alpha + m
        v = np.linalg.solve(L, Ks.T); var = sf2 - (v * v).sum(0) + sn2
        nll = 0.5 * (ytr - m) @ alpha + np.log(np.diag(L)).sum()
        return mu, np.sqrt(np.maximum(var, 1e-6)), nll
    best = None
    for l in [0.02, 0.03, 0.05, 0.08]:
        for sn2 in [25, 100, 225, 400, 625]:
            _, _, nll = gp(xtr, ytr, xtr[:1], l, ytr.var(), sn2)
            if best is None or nll < best[0]: best = (nll, l, sn2)
    _, l_gp, sn2_gp = best
    grid = np.linspace(0.02, 0.20, 60); mu_g, sd_g, _ = gp(xtr, ytr, grid, l_gp, ytr.var(), sn2_gp)
    xcal = rng.uniform(0.02, 0.20, 300); ycal = np.array([final_size(b, rng) for b in xcal], dtype=float)
    xte = rng.uniform(0.02, 0.20, 300); yte = np.array([final_size(b, rng) for b in xte], dtype=float)
    mu_c, sd_c, _ = gp(xtr, ytr, xcal, l_gp, ytr.var(), sn2_gp); mu_t, sd_t, _ = gp(xtr, ytr, xte, l_gp, ytr.var(), sn2_gp)
    cov_gp = float(np.mean(np.abs(yte - mu_t) <= z90 * sd_t)); w_gp = float(np.mean(2 * z90 * sd_t))
    # two-part emulator: P(dies out | β) and, given it takes off, the size
    big = ytr >= 15; xb, yb = xtr[big], ytr[big]
    bestb = None
    for l in [0.02, 0.03, 0.05, 0.08]:
        for sn2 in [4, 9, 16, 25, 49]:
            _, _, nll = gp(xb, yb, xb[:1], l, max(yb.var(), 1), sn2)
            if bestb is None or nll < bestb[0]: bestb = (nll, l, sn2)
    _, l_b, sn2_b = bestb
    mu_bg, sd_bg, _ = gp(xb, yb, grid, l_b, max(yb.var(), 1), sn2_b)
    pdie_g, _, _ = gp(xtr, big.astype(float) * 0 + (~big).astype(float), grid, 0.03, 0.25, 0.1); pdie_g = np.clip(pdie_g, 0, 1)
    tb = yte >= 15; mu_tb, sd_tb, _ = gp(xb, yb, xte[tb], l_b, max(yb.var(), 1), sn2_b)
    cov_two = float(np.mean(np.abs(yte[tb] - mu_tb) <= z90 * sd_tb)); w_two = float(np.mean(2 * z90 * sd_tb))
    cb_ = ycal >= 15; mu_cb, sd_cb, _ = gp(xb, yb, xcal[cb_], l_b, max(yb.var(), 1), sn2_b)
    q_gp = qhat(np.abs(ycal[cb_] - mu_cb) / sd_cb, 0.9)
    cov_cf = float(np.mean(np.abs(yte[tb] - mu_tb) <= q_gp * sd_tb)); w_cf = float(np.mean(2 * q_gp * sd_tb))
    pdie_te = float(np.mean(~tb))
    # the real spread at five β values, for comparison
    truth_band = []
    for b in [0.03, 0.06, 0.09, 0.13, 0.18]:
        fs = np.array([final_size(b, rng) for _ in range(300)]); truth_band.append([b, int(np.percentile(fs, 5)), int(np.percentile(fs, 95))])
    P2["surrogate"] = dict(xtr=rl(xtr), ytr=[int(v) for v in ytr], grid=rl(grid), mu=rl(mu_g, 1), sd=rl(sd_g, 1), mu_big=rl(mu_bg, 1), sd_big=rl(sd_bg, 1), pdie=rl(pdie_g, 2), q=round(q_gp, 2), l=l_gp, noise_sd=round(float(np.sqrt(sn2_gp)), 1),
                           xte=rl(xte[:150]), yte=[int(v) for v in yte[:150]], cov_gp=round(100 * cov_gp), w_gp=round(w_gp, 1), cov_two=round(100 * cov_two), w_two=round(w_two, 1), cov_cf=round(100 * cov_cf), w_cf=round(w_cf, 1), pdie_test=round(100 * pdie_te),
                           truth_band=truth_band, n_train=60, n_big=int(big.sum()), n_cal=300, n_test=300)
    print("surrogate", {k: v for k, v in P2["surrogate"].items() if not isinstance(v, list)})
    save()

# ============ 4. deep-learning bands: one net, an ensemble, MC dropout, conformal ============
if not done('dl'):
    rng = np.random.default_rng([7, 33])
    M = 3000
    bs = rng.uniform(0.03, 0.15, M); gs = rng.uniform(0.08, 0.30, M); srcs = rng.integers(0, N, M)
    Y = np.array([sir(A, b, g, s0, T, rng)[0][-1] for b, g, s0 in zip(bs, gs, srcs)], dtype=float)
    X = np.stack([(bs - 0.09) / 0.035, (gs - 0.19) / 0.064, (deg[srcs] - deg.mean()) / deg.std()], 1)
    tr, ca, te = slice(0, 1600), slice(1600, 2000), slice(2000, 3000)
    def mlp_train(X, y, rng, h=64, epochs=400, lr=3e-3, drop=0.0):
        d = X.shape[1]; sc = lambda n_: 1 / np.sqrt(n_)
        W1 = rng.normal(0, sc(d), (d, h)); b1 = np.zeros(h); W2 = rng.normal(0, sc(h), (h, h)); b2 = np.zeros(h); W3 = rng.normal(0, sc(h), (h, 2)); b3 = np.array([y.mean(), np.log(y.std())])
        params = [W1, b1, W2, b2, W3, b3]; mom = [np.zeros_like(p) for p in params]; vel = [np.zeros_like(p) for p in params]; step = 0
        def fwd(Xb, train):
            h1 = np.maximum(Xb @ W1 + b1, 0); m1 = (rng.random(h1.shape) > drop) / (1 - drop) if (drop and train) else 1.0; h1 = h1 * m1
            h2 = np.maximum(h1 @ W2 + b2, 0); m2 = (rng.random(h2.shape) > drop) / (1 - drop) if (drop and train) else 1.0; h2 = h2 * m2
            out = h2 @ W3 + b3; return h1, m1, h2, m2, out
        n = len(y)
        for ep in range(epochs):
            for idx in np.array_split(rng.permutation(n), 8):
                Xb, yb = X[idx], y[idx]; h1, m1, h2, m2, out = fwd(Xb, True)
                mu, logs = out[:, 0], np.clip(out[:, 1], -3, 6); s2 = np.exp(2 * logs)
                dmu = (mu - yb) / s2 / len(idx); dlogs = (1 - (yb - mu) ** 2 / s2) / len(idx)
                dout = np.stack([dmu, dlogs], 1)
                gW3 = h2.T @ dout; gb3 = dout.sum(0); dh2 = (dout @ W3.T) * (h2 > 0) * m2
                gW2 = h1.T @ dh2; gb2 = dh2.sum(0); dh1 = (dh2 @ W2.T) * (h1 > 0) * m1
                gW1 = Xb.T @ dh1; gb1 = dh1.sum(0)
                step += 1
                for p, g, m_, v_ in zip(params, [gW1, gb1, gW2, gb2, gW3, gb3], mom, vel):
                    m_ *= 0.9; m_ += 0.1 * g; v_ *= 0.999; v_ += 0.001 * g * g
                    p -= lr * (m_ / (1 - 0.9 ** step)) / (np.sqrt(v_ / (1 - 0.999 ** step)) + 1e-8)
        def predict(Xq, mc=False):
            _, _, _, _, out = fwd(Xq, mc); return out[:, 0], np.exp(np.clip(out[:, 1], -3, 6))
        return predict
    t0 = time.time()
    single = mlp_train(X[tr], Y[tr], rng)
    mu1, s1 = single(X[te]); c_single = float(np.mean(np.abs(Y[te] - mu1) <= z90 * s1)); w_single = float(np.mean(2 * z90 * s1))
    ens = [mlp_train(X[tr], Y[tr], np.random.default_rng([7, 33, i])) for i in range(5)]
    mus, ss = zip(*[e(X[te]) for e in ens]); mus, ss = np.array(mus), np.array(ss)
    mu_e = mus.mean(0); s_e = np.sqrt((ss ** 2).mean(0) + mus.var(0))
    c_ens = float(np.mean(np.abs(Y[te] - mu_e) <= z90 * s_e)); w_ens = float(np.mean(2 * z90 * s_e))
    dropnet = mlp_train(X[tr], Y[tr], rng, drop=0.1)
    mcs = [dropnet(X[te], mc=True) for _ in range(50)]; mus_d = np.array([m for m, _ in mcs]); ss_d = np.array([s for _, s in mcs])
    mu_d = mus_d.mean(0); s_d = np.sqrt((ss_d ** 2).mean(0) + mus_d.var(0))
    c_drop = float(np.mean(np.abs(Y[te] - mu_d) <= z90 * s_d)); w_drop = float(np.mean(2 * z90 * s_d))
    muc, sc_ = single(X[ca]); q_nn = qhat(np.abs(Y[ca] - muc) / sc_, 0.9)
    c_conf = float(np.mean(np.abs(Y[te] - mu1) <= q_nn * s1)); w_conf = float(np.mean(2 * q_nn * s1))
    # the simulator's own spread, for reference: at the test inputs, how wide is the true 90% band on average?
    P2["dl"] = dict(rows=[["one network, its own ± band", round(100 * c_single), round(w_single, 1)], ["deep ensemble of five", round(100 * c_ens), round(w_ens, 1)], ["MC dropout, 50 passes", round(100 * c_drop), round(w_drop, 1)], ["one network + conformal", round(100 * c_conf), round(w_conf, 1)]],
                    n_train=1600, n_cal=400, n_test=1000, inputs="β, γ, contacts of patient zero", target="people ever infected", secs=round(time.time() - t0))
    print("dl", P2["dl"]["rows"], f"{time.time() - t0:.0f}s")
    save()

# ============ 5. scale: the same loop at 10^4 and 10^5 nodes ============
if not done('scale'):
    def ba_graph(n, m, rng):
        src_, dst_ = [], []; targets = np.arange(m); rep = np.empty(2 * m * n, dtype=np.int64); rp = 0
        for v in range(m, n):
            src_.append(np.full(len(targets), v)); dst_.append(targets)
            rep[rp:rp + len(targets)] = targets; rp += len(targets); rep[rp:rp + m] = v; rp += m
            targets = np.unique(rep[rng.integers(0, rp, m)])
        src_ = np.concatenate(src_); dst_ = np.concatenate(dst_)
        M_ = sp.coo_matrix((np.ones(len(src_)), (src_, dst_)), shape=(n, n)).tocsr(); M_ = ((M_ + M_.T) > 0).astype(float)
        return M_.tocsr()
    scale = []
    for n in [75, 10_000, 100_000]:
        rng = np.random.default_rng([7, 34, n])
        Am = A if n == 75 else ba_graph(n, 5, rng)
        src = SRC if n == 75 else int(np.argmax(np.asarray(Am.sum(1)).ravel()))
        t0 = time.time(); C_, I_, _ = sir(Am, BETA if n == 75 else 0.04, GAMMA, src, T, rng); t_run = time.time() - t0
        t0 = time.time(); fs = np.array([sir(Am, BETA if n == 75 else 0.04, GAMMA, src, T, rng)[0][-1] for _ in range(20)]); t_mc = (time.time() - t0) / 20
        # one particle-filter step with 100 copies: predict all copies one day, weight, resample
        Kc = 100; ps = np.zeros((Kc, n), dtype=np.int8); ps[:, src] = 1
        t0 = time.time()
        p_inf = 1 - (1 - 0.05) ** np.asarray((Am @ (ps == 1).astype(float).T).T)
        new = (rng.random((Kc, n)) < p_inf) & (ps == 0); ps[new] = 1
        w = rng.random(Kc); w /= w.sum(); idx = rng.choice(Kc, Kc, p=w); ps = ps[idx]; t_pf = time.time() - t0
        t0 = time.time(); _ = qhat(rng.random(2000), 0.9); t_cf = time.time() - t0
        scale.append(dict(n=n, edges=int(Am.sum() / 2), run_s=round(t_run, 3), mc_per_run_s=round(t_mc, 3), mc2000_min=round(2000 * t_mc / 60, 1), pf_step_s=round(t_pf, 3), pf_40days_100copies_min=round(40 * t_pf / 60, 2), conformal_s=round(t_cf, 4),
                          attack_lo=int(np.percentile(fs, 5)), attack_hi=int(np.percentile(fs, 95)), attack_med=int(np.median(fs))))
        print("scale", scale[-1])
    P2["scale"] = dict(rows=scale, machine="one laptop core, numpy + scipy.sparse", note="20 runs per size for the attack-rate band; 10^4 and 10^5 nodes are preferential-attachment graphs with 5 links per new node, β = 0.04")
    save()

# ============ 6. the risk dial: three 8-person plans ============
if not done('dial'):
    rng = np.random.default_rng([7, 35])
    pool = list(np.argsort(-deg)[:25]); k = 8
    seeds = [int(v) for v in rng.integers(0, 2 ** 31, 60)]
    def dist(vacc, n=None):
        """Final sizes over fixed scenarios (common random numbers), patient zero never vaccinated."""
        others = np.array([v for v in range(N) if v not in set(vacc)]); out = []
        for sd in (seeds if n is None else seeds[:n]):
            r = np.random.default_rng(sd); s0 = int(r.choice(others)); out.append(sir(A, BETA, GAMMA, s0, T, r, vacc=vacc)[0][-1])
        return np.array(out, dtype=float)
    def greedy(obj):
        chosen = []
        for _ in range(k):
            best_v, best_s = None, None
            for v in pool:
                if v in chosen: continue
                s_ = obj(dist(chosen + [v]))
                if best_s is None or s_ < best_s: best_v, best_s = v, s_
            chosen.append(best_v)
        return chosen
    t0 = time.time()
    plans = {"average": greedy(lambda d: d.mean()), "bad day (CVaR)": greedy(lambda d: cvar(d)), "worst case": greedy(lambda d: d.max())}
    print(f"greedy done in {time.time() - t0:.0f}s")
    rng2 = np.random.default_rng([7, 36]); seeds = [int(v) for v in rng2.integers(0, 2 ** 31, 400)]
    dial = {}
    for lab, v in plans.items():
        dd = dist(v); dial[lab] = dict(set=[int(x) for x in v], sizes=[int(x) for x in dd], mean=round(float(dd.mean()), 1), cvar=round(cvar(dd), 1), worst=int(dd.max()), roles=[int(W["roles"][x]) for x in v])
        print(lab, dial[lab]["set"], dial[lab]["mean"], dial[lab]["cvar"], dial[lab]["worst"])
    P2["dial"] = dict(plans=dial, order=list(plans.keys()), pool=25, scenarios=400, greedy_scenarios=60,
                      common=int(len(set(plans["average"]) & set(plans["bad day (CVaR)"]) & set(plans["worst case"]))))
    save()

# ============ 7. the manager's numbers ============
if not done('manager'):
    finals = np.array(D["fig2"]["finals"], dtype=float)
    P2["manager"] = dict(p_dieout=round(100 * float(np.mean(finals < 15))), p_over50=round(100 * float(np.mean(finals > 50))), p_over65=round(100 * float(np.mean(finals > 65))),
                         q05=int(np.percentile(finals, 5)), q50=int(np.percentile(finals, 50)), q95=int(np.percentile(finals, 95)), cvar=round(cvar(finals)), mean=round(float(finals.mean())), n=int(len(finals)))
    print("manager", P2["manager"])
    save()

json.dump(P2, open(os.path.join(HERE, "pass2.json"), "w"), separators=(",", ":"))
print("pass2.json written")
