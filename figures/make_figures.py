"""Generate every figure for the tutorial storyboard from ONE running example:
an outbreak on a synthetic hospital-ward contact network (4 roles: patients,
nurses, doctors, admin; sizes modelled on the SocioPatterns hospital study).

Run:  python -I make_figures.py
Writes PNGs next to this script.
"""
import os, sys
sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

OUT = os.path.dirname(os.path.abspath(__file__))
class _RNG:
    """The module's random stream, re-seeded per figure (rng.seed(n)) so that changing one figure never shifts the others."""
    def __init__(self): self.g = np.random.default_rng(7)
    def seed(self, *k): self.g = np.random.default_rng([7, *k])
    def __getattr__(self, name): return getattr(self.g, name)
rng = _RNG()

# ---------- style ----------
INK, BLUE, ORANGE, GREEN, RED, GRAY, LIGHT = "#1f2937", "#2563eb", "#ea580c", "#16a34a", "#dc2626", "#9ca3af", "#e5e7eb"
plt.rcParams.update({
    "font.size": 13, "axes.titlesize": 15, "axes.labelsize": 13, "axes.edgecolor": INK,
    "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 160,
    "savefig.bbox": "tight", "savefig.facecolor": "white", "legend.frameon": False,
})

def save(fig, name):
    fig.savefig(os.path.join(OUT, name))
    plt.close(fig)
    print("wrote", name)

# ---------- the ward network: SocioPatterns hospital ward (Vanhems et al. 2013) ----------
# data/hospital_lyon_contacts.dat.gz: one row per 20-second face-to-face contact (t, i, j, role_i, role_j).
# Two people are "in contact" if they spent at least 5 minutes face to face over the 4 days.
import gzip, collections, json
NUM = {}                                       # every number quoted on a slide is written to numbers.json
ROLE_NAME = {"PAT": "patient", "NUR": "nurse", "MED": "doctor", "ADM": "admin"}
secs = collections.Counter(); raw_role = {}
with gzip.open(os.path.join(OUT, "data", "hospital_lyon_contacts.dat.gz"), "rt") as f:
    for line in f:
        t, i, j, ri, rj = line.split(); i, j = int(i), int(j)
        secs[(min(i, j), max(i, j))] += 20; raw_role[i] = ROLE_NAME[ri]; raw_role[j] = ROLE_NAME[rj]
order_roles = ["patient", "nurse", "doctor", "admin"]
ids = sorted(raw_role, key=lambda v: (order_roles.index(raw_role[v]), v))
idx = {v: k for k, v in enumerate(ids)}
roles = [raw_role[v] for v in ids]
N = len(ids)
MIN_CONTACT = 300
G = nx.Graph(); G.add_nodes_from(range(N))
for (i, j), s in secs.items():
    if s >= MIN_CONTACT:
        G.add_edge(idx[i], idx[j], seconds=s)
for v in range(N):                             # nobody is isolated: keep each person's single strongest contact
    if G.degree(v) == 0:
        best = max(((p, s) for p, s in secs.items() if v in (idx[p[0]], idx[p[1]])), key=lambda x: x[1])[0]
        G.add_edge(idx[best[0]], idx[best[1]], seconds=secs[best])
comps = sorted(nx.connected_components(G), key=len, reverse=True)
for c in comps[1:]:
    G.add_edge(next(iter(c)), next(iter(comps[0])))
A = nx.to_numpy_array(G)
pos = nx.spring_layout(G, seed=4, k=0.35)
ROLE_COL = {"patient": BLUE, "nurse": GREEN, "doctor": ORANGE, "admin": GRAY}
deg = A.sum(1)
NUM["n_people"] = N; NUM["n_edges"] = G.number_of_edges(); NUM["mean_contacts"] = round(deg.mean(), 1)
NUM["roles"] = {r: roles.count(r) for r in order_roles}
print(f"real ward: {N} people, {G.number_of_edges()} edges, mean contacts {deg.mean():.1f}")
# empirical edge density between role groups (used to guess which contacts the badges might have missed)
P = np.zeros((4, 4))
for a, ra in enumerate(order_roles):
    for b, rb in enumerate(order_roles):
        ia = [v for v in range(N) if roles[v] == ra]; ib = [v for v in range(N) if roles[v] == rb]
        pairs = [(u, w) for u in ia for w in ib if u < w] if ra == rb else [(u, w) for u in ia for w in ib]
        P[a, b] = np.mean([A[u, w] for u, w in pairs]) if pairs else 0

# ---------- SIR simulation (discrete day, per-contact prob beta) ----------
def sir(A, beta, gamma, source, T=40, rng=rng, vacc=None):
    """Return I_count[t], cum_infected[t], final state array (0=S,1=I,2=R)."""
    n = A.shape[0]
    s = np.zeros(n, dtype=int)
    s[source] = 1
    if vacc is not None:
        s[vacc] = 2
    I_hist, C_hist = [], []
    for t in range(T + 1):
        I_hist.append(int((s == 1).sum()))
        C_hist.append(int((s != 0).sum() - (0 if vacc is None else len(vacc))))
        inf = (s == 1).astype(float)
        pressure = A @ inf
        p_inf = 1 - (1 - beta) ** pressure
        new = (rng.random(n) < p_inf) & (s == 0)
        rec = (rng.random(n) < gamma) & (s == 1)
        if t < T:                              # the state returned is day T's, the one the counts describe
            s[new] = 1
            s[rec] = 2
    return np.array(I_hist), np.array(C_hist), s

