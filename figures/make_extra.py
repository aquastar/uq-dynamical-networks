"""Extra graphics for the deck, and the "repeat on 100 outbreaks" numbers.
Runs make_figures.py first (it imports it), then writes numbers.json.
Run:  python -I make_extra.py
"""
from make_figures import *
from itertools import permutations

# ----- ladder graphic, one version per lit rung (slide 4 and every part opener) -----
RUNGS = ["Luck", "Numbers we don't know", "A graph we don't fully know", "What we can't see", "A model that is wrong"]
RUNG_SUB = ["who coughs on whom", "how contagious, how long", "contacts never recorded", "30% tested, tests miss cases", "reality is not the simulator"]
def ladder(lit, name):
    fig, ax = plt.subplots(figsize=(7.5, 5.2))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6); ax.set_axis_off()
    ax.plot([1, 1], [0.4, 5.8], color=INK, lw=4); ax.plot([2.2, 2.2], [0.4, 5.8], color=INK, lw=4)
    for kk in range(5):
        y = 1 + kk
        on = (kk + 1) == lit
        done = lit is not None and (kk + 1) < lit
        col = ORANGE if on else (BLUE if done else LIGHT)
        ax.plot([1, 2.2], [y, y], color=col, lw=9, solid_capstyle="round")
        ax.text(2.7, y + 0.12, f"{kk+1}. {RUNGS[kk]}", fontsize=15, fontweight="bold" if on else "normal", color=INK if (on or done) else GRAY, va="center")
        ax.text(2.7, y - 0.28, RUNG_SUB[kk], fontsize=11, color=INK if on else GRAY, va="center")
    ax.text(0.2, 1, "aleatoric", fontsize=10, color=GRAY, rotation=90, va="center", ha="center")
    ax.text(0.2, 3.5, "epistemic", fontsize=10, color=GRAY, rotation=90, va="center", ha="center")
    ax.plot([0.5, 0.5], [1.7, 5.3], color=GRAY, lw=1); ax.plot([0.5, 0.5], [0.7, 1.3], color=GRAY, lw=1)
    save(fig, name)
ladder(None, "L0_ladder.png")
for kk in range(1, 6):
    ladder(kk, f"L{kk}_ladder.png")

# ----- SIR rules on a 4-person piece of the ward (slide 5) -----
nbrs = [j for j in G.neighbors(SRC)][:3]
sub = [SRC] + nbrs
fig, axes = plt.subplots(1, 3, figsize=(12, 3.6))
states = [{SRC: 1}, {SRC: 1, nbrs[0]: 1}, {SRC: 2, nbrs[0]: 1, nbrs[1]: 1}]
titles = ["day 0: patient zero is infectious", "day 1: passed on with probability β\nper contact per day", "day 2: patient zero recovered\nwith probability γ per day"]
for ax, st, ttl in zip(axes, states, titles):
    H = G.subgraph(sub); p2 = {v: pos[v] for v in sub}
    nx.draw_networkx_edges(H, p2, ax=ax, edge_color=INK, alpha=0.4, width=1.5)
    cols = [{0: LIGHT, 1: RED, 2: ORANGE}[st.get(v, 0)] for v in sub]
    nx.draw_networkx_nodes(H, p2, ax=ax, node_color=cols, node_size=700, edgecolors=INK, linewidths=1.5)
    ax.set_axis_off(); ax.set_title(ttl, fontsize=12)
fig.legend(handles=[Patch(color=LIGHT, label="Susceptible"), Patch(color=RED, label="Infectious"), Patch(color=ORANGE, label="Recovered")], loc="lower center", ncol=3, bbox_to_anchor=(0.5, -0.06))
save(fig, "14_sir_rules.png")

# ----- three ways to put a band on a graph, all on the same 6-person corner (slide 15) -----
rng.seed(15)
corner = [SRC] + [j for j in G.neighbors(SRC)][:2]
for j in list(corner):
    for kk in G.neighbors(j):
        if kk not in corner and len(corner) < 6: corner.append(kk)
