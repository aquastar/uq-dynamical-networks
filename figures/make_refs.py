"""Every paper the deck cites, resolved to a link and written as refs.html for the Pages site.

Each entry below is a citation as it appears on a slide, plus the paper's title (the search key). The link is
found automatically: Crossref first (DOI), then arXiv; a match is accepted only if the first author's surname and
the year agree with the citation. Entries that resolve to nothing are listed on the page without a link and
printed at the end, so they can be fixed by hand.   python make_refs.py
Writes: deck/refs.json (the resolved list) and deck/refs.html.
"""
import json, os, re, sys, time, html, unicodedata, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__)); DECK = os.path.join(HERE, "..", "deck")
MAILTO = "mb9615@g.rit.edu"
SITE = "https://aquastar.github.io/uq-dynamical-networks/"

# (part, citation as on the slide, first author surname, year, title, venue if a book or preprint)
REFS = [
 ("Part 0 · The ward", "Vanhems et al. 2013", "Vanhems", 2013, "Estimating potential infection transmission routes in hospital wards using wearable proximity sensors", ""),
 ("Part 0 · The ward", "Holme & Saramäki 2012", "Holme", 2012, "Temporal networks", ""),
 ("Part 0 · Why graphs, what UQ is", "Cinelli et al. 2020 Sci. Rep.", "Cinelli", 2020, "The COVID-19 social media infodemic", ""),
 ("Part 0 · Why graphs, what UQ is", "Granell, Gómez & Arenas 2013 PRL", "Granell", 2013, "Dynamical interplay between awareness and epidemic spreading in multiplex networks", ""),
 ("Part 0 · Why graphs, what UQ is", "Motter & Lai 2002 PRE", "Motter", 2002, "Cascade-based attacks on complex networks", ""),
 ("Part 0 · Why graphs, what UQ is", "U.S.–Canada Power System Outage Task Force 2004", "Task Force", 2004, "Final Report on the August 14, 2003 Blackout in the United States and Canada: Causes and Recommendations", ""),
 ("Part 0 · Why graphs, what UQ is", "Braess 1968", "Braess", 1968, "Über ein Paradoxon aus der Verkehrsplanung", ""),
 ("Part 0 · Why graphs, what UQ is", "Steinberg & Zangwill 1983", "Steinberg", 1983, "The prevalence of Braess' paradox", ""),
 ("Part 0 · Why graphs, what UQ is", "Easley & Kleinberg 2010", "Easley", 2010, "Networks, Crowds, and Markets: Reasoning About a Highly Connected World", ""),
 ("Part 0 · Why graphs, what UQ is", "Baker 2009, Scientific American", "Baker", 2009, "Detours by design", ""),
 ("Part 0 · Why graphs, what UQ is", "White et al. 1986", "White", 1986, "The structure of the nervous system of the nematode Caenorhabditis elegans", ""),
 ("Part 0 · Why graphs, what UQ is", "Watts & Strogatz 1998", "Watts", 1998, "Collective dynamics of 'small-world' networks", ""),
 ("Part 0 · Why graphs, what UQ is", "Newman 2006 PRE", "Newman", 2006, "Finding community structure in networks using the eigenvectors of matrices", ""),
 ("Part 0 · Why graphs, what UQ is", "Adamic & Glance 2005", "Adamic", 2005, "The political blogosphere and the 2004 U.S. election: divided they blog", ""),
 ("Part 0 · Why graphs, what UQ is", "OpenFlights", "OpenFlights", 2014, "OpenFlights airport and route databases", ""),
 ("Part 0 · Why graphs, what UQ is", "Netzschleuder (Peixoto)", "Peixoto", 2020, "Netzschleuder: the network catalogue, repository and centrifuge", ""),
 ("Part 0 · Photographs, satellite images and maps", "Aldg692VX, CC BY-SA 4.0", "Aldg692VX", 2023, "Lyon-part-dieu-2023.jpg", ""),
 ("Part 0 · Photographs, satellite images and maps", "Basile Morin 2024, CC BY-SA 4.0", "Morin", 2024, "Cheonggyecheon stream at sunrise with trees in Seoul", ""),
 ("Part 0 · Photographs, satellite images and maps", "NOAA/DMSP", "NOAA", 2003, "Northeast blackout 2003: night lights on 13 and 14 August", ""),
 ("Part 0 · Photographs, satellite images and maps", "Natural Earth", "Natural Earth", 2023, "Natural Earth 1:110m cultural vectors, via world-atlas 2.0.2", ""),
 ("Part 0 · Why graphs, what UQ is", "Der Kiureghian & Ditlevsen 2009", "Der Kiureghian", 2009, "Aleatory or epistemic? Does it matter?", ""),
 ("Part 0 · Why graphs, what UQ is", "Hüllermeier & Waegeman 2021", "Hüllermeier", 2021, "Aleatoric and epistemic uncertainty in machine learning: an introduction to concepts and methods", ""),
 ("Part 0 · Why graphs, what UQ is", "Chen & Zhang WSDM 2026", "Chen", 2026, "Uncertainty Quantification for Dynamical Networks (tutorial, WSDM 2026): the UQ lifecycle slide", ""),
 ("Part 0 · Why graphs, what UQ is", "Smith 2013", "Smith", 2013, "Uncertainty Quantification: Theory, Implementation, and Applications", ""),
 ("Part 0 · Why graphs, what UQ is", "Sullivan 2015", "Sullivan", 2015, "Introduction to Uncertainty Quantification", ""),
 ("Part 1 · Luck", "Newman 2002 PRE", "Newman", 2002, "Spread of epidemic disease on networks", ""),
 ("Part 1 · Luck", "Stehlé et al. 2011 BMC Medicine", "Stehlé", 2011, "Simulation of an SEIR infectious disease model on the dynamic contact network of conference attendees", ""),
 ("Part 1 · Luck", "Kiss, Miller & Simon 2017", "Kiss", 2017, "Mathematics of Epidemics on Networks: From Exact to Approximate Models", "Springer (book)"),
 ("Part 1 · Luck", "Kitsak et al. 2010 Nature Physics", "Kitsak", 2010, "Identification of influential spreaders in complex networks", ""),
 ("Part 1 · Luck", "Lawyer 2015 Scientific Reports", "Lawyer", 2015, "Understanding the influence of all nodes in a network", ""),
 ("Part 1 · Luck", "Karrer & Newman 2010 PRE", "Karrer", 2010, "Message passing approach for general epidemic models", ""),
 ("Part 2 · Numbers we don’t know", "Pritchard et al. 1999", "Pritchard", 1999, "Population growth of human Y chromosomes: a study of Y chromosome microsatellites", ""),
 ("Part 2 · Numbers we don’t know", "Beaumont, Zhang & Balding 2002", "Beaumont", 2002, "Approximate Bayesian computation in population genetics", ""),
 ("Part 2 · Numbers we don’t know", "Dutta, Mira & Onnela 2018", "Dutta", 2018, "Bayesian inference of spreading processes on networks", ""),
 ("Part 2 · Numbers we don’t know", "Kypraios, Neal & Prangle 2017", "Kypraios", 2017, "A tutorial introduction to Bayesian inference for stochastic epidemic models using Approximate Bayesian Computation", ""),
 ("Part 2 · Numbers we don’t know", "Chatha et al. 2024, preprint", "Chatha", 2024, "Neural posterior estimation for stochastic epidemic modeling", "arXiv preprint"),
 ("Part 2 · Numbers we don’t know", "Sobol’ 2001", "Sobol", 2001, "Global sensitivity indices for nonlinear mathematical models and their Monte Carlo estimates", ""),
 ("Part 2 · Numbers we don’t know", "Hart, Alexanderian & Gremaud 2017 SIAM SISC", "Hart", 2017, "Efficient computation of Sobol' indices for stochastic models", ""),
 ("Part 2 · Numbers we don’t know", "Lu & Borgonovo 2023 EJOR", "Lu", 2023, "Global sensitivity analysis in epidemiological modeling", ""),
 ("Part 2 · Numbers we don’t know", "Kennedy & O’Hagan 2001 JRSS-B", "Kennedy", 2001, "Bayesian calibration of computer models", ""),
 ("Part 2 · Numbers we don’t know", "Cranmer, Brehmer & Louppe 2020 PNAS", "Cranmer", 2020, "The frontier of simulation-based inference", ""),
 ("Part 2 · Numbers we don’t know", "Biazzo et al. 2022 Scientific Reports", "Biazzo", 2022, "A Bayesian generative neural network framework for epidemic inference problems", ""),
 ("Part 2 · Numbers we don’t know", "Groendyke, Welch & Hunter 2011 (epinet)", "Groendyke", 2011, "Bayesian inference for contact networks given epidemic data", ""),
 ("Part 3 · A graph we don’t fully know", "Génois, Vestergaard, Cattuto & Barrat 2015 Nature Communications", "Génois", 2015, "Compensating for population sampling in simulations of epidemic spread on temporal contact networks", ""),
 ("Part 3 · A graph we don’t fully know", "Newman 2018 Nature Physics", "Newman", 2018, "Network structure from rich but noisy data", ""),
 ("Part 3 · A graph we don’t fully know", "Young, Cantwell & Newman 2020", "Young", 2020, "Bayesian inference of network structure from unreliable data", ""),
 ("Part 3 · A graph we don’t fully know", "Hoff, Raftery & Handcock 2002", "Hoff", 2002, "Latent space approaches to social network analysis", ""),
 ("Part 3 · A graph we don’t fully know", "Sewell & Chen 2015", "Sewell", 2015, "Latent space models for dynamic networks", ""),
 ("Part 3 · A graph we don’t fully know", "Peixoto 2019 PRL", "Peixoto", 2019, "Network reconstruction and community detection from dynamics", ""),
 ("Part 3 · A graph we don’t fully know", "Kipf et al. 2018 (NRI)", "Kipf", 2018, "Neural relational inference for interacting systems", ""),
 ("Part 3 · A graph we don’t fully know", "StructInfer, NeurIPS 2024", "Wang", 2024, "Benchmarking structural inference methods for interacting dynamical systems with synthetic data", ""),
 ("Part 3 · A graph we don’t fully know", "Dabush & Routtenberg 2024", "Dabush", 2024, "Dabush Routtenberg graph tracking network dynamics Kalman", ""),
 ("Part 3 · A graph we don’t fully know", "Prasse & Van Mieghem 2022 PNAS", "Prasse", 2022, "Predicting network dynamics without requiring the knowledge of the interaction graph", ""),
 ("Part 4 · Tracking what we can’t see", "Del Moral 2004", "Del Moral", 2004, "Feynman-Kac Formulae: Genealogical and Interacting Particle Systems with Applications", "Springer (book)"),
 ("Part 4 · Tracking what we can’t see", "Snyder et al. 2008", "Snyder", 2008, "Obstacles to high-dimensional particle filtering", ""),
 ("Part 4 · Tracking what we can’t see", "Kalman 1960", "Kalman", 1960, "A new approach to linear filtering and prediction problems", ""),
 ("Part 4 · Tracking what we can’t see", "Gordon, Salmond & Smith 1993", "Gordon", 1993, "Novel approach to nonlinear/non-Gaussian Bayesian state estimation", ""),
 ("Part 4 · Tracking what we can’t see", "Evensen 2003", "Evensen", 2003, "The Ensemble Kalman Filter: theoretical formulation and practical implementation", ""),
 ("Part 4 · Tracking what we can’t see", "Ju, Heng & Jacob 2021, arXiv", "Ju", 2021, "Sequential Monte Carlo algorithms for agent-based models of disease transmission", "arXiv preprint"),
 ("Part 4 · Tracking what we can’t see", "Li, Pei et al. 2020 Science", "Li", 2020, "Substantial undocumented infection facilitates the rapid dissemination of novel coronavirus (SARS-CoV-2)", ""),
 ("Part 4 · Tracking what we can’t see", "Tsui et al. 2024 PNAS", "Tsui", 2024, "Tsui 2024 PNAS epidemic surveillance where to test next network", ""),
 ("Part 4 · Tracking what we can’t see", "Meirom et al. 2021 ICML", "Meirom", 2021, "Controlling graph dynamics with reinforcement learning and graph neural networks", ""),
 ("Part 4 · Tracking what we can’t see", "Borovitskiy et al. 2021", "Borovitskiy", 2021, "Matérn Gaussian processes on graphs", ""),
 ("Part 4 · Tracking what we can’t see", "Stadler et al. 2021 NeurIPS (GPN)", "Stadler", 2021, "Graph posterior network: Bayesian predictive uncertainty for node classification", ""),
 ("Part 5 · Guarantees for any model", "Vovk, Gammerman & Shafer 2005", "Vovk", 2005, "Algorithmic Learning in a Random World", "Springer (book)"),
 ("Part 5 · Guarantees for any model", "Lei et al. 2018", "Lei", 2018, "Distribution-free predictive inference for regression", ""),
 ("Part 5 · Guarantees for any model", "Angelopoulos & Bates 2023", "Angelopoulos", 2023, "Conformal prediction: a gentle introduction", ""),
 ("Part 5 · Guarantees for any model", "Shafer & Vovk 2008", "Shafer", 2008, "A tutorial on conformal prediction", ""),
 ("Part 5 · Guarantees for any model", "Gibbs & Candès 2021 NeurIPS", "Gibbs", 2021, "Adaptive conformal inference under distribution shift", ""),
 ("Part 5 · Guarantees for any model", "Barber, Candès, Ramdas & Tibshirani 2023", "Barber", 2023, "Conformal prediction beyond exchangeability", ""),
 ("Part 5 · Guarantees for any model", "Gneiting, Balabdaoui & Raftery 2007 JRSS-B", "Gneiting", 2007, "Probabilistic forecasts, calibration and sharpness", ""),
 ("Part 5 · Guarantees for any model", "Gneiting & Raftery 2007 JASA", "Gneiting", 2007, "Strictly proper scoring rules, prediction, and estimation", ""),
 ("Part 5 · Guarantees for any model", "Bracher, Ray, Gneiting & Reich 2021 PLOS Comp Bio", "Bracher", 2021, "Evaluating epidemic forecasts in an interval format", ""),
 ("Part 5 · Guarantees for any model", "CF-GNN, NeurIPS 2023 (Huang et al.)", "Huang", 2023, "Uncertainty quantification over graph with conformalized graph neural networks", ""),
 ("Part 5 · Guarantees for any model", "DAPS, ICML 2023 (Zargarbashi et al.)", "Zargarbashi", 2023, "Conformal prediction sets for graph neural networks", ""),
 ("Part 5 · Guarantees for any model", "CoRel, ICML 2025 (Cini et al.)", "Cini", 2025, "Relational conformal prediction for correlated time series", ""),
 ("Part 5 · Guarantees for any model", "Zargarbashi & Bojchevski, ICLR 2024", "Zargarbashi", 2024, "Conformal inductive graph neural networks", ""),
 ("Part 5 · Guarantees for any model", "Conformal PID, NeurIPS 2023 (Angelopoulos et al.)", "Angelopoulos", 2023, "Conformal PID control for time series prediction", ""),
 ("Part 5 · Guarantees for any model", "Lakshminarayanan, Pritzel & Blundell 2017", "Lakshminarayanan", 2017, "Simple and scalable predictive uncertainty estimation using deep ensembles", ""),
 ("Part 5 · Guarantees for any model", "Gal & Ghahramani 2016", "Gal", 2016, "Dropout as a Bayesian approximation: representing model uncertainty in deep learning", ""),
 ("Part 5 · Guarantees for any model", "Wang et al. 2024 TMLR", "Wang", 2024, "Uncertainty in graph neural networks: a survey", ""),
 ("Part 5 · Guarantees for any model", "Hsu et al. 2022 (GATS)", "Hsu", 2022, "What makes graph neural networks miscalibrated?", ""),
 ("Part 5 · Guarantees for any model", "Wen et al. 2023 (DiffSTG)", "Wen", 2023, "DiffSTG: probabilistic spatio-temporal graph forecasting with denoising diffusion models", ""),
 ("Part 5 · Guarantees for any model", "Kamarthi et al. 2021 (EpiFNP)", "Kamarthi", 2021, "When in doubt: neural non-parametric uncertainty quantification for epidemic forecasting", ""),
 ("Part 5 · Guarantees for any model", "Cramer et al. 2022 PNAS", "Cramer", 2022, "Evaluation of individual and ensemble probabilistic forecasts of COVID-19 mortality in the United States", ""),
 ("Part 5 · Guarantees for any model", "Wu et al. 2021 KDD", "Wu", 2021, "Quantifying uncertainty in deep spatiotemporal forecasting", ""),
 ("Part 6 · Running it backwards", "Shah & Zaman 2011", "Shah", 2011, "Rumors in a network: who's the culprit?", ""),
 ("Part 6 · Running it backwards", "Antulov-Fantulin et al. 2015 PRL", "Antulov-Fantulin", 2015, "Identification of patient zero in static and temporal networks: robustness and limitations", ""),
 ("Part 6 · Running it backwards", "Dawkins, Li & Xu 2021 ICML", "Dawkins", 2021, "Diffusion source identification on networks with statistical confidence", ""),
 ("Part 6 · Running it backwards", "Jian et al. 2026 AAAI", "Jian", 2026, "Jian 2026 AAAI conformal source localization", ""),
 ("Part 6 · Running it backwards", "Yan, Fang & He 2023 NeurIPS", "Yan", 2023, "Diffusion model for graph inverse problems: towards effective source localization on complex networks", ""),
 ("Part 6 · Running it backwards", "Ling et al. 2022 KDD", "Ling", 2022, "Source localization of graph diffusion via variational autoencoders for graph inverse problems", ""),
 ("Part 7 · Deciding anyway", "Nemhauser, Wolsey & Fisher 1978", "Nemhauser", 1978, "An analysis of approximations for maximizing submodular set functions", ""),
 ("Part 7 · Deciding anyway", "Kempe, Kleinberg & Tardos 2003", "Kempe", 2003, "Maximizing the spread of influence through a social network", ""),
 ("Part 7 · Deciding anyway", "Ohsaka & Yoshida 2017 WWW", "Ohsaka", 2017, "Portfolio optimization for influence spread", ""),
 ("Part 7 · Deciding anyway", "Rockafellar & Uryasev 2000", "Rockafellar", 2000, "Optimization of conditional value-at-risk", ""),
 ("Part 7 · Deciding anyway", "Staib, Wilder & Jegelka 2019 AISTATS", "Staib", 2019, "Distributionally robust submodular maximization", ""),
 ("Part 7 · Deciding anyway", "Esfahani & Kuhn 2018", "Mohajerin Esfahani", 2018, "Data-driven distributionally robust optimization using the Wasserstein metric", ""),
 ("Part 7 · Deciding anyway", "Chen et al. 2016 KDD", "Chen", 2016, "Robust influence maximization", ""),
 ("Part 7 · Deciding anyway", "Han, Preciado, Nowzari & Pappas 2015 IEEE TNSE", "Han", 2015, "Data-driven network resource allocation for controlling spreading processes", ""),
 ("Part 7 · Deciding anyway", "Patel, Rayan & Tewari 2024 AISTATS", "Patel", 2024, "Conformal contextual robust optimization", ""),
 ("Part 7 · Deciding anyway", "Wilder, Dilkina & Tambe 2019 AAAI", "Wilder", 2019, "Melding the data-decisions pipeline: decision-focused learning for combinatorial optimization", ""),
 ("Part 7 · Deciding anyway", "Elmachtoub & Grigas 2022", "Elmachtoub", 2022, "Smart predict, then optimize", ""),
 ("Part 7 · Deciding anyway", "Hu et al. 2026 ICLR", "Hu", 2026, "Hu 2026 ICLR conformal robustness control", ""),
 ("Part 8 · The map", "Rebeschini & van Handel 2015 Ann. Appl. Probab.", "Rebeschini", 2015, "Can local particle filters beat the curse of dimensionality?", ""),
 ("Part 8 · The map", "Gross, D’Lima & Blasius 2006 PRL", "Gross", 2006, "Epidemic dynamics on an adaptive network", ""),
 ("Part 8 · The map", "Psaros et al. 2023 J. Comp. Phys.", "Psaros", 2023, "Uncertainty quantification in scientific machine learning: methods, metrics, and comparisons", ""),
 ("Part 8 · The map", "Lunde, Levina & Zhu 2025 JASA", "Lunde", 2025, "Conformal prediction for network-assisted regression", ""),
]

