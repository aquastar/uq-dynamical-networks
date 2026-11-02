"""Dump everything the reveal.js deck draws live (D3) into data.json (repo root).
Runs make_extra.py (which runs make_figures.py) first.   python export_deck_data.py
"""
from make_extra import *
import json, os

def rl(x, n=3):
    return [round(float(v), n) for v in x]

P2 = np.array([pos[i] for i in range(N)]); P2 = (P2 - P2.min(0)) / (P2.max(0) - P2.min(0))
D = {}
D["ward"] = dict(pos=[[round(float(x), 3), round(float(y), 3)] for x, y in P2],
                 edges=[[int(a), int(b)] for a, b in G.edges()],
                 roles=[order_roles.index(r) for r in roles], src=int(SRC), beta=BETA, gamma=GAMMA,
                 deg=[int(d) for d in deg], n_edges=int(G.number_of_edges()), mean_contacts=round(float(deg.mean()), 1))
D["truth"] = dict(C=[int(v) for v in C_true], I=[int(v) for v in I_true2], obs=[int(v) for v in C_true[:11]],
                  snapshot8=[int(v) for v in (H_true[8] != 0)], state40=[int(v) for v in H_true[40]])
D["fig2"] = dict(finals=[int(v) for v in finals], **NUM["fig2"])
D["fig3"] = dict(p_big=rl(p_big_by_node), **NUM["fig3"])
D["fig4"] = dict(prior_bins=rl(np.linspace(0.01, 0.30, 30)), keep=rl(keep), q05=rl(q05, 1), q50=rl(q50, 1), q95=rl(q95, 1), **NUM["fig4"])
D["fig5"] = NUM["fig5"]
D["abc_demo"] = ABC_DEMO
D["fig6"] = dict(missed=[[int(a), int(b)] for (a, b), m in zip(edges, miss) if m], miss_pct=int(round(100 * MISS)), lb=rl(lb, 1), hb=rl(hb, 1), lg=rl(lg, 1), hg=rl(hg, 1), **NUM["fig6"])
D["fig8"] = dict(lo=rl(est_lo, 1), md=rl(est_md, 1), hi=rl(est_hi, 1), obs_days=list(y_obs.keys()), obs=[int(v) for v in y_obs.values()], **NUM["fig8"])
D["fig9"] = dict(unc=rl(unc), tested=[bool(t) for t in tested], pos20=[bool(v) for v in y_node[20]], pinf=rl(pinf_day20), stats=NUM["fig9"])
D["fig10"] = dict(levels=rl(levels, 2), cov_naive=rl(cov_naive), cov_conf=rl(cov_conf), w_naive=rl(w_naive, 1), w_conf=rl(w_conf, 1), res_test=rl(res[test], 1), res_cal=rl(res[cal], 1), **NUM["fig10"])
D["fig11"] = dict(post=rl(post, 4), set90=[int(v) for v in set90], **NUM["fig11"])
D["fig12"] = {lab: [int(v) for v in d] for lab, d in dists.items()}
D["fig12sets"] = {lab: [int(v) for v in v_] for lab, v_ in cand_sets.items()}
D["particles"] = dict(copies=[[int(v) for v in c] for c in copies], w=rl(w), kept=[int(v) for v in keep_idx], day=int(PART_DAY))
D["corner"] = dict(nodes=[int(v) for v in corner],
                   prob=[[int(u), int(w_), round(float(1.0 if A_obs[u, w_] else q[u, w_]), 3)] for u in corner for w_ in corner if u < w_],
                   cloud=[round(float(0.08 / np.sqrt(max(1, A_obs[v].sum()))), 3) for v in corner],
                   infer=[[int(u), int(w_), round(float(sc[u, w_]), 3)] for u in corner for w_ in corner if u < w_ and sc[u, w_] > 0.02],
                   true_edges=[[int(u), int(w_)] for u, w_ in Hc.edges()])
D["tree"] = dict(nodes=[int(v) for v in Tt.nodes()], edges=[[int(a), int(b)] for a, b in Tt.edges()], infected=[int(v) for v in infected_t], cands=[int(v) for v in cands_t], orders=NUM["fig17"]["orders"])
D["picks"] = dict(obs=[int(v) for v in pick_obs], real=[int(v) for v in pick_real], **NUM["fig18"])
D["hub"] = {k: list(v) for k, v in HUB.items()}
D["rep100"] = NUM["rep100"]; D["rep100_plan"] = NUM["rep100_plan"]; D["sobol"] = NUM["fig5"]
p2 = os.path.join(OUT, "pass2.json")
if os.path.exists(p2):
    D["p2"] = json.load(open(p2, encoding="utf-8"))     # pass-2 numbers (python make_pass2.py), kept across reruns
json.dump(D, open(os.path.join(OUT, "..", "data.json"), "w"), separators=(",", ":"))
print("data.json (repo root) written", os.path.getsize(os.path.join(OUT, "..", "data.json")), "bytes")