corner = corner[:6]
Hc = G.subgraph(corner); pc = {v: pos[v] for v in corner}
fig, axes = plt.subplots(1, 3, figsize=(14, 4.4))
ax = axes[0]
for u in corner:
    for w in corner:
        if u < w:
            pr = 1.0 if A_obs[u, w] else q[u, w]
            ax.plot([pc[u][0], pc[w][0]], [pc[u][1], pc[w][1]], color=BLUE, alpha=min(1, 0.15 + pr), lw=1 + 4 * pr)
            if pr < 1: ax.text((pc[u][0]+pc[w][0])/2, (pc[u][1]+pc[w][1])/2, f"{pr:.0%}", fontsize=9, color=INK, ha="center")
nx.draw_networkx_nodes(Hc, pc, ax=ax, node_color=[ROLE_COL[roles[v]] for v in corner], node_size=400, edgecolors="white")
ax.set_axis_off(); ax.set_title("(a) each possible contact gets a probability\n(thick = recorded, thin = guessed)", fontsize=11)
ax = axes[1]
for v in corner:
    sp = 0.08 / np.sqrt(max(1, A_obs[v].sum()))
    cloud = rng.normal(0, sp, (120, 2)) + pc[v]
    ax.scatter(cloud[:, 0], cloud[:, 1], s=6, color=ROLE_COL[roles[v]], alpha=0.25)
    ax.scatter([pc[v][0]], [pc[v][1]], s=60, color=ROLE_COL[roles[v]], edgecolors="white")
ax.set_axis_off(); ax.set_title("(b) each person is a cloud of possible positions;\nclose clouds = likely contact", fontsize=11)
ax = axes[2]
score = np.zeros((N, N))
for sd in range(30):
    Hh = sir_states(A, BETA, GAMMA, SRC, 25, np.random.default_rng(500 + sd))
    for t in range(1, 26):
        newly = np.where((Hh[t] == 1) & (Hh[t-1] == 0))[0]; infct = np.where(Hh[t-1] == 1)[0]
        for a in newly:
            for b in infct: score[a, b] += 1 / len(infct); score[b, a] += 1 / len(infct)
sc = score / max(score.max(), 1e-9)
for u in corner:
    for w in corner:
        if u < w and sc[u, w] > 0.02:
            ax.plot([pc[u][0], pc[w][0]], [pc[u][1], pc[w][1]], color=ORANGE, alpha=min(1, 0.2 + sc[u, w]), lw=1 + 5 * sc[u, w])
for u, w in Hc.edges():
    ax.plot([pc[u][0], pc[w][0]], [pc[u][1], pc[w][1]], color=INK, lw=0.8, ls=":", alpha=0.6)
nx.draw_networkx_nodes(Hc, pc, ax=ax, node_color=[ROLE_COL[roles[v]] for v in corner], node_size=400, edgecolors="white")
ax.set_axis_off(); ax.set_title("(c) contacts inferred from who fell ill after whom\n(orange = inferred weight, dotted = true contacts)", fontsize=11)
save(fig, "15_three_ways.png")

# ----- particle filter in three rows of thumbnails (slide 18) -----
def tiny(ax, s):
    cols = [{0: LIGHT, 1: RED, 2: ORANGE}[v] for v in s]
    nx.draw_networkx_nodes(G, pos, ax=ax, node_color=cols, node_size=6, linewidths=0)
    ax.set_axis_off()
rngp = np.random.default_rng(77)
def particle_weights(cps, day):
    ll_ = []
    for s_ in cps:
        inf_p = (s_ == 1)[tested]; r_ = y_node[day][tested]
        ll_.append((r_ * np.where(inf_p, np.log(SENS), np.log(FPR)) + (1 - r_) * np.where(inf_p, np.log(1 - SENS), np.log(1 - FPR))).sum())
    ll_ = np.array(ll_); w_ = np.exp(ll_ - ll_.max()); return w_ / w_.sum()
# six copies whose fit to the day's tests is spread out (a dominant copy at 40-70%, two or three others alive), so the
# resampling row shows duplication rather than collapse; the first (day, seed block) that qualifies is used
best = None
for day_ in [12, 10, 14, 16, 8]:
    for base in range(900, 3000, 6):
        cps = np.array([sir_states(A, BETA, GAMMA, SRC, day_, np.random.default_rng(base + i))[day_] for i in range(6)])
        w_ = particle_weights(cps, day_)
        ok = 0.4 <= w_.max() <= 0.7 and int((w_ > 0.05).sum()) >= 3
        if ok and (best is None or abs(w_.max() - 0.55) < best[0]):
            best = (abs(w_.max() - 0.55), day_, cps, w_)
    if best is not None:
        break