BETA, GAMMA, T = 0.08, 0.15, 40              # ground truth used throughout
# patient zero: a patient with a handful of contacts (so the outbreak sometimes dies out, sometimes not)
SRC = int(min((v for v in range(N) if roles[v] == "patient" and deg[v] >= 3), key=lambda v: abs(deg[v] - 4)))
NUM["src_contacts"] = int(deg[SRC]); print("patient zero", SRC, "contacts", deg[SRC])

def sir_states(A, beta, gamma, source, T, rng):
    """Like sir() but returns the full state array per day (T+1, n)."""
    n = A.shape[0]; s = np.zeros(n, dtype=int); s[source] = 1; hist = []
    for t in range(T + 1):
        hist.append(s.copy())
        inf = (s == 1).astype(float); p_inf = 1 - (1 - beta) ** (A @ inf)
        new = (rng.random(n) < p_inf) & (s == 0); rec = (rng.random(n) < gamma) & (s == 1)
        s[new] = 1; s[rec] = 2
    return np.array(hist)

def big_run(seed_start=100, min_size=40):
    """The 'what actually happened' outbreak used in later figures: one that took off,
    and was already visibly under way by day 8 (so the day-8 and day-10 questions are real)."""
    for sd in range(seed_start, seed_start + 400):
        H = sir_states(A, BETA, GAMMA, SRC, T, np.random.default_rng(sd))
        if (H[-1] != 0).sum() >= min_size and (H[8] != 0).sum() >= 10 and (H[10] != 0).sum() >= 18:
            return H
    raise RuntimeError("no large run found")
H_true = big_run()
C_true = (H_true != 0).sum(1); I_true2 = (H_true == 1).sum(1)

def draw_net(ax, colors, sizes_=60, edge_alpha=0.25, outline=None):
    nx.draw_networkx_edges(G, pos, ax=ax, alpha=edge_alpha, edge_color=INK, width=0.8)
    nx.draw_networkx_nodes(G, pos, ax=ax, node_color=colors, node_size=sizes_,
                           edgecolors=outline if outline is not None else "white", linewidths=1.2)
    ax.set_axis_off()

def mark_src(ax, label=True):
    ax.scatter([pos[SRC][0]], [pos[SRC][1]], s=260, facecolors="none", edgecolors=INK, linewidths=2.2, zorder=5)
    if label:
        ax.annotate("patient zero", pos[SRC], xytext=(18, -22), textcoords="offset points", fontsize=11, color=INK,
                    arrowprops=dict(arrowstyle="-", color=INK, lw=1))

# ===== Fig 0: the ward =====
fig, ax = plt.subplots(figsize=(7, 5.5))
draw_net(ax, [ROLE_COL[r] for r in roles], sizes_=90)
mark_src(ax)
ax.legend(handles=[Patch(color=c, label=f"{r}s ({roles.count(r)})") for r, c in ROLE_COL.items()],
          loc="lower left", fontsize=11)
ax.set_title("One hospital ward: 75 people, who is in contact with whom")
save(fig, "00_ward.png")

# ===== Fig 1: same outbreak, run twice =====
fig, axes = plt.subplots(1, 2, figsize=(11, 5))
runs = []
r1 = np.random.default_rng(11); r2 = np.random.default_rng(23)
for ax, r, lab in zip(axes, [r1, r2], ["Run A", "Run B"]):
    I, C, s = sir(A, BETA, GAMMA, SRC, T, rng=r)
    runs.append(C[-1])
    cols = [GRAY if v == 0 else (RED if v == 1 else ORANGE) for v in s]
    draw_net(ax, cols, sizes_=80)
    mark_src(ax)
    ax.set_title(f"{lab}, day 40: {C[-1]} people ever infected", color=INK)
fig.suptitle("Same ward, same virus, same first patient. Two different futures.", fontsize=16, y=1.02)
fig.legend(handles=[Patch(color=GRAY, label="never infected"), Patch(color=ORANGE, label="infected & recovered"),
                    Patch(color=RED, label="still infectious")], loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.04))
save(fig, "01_two_runs.png")

# ===== Fig 2: final-size distribution =====
rng.seed(2)
finals = np.array([sir(A, BETA, GAMMA, SRC, T)[1][-1] for _ in range(2000)])
lo, hi = np.percentile(finals, [5, 95])
fig, ax = plt.subplots(figsize=(9, 4.5))
ax.hist(finals, bins=np.arange(0, 77, 2), color=BLUE, alpha=0.85)
ax.axvline(finals.mean(), color=RED, lw=2, label=f"the 'average' outbreak = {finals.mean():.0f} people  (never actually happens)")
BIG = 15                                   # "big outbreak" = at least 20% of the ward, used everywhere
pd_ = (finals < BIG).mean()
ax.axvline(BIG, color=GRAY, ls=":", lw=1.5)
ax.text(6, 0.75 * ax.get_ylim()[1], f"dies out\n{pd_:.0%} of runs", color=INK, fontsize=12)
ax.text(44, 0.75 * ax.get_ylim()[1], f"big outbreak (≥{BIG} people)\n{1 - pd_:.0%} of runs", color=INK, fontsize=12)
lo_b, hi_b = np.percentile(finals[finals >= BIG], [5, 95])
NUM["fig2"] = dict(p_dieout=round(pd_, 2), p_big=round(1 - pd_, 2), mean=round(finals.mean()), big_lo=int(lo_b), big_hi=int(hi_b), runs=2000)
print(f"P(big) {1-pd_:.3f}; big-branch 5-95%: {lo_b:.0f}-{hi_b:.0f}; mean {finals.mean():.1f}")
ax.set_xlabel("people ever infected (out of 75)"); ax.set_ylabel("number of runs (of 2000)")
ax.set_title("2000 reruns of the same outbreak: the answer is a distribution")
ax.legend(loc="upper center", fontsize=11)
save(fig, "02_final_size.png")
print("P(dies out <5):", (finals < 5).mean(), " mean", finals.mean())