def norm(s): return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c)).lower().replace("’", "'").replace("'", "")
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": f"uq-dynamical-networks-tutorial/1.0 (mailto:{MAILTO})"})
    with urllib.request.urlopen(req, timeout=30) as r: return r.read().decode("utf-8")

def crossref(surname, year, title):
    q = urllib.parse.urlencode({"query.bibliographic": title, "query.author": surname, "rows": 6, "mailto": MAILTO})
    try: items = json.loads(get("https://api.crossref.org/works?" + q))["message"]["items"]
    except Exception as e: return None
    want = norm(surname).split()[-1]
    for it in items:
        auth = it.get("author") or []
        fam = norm((auth[0].get("family") if auth else "") or "")
        yrs = [p[0] for k in ("published-print", "published-online", "issued", "created") for p in (it.get(k, {}).get("date-parts") or [[None]]) if p and p[0]]
        if not auth or want not in fam.split() and want != fam: continue
        if not any(abs(y - year) <= 1 for y in yrs): continue
        t = (it.get("title") or [""])[0]; cont = (it.get("container-title") or [""])[0] or it.get("publisher", "")
        return {"url": "https://doi.org/" + it["DOI"], "title": t, "venue": cont, "year": min(yrs, key=lambda y: abs(y - year)), "authors": ", ".join(f"{a.get('given', '')} {a.get('family', '')}".strip() for a in auth[:4]) + (" et al." if len(auth) > 4 else "")}
    return None

