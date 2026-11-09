# "Graphs are everywhere": five real networks drawn from their data for the Part 0 sweep.
#   python -I figures/make_everywhere.py <folder with the downloaded files>
# Expects, in that folder: celegansneural.csv.zip, power.csv.zip, netscience.csv.zip, polblogs.csv.zip (Netzschleuder CSV
# exports: nodes.csv + edges.csv, 0-based indices) and airports.dat, routes.dat (OpenFlights). Writes deck/everywhere.json:
# for each panel the giant component's node positions (spring layout, fixed seed) and edge list, with the counts before and after.
import sys, os, io, csv, json, zipfile, random
import networkx as nx

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "deck", "everywhere.json")

def netz(name):
    """Netzschleuder CSV zip -> undirected simple graph on the giant component, plus the raw counts."""
    z = zipfile.ZipFile(os.path.join(SRC, name))
    edges_name = [n for n in z.namelist() if n.endswith("edges.csv")][0]
    G = nx.Graph(); raw_m = 0
    for row in csv.reader(io.TextIOWrapper(z.open(edges_name), encoding="utf-8")):
        if not row or row[0].startswith("#"): continue
        a, b = int(row[0]), int(row[1]); raw_m += 1
        if a != b: G.add_edge(a, b)
    nodes_name = [n for n in z.namelist() if n.endswith("nodes.csv")][0]
    raw_n = sum(1 for row in csv.reader(io.TextIOWrapper(z.open(nodes_name), encoding="utf-8")) if row and not row[0].startswith("#"))
    giant = G.subgraph(max(nx.connected_components(G), key=len)).copy()
    return giant, raw_n, raw_m

def layout(G, seed=7, k=None, iters=80, trim=0.01):
    """Spring layout, normalised to the 0..1 box by the 1st and 99th percentiles (a few stray leaves otherwise squeeze the core into the middle); the strays are clamped to the border."""
    pos = nx.spring_layout(G, seed=seed, k=k, iterations=iters)
    xs = sorted(p[0] for p in pos.values()); ys = sorted(p[1] for p in pos.values()); i = int(len(xs) * trim)
    x0, x1, y0, y1 = xs[i], xs[-1 - i], ys[i], ys[-1 - i]
    cl = lambda t: min(1.0, max(0.0, t))
    return {v: [round(cl((p[0] - x0) / (x1 - x0)), 4), round(cl((p[1] - y0) / (y1 - y0)), 4)] for v, p in pos.items()}

def pack(G, pos):
    idx = {v: i for i, v in enumerate(G.nodes())}
    return {"n": G.number_of_nodes(), "m": G.number_of_edges(), "pos": [pos[v] for v in G.nodes()], "edges": [[idx[a], idx[b]] for a, b in G.edges()]}

panels = {}
for key, fname, what in [("brain", "celegansneural.csv.zip", "neurons"), ("grid", "power.csv.zip", "grid"), ("science", "netscience.csv.zip", "scientists"), ("blogs", "polblogs.csv.zip", "blogs")]:
    G, raw_n, raw_m = netz(fname)
    print(key, "raw", raw_n, raw_m, "-> giant", G.number_of_nodes(), G.number_of_edges(), flush=True)
    pos = layout(G, k=(1.2 / G.number_of_nodes() ** .5 if key == "grid" else None), iters=(120 if key == "grid" else 80), trim=(0 if key == "grid" else 0.01))
    panels[key] = dict(pack(G, pos), raw_n=raw_n, raw_m=raw_m)

# airports: the busiest airports and the routes among them, positions are longitude and latitude (projected in the deck)
air = {}
for row in csv.reader(io.open(os.path.join(SRC, "airports.dat"), encoding="utf-8")):
    if len(row) < 8: continue
    iata = row[4]
    try: lat, lon = float(row[6]), float(row[7])
    except ValueError: continue
    if iata and iata != r"\N": air[iata] = (lon, lat, row[2], row[3])
R = nx.Graph(); raw_routes = 0
for row in csv.reader(io.open(os.path.join(SRC, "routes.dat"), encoding="utf-8")):
    if len(row) < 5: continue
    a, b = row[2], row[4]; raw_routes += 1
    if a in air and b in air and a != b: R.add_edge(a, b)
KEEP = 500
top = sorted(R.degree, key=lambda d: -d[1])[:KEEP]
A = R.subgraph([v for v, _ in top]).copy(); A = A.subgraph(max(nx.connected_components(A), key=len)).copy()
idx = {v: i for i, v in enumerate(A.nodes())}
panels["flights"] = {"n": A.number_of_nodes(), "m": A.number_of_edges(), "raw_n": R.number_of_nodes(), "raw_m": R.number_of_edges(), "raw_routes": raw_routes,
                     "lonlat": [[round(air[v][0], 3), round(air[v][1], 3)] for v in A.nodes()], "codes": list(A.nodes()), "edges": [[idx[a], idx[b]] for a, b in A.edges()]}
print("flights raw", R.number_of_nodes(), "airports", R.number_of_edges(), "airport pairs,", raw_routes, "route rows -> drawn", A.number_of_nodes(), A.number_of_edges(), flush=True)

json.dump({"panels": panels, "source": "Netzschleuder CSV exports (celegansneural, power, netscience, polblogs) and OpenFlights airports.dat/routes.dat; giant components; spring layouts with seed 7"}, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