# ===== Fig 3: structure changes the risk =====
rng.seed(3)
mean_deg = deg.mean()
d_reg = int(round(mean_deg)); d_reg += (N * d_reg) % 2
G_hom = nx.random_regular_graph(d_reg, N, seed=5)
# hub network with same number of edges roughly
G_hub = nx.barabasi_albert_graph(N, max(1, int(round(mean_deg / 2))), seed=5)
# who patient zero is (how connected) changes the odds of a big outbreak
p_big_by_node = np.array([np.mean([sir(A, BETA, GAMMA, v, T)[1][-1] >= BIG for _ in range(120)]) for v in range(N)])
fig, ax = plt.subplots(figsize=(9, 4.5))
ax.scatter(deg, p_big_by_node, c=[ROLE_COL[r] for r in roles], s=70, edgecolors="white", zorder=3)
ax.set_xticks(range(0, int(deg.max()) + 2, 2))
ax.set_xlabel("number of contacts of patient zero"); ax.set_ylabel(f"P(big outbreak: ≥ {BIG} of 75 infected)")
ax.set_title("Same virus. Where it starts changes the odds.")
ax.legend(handles=[Patch(color=c, label=r) for r, c in ROLE_COL.items()], fontsize=11, loc="lower right")
ax.set_ylim(0, 1)
lo_i, hi_i = int(np.argmin(deg)), int(np.argmax(deg))
NUM["fig3"] = dict(min_contacts=int(deg[lo_i]), p_min=round(float(p_big_by_node[lo_i]), 2), min_role=roles[lo_i],
                   max_contacts=int(deg[hi_i]), p_max=round(float(p_big_by_node[hi_i]), 2), max_role=roles[hi_i])
print("fig3", NUM["fig3"])
save(fig, "03_structure_matters.png")

# ===== Fig 4: learning beta from early data (ABC) + fan chart =====
rng.seed(4)
obs_days = 10
obs = C_true[:obs_days + 1]
ABC_TOL = 4.0                              # keep a guess if it misses the counts by at most 4 cases a day (same as the live demo)
prior = rng.uniform(0.01, 0.30, 6000)
keep = []
for b in prior:
    I, C, _ = sir(A, b, GAMMA, SRC, T)
    d = np.abs(C[:obs_days + 1] - obs).mean()
    if d <= ABC_TOL:
        keep.append(b)
keep = np.array(keep)
print("ABC kept", len(keep))
# forecast: start from the ward as it actually is on day 10, run forward with each plausible beta
def sir_from(A, beta, gamma, s0, steps, rng=rng):
    s = s0.copy(); out = [int((s != 0).sum())]
    for _ in range(steps):
        inf = (s == 1).astype(float); p_inf = 1 - (1 - beta) ** (A @ inf)
        new = (rng.random(len(s)) < p_inf) & (s == 0); rec = (rng.random(len(s)) < gamma) & (s == 1)
        s[new] = 1; s[rec] = 2; out.append(int((s != 0).sum()))
    return np.array(out)
futures = np.array([np.concatenate([obs[:-1], sir_from(A, b, GAMMA, H_true[obs_days], T - obs_days)]) for b in keep for _ in range(4)])
fig, axes = plt.subplots(1, 2, figsize=(12, 4.5), gridspec_kw={"width_ratios": [1, 1.5]})
ax = axes[0]
bins = np.linspace(0.01, 0.30, 30)
ax.hist(prior, bins=bins, density=True, color=LIGHT, label="before data: 'anything from 1% to 30%'")
ax.hist(keep, bins=bins, density=True, color=BLUE, alpha=0.9, label="after 10 days of case counts")
ax.axvline(BETA, color=RED, lw=2, label="true β")
ax.set_xlabel("β, probability of passing it on per contact per day"); ax.set_ylabel("how plausible"); ax.set_yticks([])
ax.set_title("What 10 days of data tell us about β")
ax.legend(fontsize=10)
ax = axes[1]
days = np.arange(T + 1)
q05, q50, q95 = np.percentile(futures, [5, 50, 95], axis=0)
ax.fill_between(days, q05, q95, color=BLUE, alpha=0.2, label="90% band")
ax.plot(days, q50, color=BLUE, lw=2, label="median forecast")
ax.plot(days, C_true, color=RED, lw=2.2, label="what actually happened")
ax.plot(days[:obs_days + 1], obs, "o", color=INK, ms=4, label="observed (days 0–10)")
ax.axvline(obs_days, color=GRAY, ls="--"); ax.text(obs_days + 0.4, 2, "today", color=GRAY, fontsize=11)
ax.set_xlabel("day"); ax.set_ylabel("cumulative cases"); ax.set_title("Forecast from day 10, with a band")
ax.legend(fontsize=10, loc="lower right")
cov4 = np.mean((C_true[obs_days+1:] >= q05[obs_days+1:]) & (C_true[obs_days+1:] <= q95[obs_days+1:]))
k05, k95 = np.percentile(keep, [5, 95])
NUM["fig4"] = dict(coverage=round(cov4, 2), width20=int(q95[20]-q05[20]), width40=int(q95[40]-q05[40]), kept=len(keep), beta_lo=round(k05, 2), beta_hi=round(k95, 2))
print(f"fig4 coverage days 11-40: {cov4:.2f}; band width day20 {q95[20]-q05[20]:.0f}, day40 {q95[40]-q05[40]:.0f}; beta 90% {k05:.2f}-{k95:.2f}")
save(fig, "04_bayes_fan.png")

