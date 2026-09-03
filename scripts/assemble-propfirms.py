"""Rebuild echelon/propfirms/propfirms.json from researcher batches.

How the sheet is refreshed: four research subagents each write a batch-*.json
(schema in the memory note echelon-propfirms-sheet) into a folder, then

    python scripts/assemble-propfirms.py --in <folder-with-batch-*.json>

normalises slugs (the prop-deals worker keys win), plan types, drawdown kinds
and numbers, applies the per-plan discount overrides below, and writes the
sheet's data file. Bump nothing else; the page reads 'checked' for its status line."""
import glob, json, os, re, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = sys.argv[sys.argv.index("--in") + 1] if "--in" in sys.argv else os.path.join(ROOT, "scripts", "propfirms-research")
OUT = os.path.join(ROOT, "echelon", "propfirms", "propfirms.json")

SLUG = {  # the worker's keys win, so live codes line up
    "apex": "apex", "apex-trader-funding": "apex", "apextraderfunding": "apex",
    "topstep": "topstep", "top-step": "topstep",
    "mffu": "mffu", "my-funded-futures": "mffu", "myfundedfutures": "mffu", "my_funded_futures": "mffu",
    "lucid": "lucid", "lucid-trading": "lucid", "lucidtrading": "lucid",
    "alpha": "alpha", "alpha-futures": "alpha", "alphafutures": "alpha",
}
def slug_of(f):
    s = (f.get("slug") or f.get("firm") or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return SLUG.get(s, s)

def num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return v
    m = re.search(r"-?\d[\d,]*(\.\d+)?", str(v).replace("k", "000").replace("K", "000"))
    return float(m.group(0).replace(",", "")) if m else None
def intnum(v):
    n = num(v); return int(n) if n is not None and float(n).is_integer() else n

def dd_kind(v):
    s = (v or "").lower()
    if not s: return None
    if "static" in s or "fixed" in s: return "static"
    if "eod" in s or "end of day" in s or "end-of-day" in s or "daily" in s: return "trailing-eod"
    if "intra" in s or "real" in s or "trail" in s: return "trailing-intraday"
    return v
def plan_type(v):
    s = (v or "evaluation").lower()
    if "instant" in s or "express" in s: return "instant"
    if "direct" in s or "live" in s: return "direct"
    return "evaluation"
def period(v):
    s = (v or "").lower()
    if "one" in s or "once" in s or "lifetime" in s: return "one-time"
    if "month" in s or "mo" in s or "sub" in s: return "monthly"
    return v or None

# Per-plan discount overrides where a firm's code is tiered or partial (from the
# researchers' applies_to notes). False = no code for that plan family.
PLAN_OVERRIDES = {
    "bulenox": [(r"Qualification - Option 1", {"pct": 89}), (r"Qualification - Option 2", {"pct": 75}), (r"Fast Track|Momentum", {"pct": 45})],
    "fundednext": [(r"^Rapid", {"code": "RAPID", "pct_by_size": {25000: 50, 50000: 46, 100000: 44}}), (r"^Legacy", False)],
    "alpha": [(r"Direct", False)],
    "tradeify": [(r"Lightning", {"pct": 50})],          # SEP covers Lightning purchases too
    "lucid": [(r"LucidDirect", {"pct": 40})],           # VAULT covers LucidDirect too
    "toponefutures": [(r"INSTANT Sim", {"pct": 45}), (r"IGNITE", {"pct": 50}), (r"Elite Access", False)],   # BOGO is not a percentage; the note carries it
    "purdia": [(r"Static Instant", {"code": "LIVE40", "pct": 40}), (r"Instant Funded", {"code": "PURDIA60", "pct": 60})],
}
def plan_override(slug, plan):
    for rx, ov in PLAN_OVERRIDES.get(slug, []):
        if re.search(rx, plan["plan"], re.I):
            if ov is False: return False
            out = {k: v for k, v in ov.items() if k != "pct_by_size"}
            if "pct_by_size" in ov:
                out["pct"] = ov["pct_by_size"].get(plan["size"])
                if out["pct"] is None: return None
            return out
    return None

firms, sources, seen = {}, set(), []
for path in sorted(glob.glob(os.path.join(D, "batch-*.json"))):
    try:
        b = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print("SKIP", path, e); continue
    sources.update(b.get("sources") or [])
    seen += b.get("also_seen") or []
    for f in b.get("firms") or []:
        slug = slug_of(f)
        plans = []
        for p in f.get("plans") or []:
            note = (p.get("note") or "").strip()
            rec = {
                "plan": (p.get("plan") or "").strip() or "Evaluation",
                "type": plan_type(p.get("type")),
                "size": intnum(p.get("size")),
                "price": num(p.get("price")),
                "period": period(p.get("period")),
                "reset": num(p.get("reset")),
                "activation": p.get("activation") or None,
                "target": num(p.get("target")),
                "drawdown": num(p.get("drawdown")),
                "dd_type": dd_kind(p.get("dd_type")),
                "daily_loss": num(p.get("daily_loss")),
                "consistency": p.get("consistency") or None,
                "min_days": intnum(p.get("min_days")),
                "contracts": p.get("contracts") or None,
                "scaling": p.get("scaling") or None,
                "split": p.get("split") or None,
                "payout": p.get("payout") or None,
                "platform": p.get("platform") or None,
                "note": (p.get("note") or "").strip(),
                # the researcher could only see a promo price: the sheet must not apply the code again
                "net": bool(re.search(r"post-promo|promo price|launch price|already (the )?(promo|discount)|do not apply|don't apply", note, re.I)),
            }
            if re.search(r"discontinued", rec["plan"], re.I): continue      # not for sale
            ov = plan_override(slug, rec)
            if ov is not None: rec["discount"] = ov                          # dict = own tier, False = no code
            # "Regular $X" in the note = the list price; the listed price is then the exact promo price
            m = re.search(r"[Rr]egular \$?([\d,]+(?:\.\d+)?)", note)
            if m and rec["price"] is not None:
                reg = float(m.group(1).replace(",", ""))
                if reg > rec["price"]:
                    rec["promo_price"] = rec["price"]; rec["price"] = reg; rec["net"] = False
            # "Sale price $X" in the note = the listed price is the list price, X is what the sale charges
            m = re.search(r"[Ss]ale price \$?([\d,]+(?:\.\d+)?)", note)
            if m and rec["price"] is not None:
                sale = float(m.group(1).replace(",", ""))
                if sale < rec["price"]: rec["promo_price"] = sale
            plans.append(rec)
        plans = [p for p in plans if p["size"] is not None]
        order = {"evaluation": 0, "instant": 1, "direct": 2}
        plans.sort(key=lambda p: (order.get(p["type"], 9), p["size"], p["price"] if p["price"] is not None else 1e9))
        d = f.get("discount") or None
        if d and (not d.get("code") or d.get("pct") is None): d = None
        if d: d["pct"] = num(d.get("pct"))
        rec = {
            "firm": f.get("firm"), "slug": slug, "site": f.get("site"), "pricing_url": f.get("pricing_url") or f.get("site"),
            "active": f.get("active", True) is not False, "discount": d, "summary": f.get("summary") or {}, "plans": plans,
        }
        if slug in firms:  # two batches covered the same firm: keep the one with more plans
            if len(plans) <= len(firms[slug]["plans"]): continue
        firms[slug] = rec

out = {
    "checked": datetime.date.today().isoformat(),
    "firms": sorted(firms.values(), key=lambda f: f["firm"].lower()),
    "also_seen": seen,
    "sources": sorted(sources),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
print(f"wrote {OUT}: {len(out['firms'])} firms, {sum(len(f['plans']) for f in out['firms'])} plans, {len(out['sources'])} sources")
for f in out["firms"]:
    d = f["discount"]
    sizes = sorted({p["size"] for p in f["plans"]})
    print(f"  {'ON ' if f['active'] else 'OFF'} {f['firm']:<26} {f['slug']:<9} plans={len(f['plans']):<3} code={d['code'] if d else '-':<12} {str(int(d['pct']))+'%' if d else '':<4} sizes={[int(s/1000) for s in sizes]}")
if seen: print("also seen:", [s.get("firm") for s in seen])
