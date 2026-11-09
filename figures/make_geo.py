# Western Europe outlines for the "where is the ward" map: decode world-atlas countries-110m (TopoJSON, Natural Earth,
# public domain) into a small GeoJSON of the countries around France. Usage: python -I figures/make_geo.py <countries-110m.json>
import json, sys
src = sys.argv[1]
T = json.load(open(src, encoding="utf-8"))
sc, tr = T["transform"]["scale"], T["transform"]["translate"]
def arc(i):
    rev = i < 0; a = T["arcs"][~i if rev else i]; x = y = 0; out = []
    for dx, dy in a: x += dx; y += dy; out.append([round(x * sc[0] + tr[0], 2), round(y * sc[1] + tr[1], 2)])
    return out[::-1] if rev else out
def ring(idx):
    pts = []
    for i in idx: seg = arc(i); pts += seg if not pts else seg[1:]
    return pts
def coords(g):
    if g["type"] == "Polygon": return [ring(r) for r in g["arcs"]]
    return [[ring(r) for r in poly] for poly in g["arcs"]]
KEEP = {"France", "Spain", "Portugal", "Italy", "Switzerland", "Germany", "Belgium", "Netherlands", "Luxembourg", "United Kingdom", "Ireland", "Austria", "Czechia", "Denmark", "Poland", "Slovenia", "Croatia", "Hungary", "Slovakia", "Andorra", "Monaco", "Bosnia and Herz.", "Serbia", "Montenegro", "Albania", "North Macedonia", "Kosovo", "Greece", "Tunisia", "Algeria", "Morocco", "Norway", "Sweden", "Lithuania", "Latvia", "Estonia", "Belarus", "Ukraine", "Romania", "Bulgaria", "Moldova", "Liechtenstein", "Malta", "Turkey"}
feats = [{"type": "Feature", "properties": {"name": g["properties"]["name"]}, "geometry": {"type": g["type"], "coordinates": coords(g)}} for g in T["objects"]["countries"]["geometries"] if g["properties"]["name"] in KEEP]
missing = KEEP - {f["properties"]["name"] for f in feats}
out = {"type": "FeatureCollection", "features": feats, "lyon": [4.8357, 45.7640], "source": "Natural Earth 1:110m via world-atlas@2.0.2 (public domain)"}
json.dump(out, open("deck/geo.json", "w", encoding="utf-8"), separators=(",", ":"))
import os; print(len(feats), "countries,", os.path.getsize("deck/geo.json") // 1024, "KB; not found:", sorted(missing))