# ===== Fig 5: which unknown matters most (first-order Sobol by binning) =====
rng.seed(5)
M = 3000
bs = rng.uniform(0.03, 0.15, M); gs = rng.uniform(0.08, 0.30, M); i0 = rng.integers(0, N, M)
Y = np.array([sir(A, b, g, s0, T)[1][-1] for b, g, s0 in zip(bs, gs, i0)])
def s1(x, y, bins=12):
    edges = np.quantile(x, np.linspace(0, 1, bins + 1))
    idx = np.clip(np.searchsorted(edges, x, side="right") - 1, 0, bins - 1)
    means = np.array([y[idx == k].mean() for k in range(bins)])
    counts = np.array([(idx == k).sum() for k in range(bins)])
    return np.average((means - y.mean()) ** 2, weights=counts) / y.var()
S = {"β (transmission)": s1(bs, Y), "γ (recovery)": s1(gs, Y), "who is patient zero": s1(deg[i0] + rng.random(M) * 1e-3, Y)}
S["luck + interactions\n(no measurement removes it)"] = 1 - sum(S.values())
fig, ax = plt.subplots(figsize=(8.5, 4))
ax.barh(list(S.keys()), list(S.values()), color=[BLUE, GREEN, ORANGE, LIGHT])
for i, v in enumerate(S.values()):
    ax.text(v + 0.01, i, f"{v:.0%}", va="center")
ax.set_xlim(0, 1); ax.set_xlabel("share of the forecast's spread explained (main effect, Sobol first-order index)")
ax.set_title("Which unknown should we spend money measuring?")
NUM["fig5"] = {k.split(" ")[0].split("\n")[0]: int(round(100 * v)) for k, v in S.items()}
print("sobol", NUM["fig5"])
save(fig, "05_sensitivity.png")

# ===== Fig 6: we don't know the network either =====
rng.seed(6)
edges = list(G.edges())
miss = rng.random(len(edges)) < 0.35
G_obs = nx.Graph(); G_obs.add_nodes_from(G.nodes())
G_obs.add_edges_from([e for e, m in zip(edges, miss) if not m])
A_obs = nx.to_numpy_array(G_obs)
# "posterior" over graphs: recorded edges are certain; each unrecorded pair gets the probability that a real contact was missed.
# Only what the badges saw is used: the recorded density between two roles is 0.65 p if badges miss 35% (Genois et al. 2015),
# so p_hat = recorded / 0.65, and P(contact | not recorded) = P(contact and missed) / P(not recorded) = 0.35 p / (1 - 0.65 p).
MISS = 0.35
P_obs = np.zeros((4, 4))
for a, ra in enumerate(order_roles):
    for b, rb in enumerate(order_roles):
        ia = [v for v in range(N) if roles[v] == ra]; ib = [v for v in range(N) if roles[v] == rb]
        pairs = [(u, w) for u in ia for w in ib if u < w] if ra == rb else [(u, w) for u in ia for w in ib]
        P_obs[a, b] = np.mean([A_obs[u, w] for u, w in pairs]) if pairs else 0
P_hat = np.minimum(1.0, P_obs / (1 - MISS))
q = np.zeros((N, N))
for i in range(N):
    for j in range(N):
        if i != j and A_obs[i, j] == 0:
            p_ = P_hat[order_roles.index(roles[i]), order_roles.index(roles[j])]
            q[i, j] = MISS * p_ / (1 - (1 - MISS) * p_)
fut_fixed = np.array([sir(A_obs, BETA, GAMMA, SRC, T)[1] for _ in range(400)])
fut_samp = []
for _ in range(400):
    U = rng.random((N, N)); U = np.triu(U, 1); U = U + U.T
    As = np.maximum(A_obs, (U < q).astype(float))
    fut_samp.append(sir(As, BETA, GAMMA, SRC, T)[1])