if best is None:                                     # no spread set found: fall back to the old day-12 copies
    cps = np.array([sir_states(A, BETA, GAMMA, SRC, 12, np.random.default_rng(900 + i))[12] for i in range(6)])
    best = (0, 12, cps, particle_weights(cps, 12))
_, PART_DAY, copies, w = best
# systematic resampling: copy k is kept round(6 w_k) times, give or take one
cw = np.cumsum(w); u0 = rngp.random() / 6
keep_idx = np.array([int(np.searchsorted(cw, (u0 + j) / 6)) for j in range(6)])
print("particles: day", PART_DAY, "weights", np.round(w, 2), "kept", keep_idx)
fig, axes = plt.subplots(3, 6, figsize=(13, 6.2))
for i in range(6):
    tiny(axes[0, i], copies[i]); axes[0, i].set_title(f"copy {i+1}: {int((copies[i]==1).sum())} infectious", fontsize=9)
    tiny(axes[1, i], copies[i]); axes[1, i].set_title(f"fit to today's tests: {w[i]:.0%}", fontsize=9, color=GREEN if w[i] > 0.1 else RED)
    tiny(axes[2, i], copies[keep_idx[i]]); axes[2, i].set_title(f"kept: copy {keep_idx[i]+1}", fontsize=9)
axes[0, 0].text(-0.15, 0.5, "1. predict\n(advance each copy a day)", transform=axes[0, 0].transAxes, fontsize=10, ha="right", va="center")
axes[1, 0].text(-0.15, 0.5, "2. measure\n(compare with the tests)", transform=axes[1, 0].transAxes, fontsize=10, ha="right", va="center")
axes[2, 0].text(-0.15, 0.5, "3. resample\n(duplicate the good, drop the bad)", transform=axes[2, 0].transAxes, fontsize=10, ha="right", va="center")
fig.suptitle(f"Day {PART_DAY}: six of the 1000 copies of the ward", fontsize=13)
fig.subplots_adjust(left=0.2)
save(fig, "16_particle_rows.png")

# ----- rumor centrality on a small tree cut from the ward (slide 25) -----
Tsub = nx.bfs_tree(G, SRC, depth_limit=2)
tn = list(Tsub.nodes())[:7]
Tt = nx.Graph(Tsub.subgraph(tn).edges())
infected_t = [SRC] + [v for v in Tt.neighbors(SRC)][:2]
infected_t += [v for v in Tt.neighbors(infected_t[1]) if v != SRC][:1]
infected_t = infected_t[:4]
def n_orders(tree, inf, src):
    cnt = 0
    others = [v for v in inf if v != src]
    for perm in permutations(others):
        seq = [src] + list(perm); ok = True
        for kk in range(1, len(seq)):
            if not any(tree.has_edge(seq[kk], seq[m]) for m in range(kk)): ok = False; break
        cnt += ok
    return cnt
cands_t = [infected_t[0], infected_t[-1]]
fig, axes = plt.subplots(1, 2, figsize=(11, 4.2))
pt = nx.spring_layout(Tt, seed=2)
for ax, c in zip(axes, cands_t):
    nx.draw_networkx_edges(Tt, pt, ax=ax, edge_color=INK, alpha=0.5, width=1.5)
    nx.draw_networkx_nodes(Tt, pt, ax=ax, node_color=[RED if v in infected_t else LIGHT for v in Tt.nodes()], node_size=500, edgecolors=[INK if v == c else "white" for v in Tt.nodes()], linewidths=[3 if v == c else 1 for v in Tt.nodes()])
    ax.set_axis_off()
    ax.set_title(f"if the outlined person started it:\n{n_orders(Tt, infected_t, c)} possible orders of infection", fontsize=12)
fig.suptitle("Seven people, four infected. Who started it? Count the ways.", fontsize=13, y=1.04)
save(fig, "17_rumor_tree.png")
NUM["fig17"] = dict(orders=[n_orders(Tt, infected_t, c) for c in cands_t])