def arxiv(surname, year, title):
    q = urllib.parse.urlencode({"search_query": f'ti:"{title}" AND au:{surname}', "max_results": 5})
    try: xml = get("http://export.arxiv.org/api/query?" + q)
    except Exception: return None
    for ent in re.findall(r"<entry>(.*?)</entry>", xml, flags=re.S):
        t = re.sub(r"\s+", " ", re.search(r"<title>(.*?)</title>", ent, flags=re.S).group(1)).strip()
        authors = re.findall(r"<name>(.*?)</name>", ent); pub = re.search(r"<published>(\d{4})", ent).group(1)
        link = re.search(r"<id>(.*?)</id>", ent).group(1).replace("http://", "https://")
        if authors and norm(surname).split()[-1] in norm(authors[0]) and abs(int(pub) - year) <= 1:
            return {"url": link, "title": t, "venue": "arXiv", "year": int(pub), "authors": ", ".join(authors[:4]) + (" et al." if len(authors) > 4 else "")}
    return None

# Pinned by hand after checking what the lookup returned (a chapter instead of the book, a tech report instead of the
# journal paper, a different paper by the same surname). An empty url means: no trustworthy link yet, say so on the page.
FIXED = {
 "Cinelli et al. 2020 Sci. Rep.": dict(url="https://doi.org/10.1038/s41598-020-73510-5", title="The COVID-19 social media infodemic", venue="Scientific Reports", authors="Matteo Cinelli, Walter Quattrociocchi, Alessandro Galeazzi, Carlo Michele Valensise et al.", year=2020),
 "Granell, Gómez & Arenas 2013 PRL": dict(url="https://doi.org/10.1103/PhysRevLett.111.128701", title="Dynamical interplay between awareness and epidemic spreading in multiplex networks", venue="Physical Review Letters", authors="Clara Granell, Sergio Gómez, Alex Arenas", year=2013),
 "Motter & Lai 2002 PRE": dict(url="https://doi.org/10.1103/PhysRevE.66.065102", title="Cascade-based attacks on complex networks", venue="Physical Review E", authors="Adilson E. Motter, Ying-Cheng Lai", year=2002),
 "U.S.–Canada Power System Outage Task Force 2004": dict(url="https://www.energy.gov/oe/articles/blackout-2003-final-report-august-14-2003-blackout-united-states-and-canada-causes-and", title="Final Report on the August 14, 2003 Blackout in the United States and Canada: Causes and Recommendations", venue="U.S. Department of Energy / Natural Resources Canada (report)", authors="U.S.–Canada Power System Outage Task Force", year=2004),
 "Braess 1968": dict(url="https://doi.org/10.1007/BF01918335", title="Über ein Paradoxon aus der Verkehrsplanung", venue="Unternehmensforschung", authors="Dietrich Braess", year=1968),
 "Steinberg & Zangwill 1983": dict(url="https://doi.org/10.1287/trsc.17.3.301", title="The prevalence of Braess' paradox", venue="Transportation Science", authors="Richard Steinberg, Willard I. Zangwill", year=1983),
 "Easley & Kleinberg 2010": dict(url="https://www.cs.cornell.edu/home/kleinber/networks-book/", title="Networks, Crowds, and Markets: Reasoning About a Highly Connected World", venue="Cambridge University Press (book; free online)", authors="David Easley, Jon Kleinberg", year=2010),
 "Der Kiureghian & Ditlevsen 2009": dict(url="https://doi.org/10.1016/j.strusafe.2008.06.020", title="Aleatory or epistemic? Does it matter?", venue="Structural Safety", authors="Armen Der Kiureghian, Ove Ditlevsen", year=2009),
 "Hüllermeier & Waegeman 2021": dict(url="https://doi.org/10.1007/s10994-021-05946-3", title="Aleatoric and epistemic uncertainty in machine learning: an introduction to concepts and methods", venue="Machine Learning", authors="Eyke Hüllermeier, Willem Waegeman", year=2021),
 "Baker 2009, Scientific American": dict(url="https://www.scientificamerican.com/article/removing-roads-and-traffic-lights", title="Detours by design (online as: Removing roads and traffic lights speeds urban travel)", venue="Scientific American 300(2), 20–22", authors="Linda Baker", year=2009),
 "Aldg692VX, CC BY-SA 4.0": dict(url="https://commons.wikimedia.org/wiki/File:Lyon-part-dieu-2023.jpg", title="Lyon-part-dieu-2023.jpg: Lyon seen from Fourvière hill (photograph, cropped and resized for the slides)", venue="Wikimedia Commons, CC BY-SA 4.0", authors="Aldg692VX", year=2023),
 "Basile Morin 2024, CC BY-SA 4.0": dict(url="https://commons.wikimedia.org/wiki/File:Cheonggyecheon_stream_at_sunrise_with_trees_in_Seoul.jpg", title="Cheonggyecheon stream at sunrise with trees in Seoul (photograph, resized for the slides)", venue="Wikimedia Commons, CC BY-SA 4.0", authors="Basile Morin", year=2024),
 "NOAA/DMSP": dict(url="https://commons.wikimedia.org/wiki/File:Northeast_blackout_2003.gif", title="Northeast blackout 2003: night lights on 13 August and on 14 August at 21:03 EDT (two frames, cropped to the Toronto–Washington corridor)", venue="NOAA / Defense Meteorological Satellite Program, via Wikimedia Commons; public domain (U.S. government work)", authors="National Oceanic and Atmospheric Administration; Defense Meteorological Satellite Program", year=2003),
 "Natural Earth": dict(url="https://www.naturalearthdata.com/", title="Natural Earth 1:110m cultural vectors (country outlines), via world-atlas 2.0.2", venue="public domain", authors="Natural Earth", year=2023),
 "White et al. 1986": dict(url="https://doi.org/10.1098/rstb.1986.0056", title="The structure of the nervous system of the nematode Caenorhabditis elegans", venue="Philosophical Transactions of the Royal Society B 314, 1–340", authors="J. G. White, E. Southgate, J. N. Thomson, S. Brenner", year=1986),
 "Watts & Strogatz 1998": dict(url="https://doi.org/10.1038/30918", title="Collective dynamics of 'small-world' networks", venue="Nature 393, 440–442", authors="Duncan J. Watts, Steven H. Strogatz", year=1998),
 "Newman 2006 PRE": dict(url="https://doi.org/10.1103/PhysRevE.74.036104", title="Finding community structure in networks using the eigenvectors of matrices", venue="Physical Review E 74, 036104", authors="M. E. J. Newman", year=2006),
 "Adamic & Glance 2005": dict(url="https://doi.org/10.1145/1134271.1134277", title="The political blogosphere and the 2004 U.S. election: divided they blog", venue="Proceedings of the 3rd International Workshop on Link Discovery (LinkKDD), 36–43", authors="Lada A. Adamic, Natalie Glance", year=2005),
 "OpenFlights": dict(url="https://openflights.org/data.php", title="OpenFlights airport and route databases", venue="Open Database License; route data last updated June 2014", authors="OpenFlights (Jani Patokallio and contributors)", year=2014),
 "Netzschleuder (Peixoto)": dict(url="https://networks.skewed.de/", title="Netzschleuder: the network catalogue, repository and centrifuge", venue="networks.skewed.de", authors="Tiago P. Peixoto", year=2020),
 "Chen & Zhang WSDM 2026": dict(url="https://aquastar.github.io/uq-dynamical-networks/previous-deck.html", title="Uncertainty Quantification for Dynamical Networks (tutorial, WSDM 2026): the UQ lifecycle slide", venue="WSDM 2026 tutorial; the slides are kept in this repository as previous-deck.html", authors="Zhiqian Chen, Zonghan Zhang", year=2026),
 "Smith 2013": dict(url="https://doi.org/10.1137/1.9781611973228", title="Uncertainty Quantification: Theory, Implementation, and Applications", venue="SIAM (book)", authors="Ralph C. Smith", year=2013),
 "Sullivan 2015": dict(url="https://doi.org/10.1007/978-3-319-23395-6", title="Introduction to Uncertainty Quantification", venue="Springer (book)", authors="T. J. Sullivan", year=2015),
 "Holme & Saramäki 2012": dict(url="https://doi.org/10.1016/j.physrep.2012.03.001", title="Temporal networks", venue="Physics Reports", authors="Petter Holme, Jari Saramäki", year=2012),
 "Kiss, Miller & Simon 2017": dict(url="https://doi.org/10.1007/978-3-319-50806-1", title="Mathematics of Epidemics on Networks: From Exact to Approximate Models", venue="Springer (book)", authors="István Z. Kiss, Joel C. Miller, Péter L. Simon", year=2017),
 "Hoff, Raftery & Handcock 2002": dict(url="https://doi.org/10.1198/016214502388618906", title="Latent space approaches to social network analysis", venue="Journal of the American Statistical Association", authors="Peter D. Hoff, Adrian E. Raftery, Mark S. Handcock", year=2002),
 "Sewell & Chen 2015": dict(url="https://doi.org/10.1080/01621459.2014.988214", title="Latent space models for dynamic networks", venue="Journal of the American Statistical Association", authors="Daniel K. Sewell, Yuguo Chen", year=2015),
 "Del Moral 2004": dict(url="https://doi.org/10.1007/978-1-4684-9393-1", title="Feynman-Kac Formulae: Genealogical and Interacting Particle Systems with Applications", venue="Springer (book)", authors="Pierre Del Moral", year=2004),
 "Meirom et al. 2021 ICML": dict(url="https://arxiv.org/abs/2010.05313", title="Controlling graph dynamics with reinforcement learning and graph neural networks", venue="ICML 2021", authors="Eli A. Meirom, Haggai Maron, Shie Mannor, Gal Chechik", year=2021),
 "Wang et al. 2024 TMLR": dict(url="https://arxiv.org/abs/2403.07185", title="Uncertainty in graph neural networks: a survey", venue="Transactions on Machine Learning Research", authors="Fangxin Wang, Yuqing Liu, Kay Liu, Yibo Wang, Sourav Medya, Philip S. Yu", year=2024),
 "Sobol’ 2001": dict(url="https://doi.org/10.1016/S0378-4754(00)00270-6", title="Global sensitivity indices for nonlinear mathematical models and their Monte Carlo estimates", venue="Mathematics and Computers in Simulation", authors="I. M. Sobol’", year=2001),
 "Vovk, Gammerman & Shafer 2005": dict(url="https://doi.org/10.1007/b106715", title="Algorithmic Learning in a Random World", venue="Springer (book)", authors="Vladimir Vovk, Alex Gammerman, Glenn Shafer", year=2005),
 "Cramer et al. 2022 PNAS": dict(url="https://doi.org/10.1073/pnas.2113561119", title="Evaluation of individual and ensemble probabilistic forecasts of COVID-19 mortality in the United States", venue="Proceedings of the National Academy of Sciences", authors="Estee Y. Cramer et al.", year=2022),
 "Hu et al. 2026 ICLR": dict(url="", title="", venue="ICLR 2026", authors="", year=2026),
}
ARXIV_ONLY = {"CoRel, ICML 2025 (Cini et al.)", "Staib, Wilder & Jegelka 2019 AISTATS", "Zargarbashi & Bojchevski, ICLR 2024", "DAPS, ICML 2023 (Zargarbashi et al.)"}
cache_path = os.path.join(DECK, "refs.json")
CACHE = {r["cite"]: r for r in json.load(open(cache_path, encoding="utf-8"))} if os.path.exists(cache_path) else {}