fut_samp = np.array(fut_samp)
fig, axes = plt.subplots(1, 2, figsize=(13, 4.8), gridspec_kw={"width_ratios": [1, 1.5]})
ax = axes[0]
nx.draw_networkx_edges(G_obs, pos, ax=ax, alpha=0.35, edge_color=INK, width=0.8)
nx.draw_networkx_edges(G, pos, ax=ax, edgelist=[e for e, m in zip(edges, miss) if m], edge_color=RED, style="dashed", width=1.0, alpha=0.8)
nx.draw_networkx_nodes(G, pos, ax=ax, node_color=[ROLE_COL[r] for r in roles], node_size=40, edgecolors="white")
ax.set_axis_off(); ax.set_title("grey = contacts the badges recorded\nred dashed = the 35% they missed", fontsize=12)
ax = axes[1]
lb, hb = np.percentile(fut_samp, [5, 95], axis=0)
lg, hg = np.percentile(fut_fixed, [5, 95], axis=0)
ax.fill_between(days, lb, hb, color=BLUE, alpha=0.25, label="90% band, averaging over plausible full graphs")
ax.fill_between(days, lg, hg, facecolor="none", edgecolor=INK, hatch="////", lw=1.2, label="90% band, trusting the recorded graph as-is")
ax.plot(days, C_true, color=RED, lw=2.4, label="what actually happened (real contacts)")
ax.set_xlabel("day"); ax.set_ylabel("cumulative cases"); ax.legend(fontsize=10, loc="upper center", bbox_to_anchor=(0.5, -0.18), ncol=1)
ax.set_title("Trusting the recorded graph: the forecast runs too low", fontsize=12)
after = slice(10, None)
cov_g = np.mean((C_true[after] >= lg[after]) & (C_true[after] <= hg[after])); cov_b = np.mean((C_true[after] >= lb[after]) & (C_true[after] <= hb[after]))
NUM["fig6"] = dict(cov_recorded=int(round(100*cov_g)), width_recorded=int(hg[20]-lg[20]), cov_plausible=int(round(100*cov_b)), width_plausible=int(hb[20]-lb[20]), missed_pct=35)
print(f"fig6 coverage days10+: recorded {cov_g:.2f} (width d20 {hg[20]-lg[20]:.0f}), plausible {cov_b:.2f} (width d20 {hb[20]-lb[20]:.0f})")
save(fig, "06_graph_uncertainty.png")

# ===== Fig 7: Kalman predict / correct in one picture =====
x = np.linspace(0, 40, 400)
def gauss(m, s): return np.exp(-(x - m) ** 2 / (2 * s ** 2)) / (s * np.sqrt(2 * np.pi))
m0, s0 = 18, 5; mz, sz = 26, 3
sp = (m0 / s0 ** 2 + mz / sz ** 2) / (1 / s0 ** 2 + 1 / sz ** 2); spv = 1 / np.sqrt(1 / s0 ** 2 + 1 / sz ** 2)
fig, ax = plt.subplots(figsize=(9, 4))
ax.plot(x, gauss(m0, s0), color=GRAY, lw=2.5, label="1. predict: 'the model says ~18 infected, give or take 5'")
ax.plot(x, gauss(mz, sz), color=ORANGE, lw=2.5, label="2. measure: 'tests say ~26, give or take 3'")
ax.plot(x, gauss(sp, spv), color=BLUE, lw=3, label=f"3. combine: ~{sp:.0f}, give or take {spv:.1f}  (narrower than both)")
ax.set_yticks([]); ax.set_xlabel("number of infected people in the ward right now")
ax.set_title("The Kalman filter is a weighted average, repeated every time tests come in")
ax.legend(fontsize=10.5, loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=1)
save(fig, "07_kalman_idea.png")

# ===== Fig 8: particle filter tracking the hidden prevalence =====
rng.seed(8)
test_frac = 0.3
tested = rng.random(N) < test_frac          # which people get tested every 2 days (the "sensors")
# observations: positive tests among tested nodes, with 10% false negative, every 2 days
y_obs, y_node = {}, {}
SENS, FPR = 0.9, 0.02
for t in range(0, T + 1, 2):
    truly = (H_true[t] == 1)
    res = np.where(truly, rng.random(N) < SENS, rng.random(N) < FPR) & tested   # per-person test result
    y_node[t] = res
    y_obs[t] = int(res.sum())
# bootstrap particle filter: particles = (beta, state vector). The copies allow a small chance of
# infection from outside the ward (visitors), so copies where the outbreak died can come back to life.
K = 1000
IMPORT = 0.003
pb = rng.uniform(0.03, 0.15, K)
ps = np.zeros((K, N), dtype=int); ps[:, SRC] = 1
est_lo, est_md, est_hi, pinf_day20 = [], [], [], None
from scipy.stats import binom
for t in range(T + 1):
    Ic = (ps == 1).sum(1)
    if t in y_obs:
        # per-person likelihood of each test result under each particle's hidden state
        inf_p = (ps == 1)[:, tested]; r = y_node[t][tested][None, :]
        logw = (r * np.where(inf_p, np.log(SENS), np.log(FPR)) + (1 - r) * np.where(inf_p, np.log(1 - SENS), np.log(1 - FPR))).sum(1)
        w = np.exp(logw - logw.max()); w /= w.sum()
        idx = rng.choice(K, K, p=w)
        ps, pb = ps[idx], pb[idx]
        pb = np.clip(pb + rng.normal(0, 0.004, K), 0.01, 0.3)
        Ic = (ps == 1).sum(1)
    est_lo.append(np.percentile(Ic, 5)); est_md.append(np.median(Ic)); est_hi.append(np.percentile(Ic, 95))
    if t == 20:
        pinf_day20 = (ps == 1).mean(0)
    # propagate each particle one day
    inf = (ps == 1).astype(float)
    p_inf = 1 - (1 - IMPORT) * (1 - pb[:, None]) ** (inf @ A.T)
    new = (rng.random((K, N)) < p_inf) & (ps == 0); rec = (rng.random((K, N)) < GAMMA) & (ps == 1)
    ps[new] = 1; ps[rec] = 2