# ----- the 8 picked from the recorded vs the real graph (slide 28) -----
rng.seed(18)
deg_obs = A_obs.sum(1)
pick_real = list(np.argsort(-deg)[:k]); pick_obs = list(np.argsort(-deg_obs)[:k])
d_obs_plan = spread_dist(pick_obs, 400); d_real_plan = spread_dist(pick_real, 400)
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
other = set(pick_real) ^ set(pick_obs)
for ax, picks, ttl, d in zip(axes, [pick_obs, pick_real], ["chosen from the RECORDED graph", "chosen from the REAL graph"], [d_obs_plan, d_real_plan]):
    nx.draw_networkx_edges(G, pos, ax=ax, alpha=0.15, edge_color=INK, width=0.8)
    nx.draw_networkx_nodes(G, pos, ax=ax, node_color=[ROLE_COL[r] for r in roles], node_size=35, edgecolors="white")
    nx.draw_networkx_nodes(G, pos, ax=ax, nodelist=picks, node_color=[ROLE_COL[roles[v]] for v in picks], node_size=260,
                           edgecolors=[RED if v in other else INK for v in picks], linewidths=2.8)
    ax.set_axis_off(); ax.set_title(f"{k} people {ttl}\naverage {d.mean():.0f}, bad day {cvar(d):.0f}", fontsize=12)
fig.suptitle(f"{len(set(pick_real) & set(pick_obs))} of {k} in common. Red ring = picked in one plan only.", fontsize=13, y=1.02)
save(fig, "18_recorded_vs_real_picks.png")
NUM["fig18"] = dict(common=int(len(set(pick_real) & set(pick_obs))), obs_mean=int(round(d_obs_plan.mean())), obs_cvar=int(round(cvar(d_obs_plan))), real_mean=int(round(d_real_plan.mean())), real_cvar=int(round(cvar(d_real_plan))))

# ----- repeat on 100 outbreaks: does the 90% suspect set hold patient zero? -----
rng.seed(21)
def source_set(snapshot_, day, nsim=40):
    sc_ = np.zeros(N)
    for cand in np.where(snapshot_)[0]:
        hits = 0
        for _ in range(nsim):
            Hc_ = sir_states(A, BETA, GAMMA, cand, day, rng)
            s_ = (Hc_[day] != 0); inter = (s_ & snapshot_).sum(); union = (s_ | snapshot_).sum()
            hits += np.exp(25 * (inter / max(union, 1) - 1))
        sc_[cand] = hits / nsim
    p_ = sc_ / sc_.sum(); o_ = np.argsort(-p_); c_ = np.cumsum(p_[o_])
    return o_[:int(np.searchsorted(c_, 0.9) + 1)], o_[0]
hits, sizes_, top1 = 0, [], 0; n_rep = 100; MIN_INF = 5; n_tried = 0
while len(sizes_) < n_rep:
    src_r = int(rng.integers(0, N))
    Hr = sir_states(A, BETA, GAMMA, src_r, 8, rng)
    snap_r = (Hr[8] != 0); n_tried += 1
    if snap_r.sum() < MIN_INF:
        continue                       # too few infected to ask the question
    s_set, t1 = source_set(snap_r, 8)
    hits += src_r in s_set; sizes_.append(len(s_set)); top1 += (t1 == src_r)
NUM["rep100"] = dict(set_hit_pct=int(round(100 * hits / n_rep)), set_size=round(float(np.mean(sizes_)), 1), top1_pct=int(round(100 * top1 / n_rep)), min_infected=MIN_INF, n_tried=n_tried)
print("rep100", NUM["rep100"])

# ----- repeat on 100 outbreaks: does the bad-day estimate for the most-connected plan hold out of sample? -----
rng.seed(22)
plan = cand_sets[f"{k} most-connected"]
fresh = spread_dist(plan, 100)
NUM["rep100_plan"] = dict(pred_cvar=NUM["fig12"][f"{k} most-connected"]["cvar"], fresh_cvar=int(round(cvar(fresh))), fresh_mean=int(round(fresh.mean())))
print("rep100_plan", NUM["rep100_plan"])

# ----- the two scripted guesses of the live ABC slide: one rejected, one kept, stored so the beats never contradict the caption -----
def abc_try(b, seed):
    I_, C_, _ = sir(A, b, GAMMA, SRC, T, rng=np.random.default_rng(seed))
    d_ = float(np.abs(C_[:obs_days + 1] - obs).mean())
    return [int(v) for v in C_[:obs_days + 1]], d_
