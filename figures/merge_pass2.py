"""Put figures/pass2.json into data.json (repo root) as D.p2 (export_deck_data.py also does this at its end).   python merge_pass2.py"""
import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
dp = os.path.join(HERE, "..", "data.json")
D = json.load(open(dp, encoding="utf-8"))
D["p2"] = json.load(open(os.path.join(HERE, "pass2.json"), encoding="utf-8"))
json.dump(D, open(dp, "w"), separators=(",", ":"))
print("merged; data.json (repo root)", os.path.getsize(dp), "bytes")