est_lo, est_hi = np.array(est_lo), np.array(est_hi)
fig, ax = plt.subplots(figsize=(9.5, 4.8))
ax.fill_between(days, est_lo, est_hi, color=BLUE, alpha=0.22, label="filter: 90% band")
ax.plot(days, est_md, color=BLUE, lw=2, label="filter: best estimate")
ax.plot(days, I_true2, color=RED, lw=2.2, label="truth (hidden)")
scale = 1 / (tested.mean() * SENS)
ax.plot(list(y_obs.keys()), [v * scale for v in y_obs.values()], "o", color=INK, ms=4, label=f"positive tests × {scale:.1f} (30% tested, 90% sensitivity; includes false positives)")
ax.set_xlabel("day"); ax.set_ylabel("people infectious right now")
ax.set_title("Tracking the hidden count from 30% of people tested every 2 days")
ax.legend(fontsize=9.5, loc="upper right")
cov8 = np.mean((I_true2 >= est_lo) & (I_true2 <= est_hi))
def pf_run(H):
    """The same bootstrap particle filter on another outbreak H (states per day); returns (lo, hi) of its 90% band."""
    yn = {}
    for t_ in range(0, T + 1, 2):
        truly_ = (H[t_] == 1); yn[t_] = np.where(truly_, rng.random(N) < SENS, rng.random(N) < FPR) & tested
    pb_ = rng.uniform(0.03, 0.15, K); ps_ = np.zeros((K, N), dtype=int); ps_[:, SRC] = 1; lo_, hi_ = [], []
    for t_ in range(T + 1):
        if t_ in yn:
            inf_p = (ps_ == 1)[:, tested]; r_ = yn[t_][tested][None, :]
            lw_ = (r_ * np.where(inf_p, np.log(SENS), np.log(FPR)) + (1 - r_) * np.where(inf_p, np.log(1 - SENS), np.log(1 - FPR))).sum(1)
            w_ = np.exp(lw_ - lw_.max()); w_ /= w_.sum(); idx_ = rng.choice(K, K, p=w_); ps_, pb_ = ps_[idx_], pb_[idx_]
            pb_ = np.clip(pb_ + rng.normal(0, 0.004, K), 0.01, 0.3)
        Ic_ = (ps_ == 1).sum(1); lo_.append(np.percentile(Ic_, 5)); hi_.append(np.percentile(Ic_, 95))
        p_inf = 1 - (1 - IMPORT) * (1 - pb_[:, None]) ** ((ps_ == 1).astype(float) @ A.T)
        new_ = (rng.random((K, N)) < p_inf) & (ps_ == 0); rec_ = (rng.random((K, N)) < GAMMA) & (ps_ == 1)
        ps_[new_] = 1; ps_[rec_] = 2
    return np.array(lo_), np.array(hi_)
N_REP8 = 20; covs8, wids8 = [], []
for r8 in range(N_REP8):
    Hf = sir_states(A, BETA, GAMMA, SRC, T, rng); If = (Hf == 1).sum(1)
    lo_f, hi_f = pf_run(Hf); covs8.append(np.mean((If >= lo_f) & (If <= hi_f))); wids8.append(np.mean(hi_f - lo_f))
print(f"fig8 repeated on {N_REP8} fresh outbreaks: coverage {np.mean(covs8):.2f}, width {np.mean(wids8):.1f}")
NUM["fig8"] = dict(days_in=int(round(cov8*41)), coverage=int(round(100*cov8)), width=round(float(np.mean(est_hi-est_lo))), scale=round(scale, 1), particles=K,
                   rep=dict(outbreaks=N_REP8, coverage=int(round(100*np.mean(covs8))), width=round(float(np.mean(wids8)), 1)))
print(f"fig8 coverage {cov8:.2f} ({int(cov8*41)}/41 days), mean band width {np.mean(est_hi-est_lo):.1f}")
save(fig, "08_filter_tracking.png")

# ===== Fig 9: where are we unsure? uncertainty map on the ward =====
unc = pinf_day20 * (1 - pinf_day20)
pos20 = y_node[20]
fig, ax = plt.subplots(figsize=(8, 6))
nx.draw_networkx_edges(G, pos, ax=ax, alpha=0.2, edge_color=INK, width=0.8)
edgecol = [RED if pos20[i] else (INK if tested[i] else "white") for i in range(N)]
nodes = nx.draw_networkx_nodes(G, pos, ax=ax, node_color=unc, cmap="Oranges", vmin=0, vmax=0.25, node_size=120,
                               edgecolors=edgecol, linewidths=[2.4 if tested[i] else 1 for i in range(N)])