ABC_DEMO = {}
for lab, b, want_keep in [("bad", 0.20, False), ("good", 0.08, True)]:
    for sd in range(5000, 5400):
        cum_, d_ = abc_try(b, sd)
        if (d_ <= ABC_TOL) == want_keep and (want_keep or d_ >= 8):
            ABC_DEMO[lab] = dict(beta=b, cum=cum_, d=round(d_, 1), kept=want_keep); break
print("abc demo", {k: (v["d"], v["kept"]) for k, v in ABC_DEMO.items()})

# ----- the one non-ward figure: US COVID-19 Forecast Hub, Table 1 of Cramer et al. 2022 PNAS (slide 24) -----
HUB = {"BPagano-RtDriven": (0.72, 0.36), "CEID-Walk": (0.78, 0.45), "CMU-TimeSeries": (0.77, 0.42), "Covid19Sim-Simulator": (0.34, 0.11),
       "CovidAnalytics-DELPHI": (0.82, 0.46), "COVIDhub-baseline": (0.88, 0.51), "COVIDhub-ensemble": (0.90, 0.53), "CU-select": (0.72, 0.43),
       "DDS-NBDS": (0.86, 0.43), "epiforecasts-ensemble1": (0.87, 0.46), "GT-DeepCOVID": (0.84, 0.41), "IHME-SEIR": (0.59, 0.25),
       "JHU_CSSE-DECOM": (0.80, 0.35), "JHU_IDD-CovidSP": (0.82, 0.33), "JHUAPL-Bucky": (0.63, 0.29), "Karlen-pypm": (0.86, 0.47),
       "LANL-GrowthRate": (0.83, 0.38), "MOBS-GLEAM_COVID": (0.71, 0.37), "OliverWyman-Navigator": (0.82, 0.45), "PSI-DRAFT": (0.34, 0.15),
       "RobertWalraven-ESG": (0.51, 0.28), "SteveMcConnell-CovidComplete": (0.80, 0.45), "UA-EpiCovDA": (0.72, 0.41), "UCLA-SuEIR": (0.31, 0.09),
       "UCSD_NEU-DeepGLEAM": (0.91, 0.70), "UMass-MechBayes": (0.93, 0.56), "UMich-RidgeTfReg": (0.63, 0.34), "USC-SI_kJalpha": (0.52, 0.22)}
fig, ax = plt.subplots(figsize=(9, 5))
ax.plot([0.4, 1.0], [0.4, 1.0], "--", color=GRAY, lw=2, label="honest: says 95%, is right 95%")
jit = np.random.default_rng(3)
for name, (c95, c50) in HUB.items():
    if name == "COVIDhub-ensemble": continue
    col = ORANGE if name == "UMass-MechBayes" else GRAY
    ax.plot([0.5 + jit.normal(0, 0.006), 0.95 + jit.normal(0, 0.006)], [c50, c95], "o", color=col, alpha=0.7, ms=6)
ax.plot([0.5, 0.95], [HUB["COVIDhub-ensemble"][1], HUB["COVIDhub-ensemble"][0]], "o", color=BLUE, ms=11, label="the ensemble of all models (0.53, 0.90)", zorder=5)
ax.plot([], [], "o", color=GRAY, label="27 individual models")
ax.plot([], [], "o", color=ORANGE, label="UMass-MechBayes, the one single model near 95%")
ax.set_xticks([0.5, 0.95]); ax.set_xticklabels(["50% band", "95% band"]); ax.set_xlim(0.4, 1.02); ax.set_ylim(0, 1)
ax.set_ylabel("how often the truth was inside"); ax.set_xlabel("confidence the band claimed")
ax.set_title("US COVID-19 deaths, 55 locations, 79 weeks: the same check at country scale")
ax.legend(fontsize=10, loc="upper left")
save(fig, "19_forecast_hub.png")
NUM["hub"] = dict(models=28, weeks=79, locations=55, forecasts=14260, ens50=0.53, ens95=0.90, range95="0.31 to 0.93", within5_95=2, source="Cramer et al. 2022 PNAS, Table 1; checked 29 Oct 2026")

json.dump(NUM, open(os.path.join(OUT, "numbers.json"), "w"), indent=1, default=float)
print("numbers.json written")
