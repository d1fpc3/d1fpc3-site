"""Rebuild the Echelon daily-splash lockup (echelon/app/index.html, #splash).

The lockup is inline SVG built from the same fonts the logo PNGs were made
with: Roboto Slab 700 for the E, Poppins 800 for "Echelon". Run this after
a logo change; it fetches the two TTFs from Google Fonts, lays the lockup
out, and swaps the <div id="splash"> block in place (CRLF preserved).

    python scripts/build-splash-svg.py            # from the repo root
    python scripts/build-splash-svg.py --svg out.svg   # also write a standalone svg

Needs fontTools + Pillow (both on the Windows box).
"""
import io, json, math, os, re, sys, tempfile, urllib.request
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "echelon", "app", "index.html")
MARK = os.path.join(ROOT, "echelon", "assets", "logo-mark.png")
CSS_API = "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@700&family=Poppins:wght@800"

def fetch(url, ua="Mozilla/4.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})   # an old UA gets plain TTFs
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def load_fonts():
    css = fetch(CSS_API).decode()
    fonts = {}
    for url in sorted(set(re.findall(r"https://[^)]+\.ttf", css))):
        f = TTFont(io.BytesIO(fetch(url)))
        if "fvar" in f:
            from fontTools.varLib.instancer import instantiateVariableFont
            f = instantiateVariableFont(f, {"wght": 700 if "robotoslab" in url else 800})
        fonts[f["name"].getDebugName(1)] = f
    slab = next(v for k, v in fonts.items() if k.startswith("Roboto Slab"))
    pop = next(v for k, v in fonts.items() if k.startswith("Poppins"))
    return slab, pop

fmt = lambda v: (f"{v:.2f}").rstrip("0").rstrip(".")

def glyph(font, ch, scale, tx, ty):
    gs = font.getGlyphSet(); gname = font.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs, ntos=fmt)
    gs[gname].draw(TransformPen(pen, (scale, 0, 0, -scale, tx, ty)))
    bp = BoundsPen(gs); gs[gname].draw(bp)
    return pen.getCommands(), font["hmtx"][gname][0], bp.bounds

def build():
    slab, pop = load_fonts()
    im = Image.open(MARK).convert("RGB")
    GOLD = "#%02x%02x%02x" % im.getpixel((230, 380))   # sampled off the shipped mark
    BG = "#%02x%02x%02x" % im.getpixel((20, 20))
    WORD = "#f3efe7"

    W = 260.0; E_H = 100.0; E_TOP = 18.0
    _, _, (bx0, by0, bx1, by1) = glyph(slab, "E", 1, 0, 0)
    s_e = E_H / (by1 - by0)
    e_w = (bx1 - bx0) * s_e
    e_x0 = (W - e_w) / 2
    e_base = E_TOP + by1 * s_e
    e_d, _, _ = glyph(slab, "E", s_e, e_x0 - bx0 * s_e, e_base)
    e_y1 = E_TOP + E_H; cx = e_x0 + e_w / 2

    ANG = -12.0; S_Y = E_TOP + 0.80 * E_H; S_TH = 5.6      # the slash: bg-coloured bar through the lower part of the E
    S_L = (e_w + 22) / math.cos(math.radians(ANG)); s_x0 = cx - S_L / 2
    B_L = 26.0; B_TH = 2.4                                   # the blade that cuts it

    CAP = 20.0                                               # wordmark cap height = 20% of the E (logo-full.png)
    s_w = CAP / (pop["OS/2"].sCapHeight or 700)
    GAP = 36.0; base_w = e_y1 + GAP + CAP
    word = "Echelon"
    adv_total = sum(glyph(pop, ch, s_w, 0, 0)[1] * s_w for ch in word)
    x = cx - adv_total / 2; letters = []
    for ch in word:
        d, adv, _ = glyph(pop, ch, s_w, x, base_w); letters.append(d); x += adv * s_w
    H = round(base_w + 10)

    paths = "\n".join(f'      <path class="sp-l" style="--i:{i}" d="{d}"/>' for i, d in enumerate(letters))
    inner = f'''    <path class="sp-e" fill="{GOLD}" d="{e_d}"/>
    <g transform="rotate({fmt(ANG)} {fmt(cx)} {fmt(S_Y)})">
      <rect class="sp-slash" x="{fmt(s_x0)}" y="{fmt(S_Y - S_TH/2)}" width="{fmt(S_L)}" height="{fmt(S_TH)}" fill="{BG}"/>
      <rect class="sp-blade" x="{fmt(s_x0)}" y="{fmt(S_Y - B_TH/2)}" width="{fmt(B_L)}" height="{fmt(B_TH)}" rx="{fmt(B_TH/2)}" fill="#f2d27c"/>
    </g>
    <g class="sp-word" fill="{WORD}">
{paths}
    </g>'''
    snippet = f'''  <div id="splash" aria-hidden="true"><svg class="lockup" viewBox="0 0 {fmt(W)} {H}" style="--L:{fmt(S_L)}">
{inner}
  </svg></div>'''
    standalone = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(W)} {H}" width="520" style="background:{BG}">\n{inner}\n</svg>\n'
    return snippet, standalone, {"gold": GOLD, "bg": BG, "slash_len": round(S_L, 2), "viewBox": f"0 0 {fmt(W)} {H}"}

if __name__ == "__main__":
    snippet, standalone, info = build()
    if "--svg" in sys.argv:
        out = sys.argv[sys.argv.index("--svg") + 1]
        open(out, "w", encoding="utf-8").write(standalone); print("wrote", out)
    # the members app carries the splash; the admin carries the same lockup in a
    # <template> for its "Play the intro" button — both get the fresh block
    pat = re.compile(r'  <div id="splash" aria-hidden="true"><svg class="lockup".*?</svg></div>', re.S)
    changed = {}
    for path in (APP, os.path.join(ROOT, "echelon", "admin", "index.html")):
        page = open(path, encoding="utf-8").read()
        if len(pat.findall(page)) != 1:
            print(os.path.relpath(path, ROOT) + ": splash block not found exactly once; skipped"); continue
        new = pat.sub(lambda m: snippet, page)
        changed[os.path.relpath(path, ROOT)] = new != page
        if new != page:
            open(path, "w", encoding="utf-8", newline="\r\n").write(new)
    print(json.dumps({**info, "changed": changed}))