cb = plt.colorbar(nodes, ax=ax, shrink=0.7); cb.set_label("filter's uncertainty about this person")
ax.set_axis_off()
u_t, u_u = unc[tested].mean(), unc[~tested].mean()
NUM["fig9"] = dict(tested=round(float(u_t), 2), untested=round(float(u_u), 2), max_untested=round(float(unc[~tested].max()), 2))
print(f"mean uncertainty tested {u_t:.3f} untested {u_u:.3f}, max untested {unc[~tested].max():.2f}")
ax.legend(handles=[plt.Line2D([], [], marker="o", ls="", mfc="white", mec=RED, mew=2.4, ms=10, label="tested today: positive"),
                   plt.Line2D([], [], marker="o", ls="", mfc="white", mec=INK, mew=2.4, ms=10, label="tested today: negative"),
                   plt.Line2D([], [], marker="o", ls="", mfc=ORANGE, mec="white", ms=10, label="not tested: dark = unsure")],
          loc="lower left", fontsize=10)
ax.set_title(f"Day 20: where is the filter unsure?\nTested people: ~{u_t:.2f}. Untested: ~{u_u:.2f}, up to {unc[~tested].max():.2f}. The dark dots are whom to test next.", fontsize=12)
save(fig, "09_uncertainty_map.png")

# ===== Fig 10: conformal calibration: coverage before / after =====
rng.seed(10)
# a structurally wrong forecaster: it knows the true beta and gamma but IGNORES THE NETWORK
# (classic mean-field SIR: everyone meets everyone at the average rate)
def forecaster(I_now, C_now, beta_hat=BETA, h=5):
    Ii, Cc = I_now, C_now
    for _ in range(h):
        S_ = N - Cc
        new = beta_hat * mean_deg * Ii * S_ / N
        Ii = Ii + new - GAMMA * Ii; Cc = Cc + new
    return Ii
rows = []
N_CAL, N_TEST = 2000, 1000
for _ in range(N_CAL + N_TEST):
    I, C, _ = sir(A, BETA, GAMMA, rng.integers(0, N), T)
    t = rng.integers(3, T - 5)
    rows.append((I[t], C[t], I[t + 5]))
rows = np.array(rows, dtype=float)
pred = np.array([forecaster(a, b) for a, b, _ in rows])
res = rows[:, 2] - pred
cal, test = np.arange(N_CAL), np.arange(N_CAL, N_CAL + N_TEST)
naive_sigma = 2.0   # the model's own claimed "± 2 people" (over-confident)
levels = np.linspace(0.5, 0.95, 10)
cov_naive, cov_conf, w_naive, w_conf = [], [], [], []
from scipy.stats import norm
for a in levels:
    z = norm.ppf(0.5 + a / 2)
    cov_naive.append((np.abs(res[test]) <= z * naive_sigma).mean()); w_naive.append(2 * z * naive_sigma)
    qhat = np.quantile(np.abs(res[cal]), min(1, np.ceil((len(cal) + 1) * a) / len(cal)))
    cov_conf.append((np.abs(res[test]) <= qhat).mean()); w_conf.append(2 * qhat)
fig, axes = plt.subplots(1, 2, figsize=(12.5, 4.6), gridspec_kw={"width_ratios": [1.4, 1]})
ax = axes[0]
ax.plot(levels, levels, "--", color=GRAY, lw=2, label="perfect: says 90%, is right 90%")
ax.plot(levels, cov_naive, "-o", color=ORANGE, lw=2.2, label="model's own band (± 2 people)")
ax.plot(levels, cov_conf, "-o", color=BLUE, lw=2.2, label="same model, conformal band")
ax.set_xlabel("confidence the band claims"); ax.set_ylabel("how often the truth was inside")
ax.set_title("Coverage: are the bands honest?")
ax.legend(fontsize=10.5, loc="upper left")
ax = axes[1]
ax.plot(levels, w_naive, "-o", color=ORANGE, lw=2.2); ax.plot(levels, w_conf, "-o", color=BLUE, lw=2.2)
ax.set_xlabel("confidence the band claims"); ax.set_ylabel("band width (people)")
ax.set_title("Width: the price of honesty")
i90 = int(np.argmin(np.abs(levels - 0.9)))
NUM["fig10"] = dict(n_cal=N_CAL, n_test=N_TEST, naive_cov=int(round(100*cov_naive[i90])), naive_width=round(w_naive[i90], 1), conf_cov=int(round(100*cov_conf[i90])), conf_width=round(w_conf[i90], 1))
print(f"fig10 @90%: naive cov {cov_naive[i90]:.2f} width {w_naive[i90]:.1f}; conformal cov {cov_conf[i90]:.2f} width {w_conf[i90]:.1f}")
fig.suptitle("A forecaster that ignores the network, before and after conformal calibration", fontsize=14, y=1.03)
save(fig, "10_conformal_coverage.png")

# ===== Fig 11: who was patient zero? posterior on the ward + 90% set =====
rng.seed(11)
snap_day = 8
snapshot = (H_true[snap_day] != 0)
scores = np.zeros(N)
for cand in range(N):
    if not snapshot[cand]:
        continue                      # patient zero must be among the infected
    hits = 0
    for _ in range(100):
        Hc = sir_states(A, BETA, GAMMA, cand, snap_day, rng)
        sc = (Hc[snap_day] != 0)
        inter = (sc & snapshot).sum(); union = (sc | snapshot).sum()
        hits += np.exp(25 * (inter / max(union, 1) - 1))     # soft likelihood of the snapshot
    scores[cand] = hits / 100