out = []; missing = []
for part, cite, surname, year, title, venue in REFS:
    if cite in FIXED: hit = dict(FIXED[cite])
    elif cite in CACHE and CACHE[cite].get("url") and cite not in ARXIV_ONLY: hit = {k: CACHE[cite][k] for k in ("url", "title", "venue", "year", "authors")}
    elif cite in ARXIV_ONLY: hit = arxiv(surname, year, title); time.sleep(0.4)
    else: hit = crossref(surname, year, title) or arxiv(surname, year, title); time.sleep(0.4)
    if hit is not None and not hit.get("url"): hit = None
    if hit:
        if venue: hit["venue"] = venue
        out.append(dict(part=part, cite=cite, **hit)); print("ok  ", cite, "->", hit["url"])
    else:
        out.append(dict(part=part, cite=cite, url="", title=title if not title.startswith(surname) else "", venue=venue, year=year, authors="")); missing.append(cite); print("MISS", cite)
json.dump(out, open(os.path.join(DECK, "refs.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

# ---- the page ----
parts = []; [parts.append(r["part"]) for r in out if r["part"] not in parts]
def entry(r):
    t = html.escape(r["title"] or r["cite"]); who = html.escape(r["authors"]); ven = html.escape(r["venue"] or ""); y = r["year"] or ""
    head = f'<a href="{r["url"]}">{t}</a>' if r["url"] else f'<span class="nolink">{t}</span> <span class="todo">link to be added</span>'
    return f'<li><p class="t">{head}</p><p class="m">{who}{" · " if who else ""}{y}{(" · " + ven) if ven else ""}<span class="as">on the slides as “{html.escape(r["cite"])}”</span></p></li>'
sections = "".join(f'<section><h2>{html.escape(p)}</h2><ol>{"".join(entry(r) for r in out if r["part"] == p)}</ol></section>' for p in parts)
n_ok = sum(1 for r in out if r["url"])
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>References · UQ for Dynamical Networks</title>
<link rel="stylesheet" href="vendor/fonts/fonts.css">
<style>
:root{{--paper:#fff;--ink:#1B2430;--muted:#5B6473;--line:#E3E0D8;--blue:#2563EB;--orange:#EA580C;--soft:#E8EEFC}}
html{{background:var(--paper)}}body{{margin:0;font-family:"Source Sans 3",system-ui,sans-serif;color:var(--ink);line-height:1.45;font-size:18px}}
main{{max-width:900px;margin:0 auto;padding:40px 24px 80px}}
.eyebrow{{font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin:0 0 8px}}
h1{{font-family:"Bricolage Grotesque","Source Sans 3",sans-serif;font-size:40px;line-height:1.1;margin:0 0 12px;letter-spacing:0}}
h2{{font-family:"Bricolage Grotesque","Source Sans 3",sans-serif;font-size:24px;margin:36px 0 10px;padding-top:18px;border-top:1px solid var(--line)}}
p.lede{{color:var(--muted);font-size:19px;margin:0 0 6px}}
ol{{padding-left:28px;margin:0}}li{{margin:0 0 14px}}
p.t{{margin:0;font-weight:600}}p.t a{{color:var(--blue);text-decoration:none;border-bottom:1px solid #C9D3E6}}p.t a:hover{{border-bottom-color:var(--blue)}}
p.m{{margin:2px 0 0;color:var(--muted);font-size:16px}}.as{{display:block;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.04em;color:#8B93A1;margin-top:2px}}
.todo{{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--orange);background:#FDEBE0;border-radius:6px;padding:2px 8px;margin-left:6px}}
.nolink{{color:var(--ink)}}
footer{{margin-top:48px;color:var(--muted);font-size:15px;border-top:1px solid var(--line);padding-top:16px}}
footer a{{color:var(--blue);text-decoration:none}}
</style></head><body><main>
<p class="eyebrow">IEEE BigData 2026 · Tutorial · Phoenix, December 2026</p>
<h1>Every paper cited in “Uncertainty Quantification for Dynamical Networks”</h1>
<p class="lede">{len(out)} works, in the order the tutorial meets them. {n_ok} link to the publisher or arXiv; links were resolved from the citation and checked against first author and year.</p>
<p class="lede">The deck itself: <a href="{SITE}">{SITE.replace("https://", "")}</a> · code and data: <a href="https://github.com/aquastar/uq-dynamical-networks">github.com/aquastar/uq-dynamical-networks</a></p>
{sections}
<footer>Marouane Benbrahim and Zhiqian Chen (Rochester Institute of Technology), Tamanna Rashme (Mississippi State University). This page is generated by <code>figures/make_refs.py</code> from the citations on the slides.</footer>
</main></body></html>
'''
open(os.path.join(DECK, "refs.html"), "w", encoding="utf-8", newline="\n").write(page)
print(f"\nrefs.html: {len(out)} entries, {n_ok} with links, {len(missing)} without:"); [print("  -", m) for m in missing]