post = scores / scores.sum()
order = np.argsort(-post); cum = np.cumsum(post[order]); k90 = int(np.searchsorted(cum, 0.9) + 1)
set90 = order[:k90]
fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))
ax = axes[0]
nx.draw_networkx_edges(G, pos, ax=ax, alpha=0.2, edge_color=INK, width=0.8)
# the path the infection actually took out of patient zero (edges between infected people touching the source)
nx.draw_networkx_edges(G, pos, ax=ax, edgelist=[(SRC, j) for j in G.neighbors(SRC) if snapshot[j]], edge_color=RED, width=2.2)
nx.draw_networkx_nodes(G, pos, ax=ax, node_color=[RED if v else LIGHT for v in snapshot], node_size=90, edgecolors="white")
mark_src(ax)
n_inf = int(snapshot.sum())
ax.set_axis_off(); ax.set_title(f"Day {snap_day}: {n_inf} infected so far (red).\nWho started it?", fontsize=13)
ax = axes[1]
nx.draw_networkx_edges(G, pos, ax=ax, alpha=0.2, edge_color=INK, width=0.8)
nd = nx.draw_networkx_nodes(G, pos, ax=ax, node_color=post, cmap="Blues", vmin=0, vmax=post.max(), node_size=90,
                            edgecolors=[ORANGE if i in set90 else "white" for i in range(N)], linewidths=[2.5 if i in set90 else 1 for i in range(N)])
mark_src(ax, label=False)
cb = plt.colorbar(nd, ax=ax, shrink=0.7); cb.set_label("probability of being patient zero")
ax.set_axis_off(); ax.set_title(f"Top suspect: {'right' if order[0]==SRC else 'wrong'}. 90% set (orange rings): {k90} of the {n_inf} infected, truth {'inside' if SRC in set90 else 'outside'}.\n"
                                f"It clears {n_inf-k90} infected people and all {N-n_inf} uninfected.", fontsize=11.5)
save(fig, "11_source.png")
NUM["fig11"] = dict(top1_right=bool(order[0] == SRC), set_size=int(k90), infected=int(n_inf), in_set=bool(SRC in set90), cleared_infected=int(n_inf - k90), uninfected=int(N - n_inf), day=snap_day)
print("top-1 source", order[0], "true", SRC, "set size", k90, "infected", n_inf)

# ===== Fig 12: whom to vaccinate? the risk dial =====
rng.seed(12)
# The vaccination decision is made BEFORE the outbreak, so patient zero is unknown: drawn at random.
# (That is why "no vaccination" averages higher than figure 02, where patient zero was a 4-contact patient.)
def spread_dist(vacc, n=400):
    pool = np.array([v for v in range(N) if v not in set(vacc)])   # patient zero is never a vaccinated person
    return np.array([sir(A, BETA, GAMMA, int(rng.choice(pool)), T, vacc=vacc)[1][-1] for _ in range(n)])
def cvar(d, a=0.9): return np.sort(d)[int(a * len(d)):].mean()
k = 8
cands = list(np.argsort(-deg)[:25])            # candidate pool for the greedy search: the 25 most connected
cand_sets = {
    "no vaccination": [],
    f"random {k}": list(rng.choice(N, k, replace=False)),
    f"{k} most-connected": list(np.argsort(-deg)[:k]),
}
dists = {lab: spread_dist(v) for lab, v in cand_sets.items()}
fig, ax = plt.subplots(figsize=(10, 5.2))
labs = list(dists.keys())
parts = ax.violinplot([dists[l] for l in labs], showextrema=False)
for pc, col in zip(parts["bodies"], [LIGHT, GRAY, BLUE]):
    pc.set_facecolor(col); pc.set_alpha(0.5)
for i, l in enumerate(labs, 1):
    d = dists[l]; mean = d.mean(); cv = cvar(d)
    ax.plot([i], [mean], "o", color=INK, ms=8, zorder=4); ax.plot([i], [cv], "s", color=RED, ms=8, zorder=4)
    ax.text(i + 0.2, mean, f"avg {mean:.0f}", va="center", fontsize=10.5)
    ax.text(i + 0.2, cv, f"bad day {cv:.0f}", va="center", fontsize=10.5, color=RED)
    print(l.replace("\n", " "), f"mean {mean:.1f} cvar {cv:.1f} max {d.max()}")
    NUM.setdefault("fig12", {})[l] = dict(mean=int(round(mean)), cvar=int(round(cv)))
ax.set_xticks(range(1, len(labs) + 1)); ax.set_xticklabels(labs, fontsize=11)
ax.set_ylabel("people infected (400 outbreaks, patient zero unknown)")
ax.set_title(f"Vaccinating {k} people: the average improves a lot, the bad day barely moves")
ax.plot([], [], "o", color=INK, label="average outcome"); ax.plot([], [], "s", color=RED, label="bad day = CVaR: the average of the worst 10% of outbreaks")
ax.legend(fontsize=10.5, loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=2)
save(fig, "12_intervention.png")


print("done")
