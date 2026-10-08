// Chapter 08 (MSNR) concept drawings, in the course's chart look: grey canvas, white up
// candles, pink down candles, black linework. Renders PNGs for the lesson-files bucket.
//   OUT=<dir> node scripts/msnr-diagrams.mjs [name ...]
// Upload to lesson-files/image/course/<name>.png (the lessons point at those paths).
import { createRequire } from "module";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");

const W = 1600, H = 900;
const C = { bg: "#808080", ink: "#141414", bull: "#f1f1f1", bear: "#f0a0a0", text: "#151515", head: "#ffffff", shade: "rgba(20,20,20,.16)", soft: "#2b2b2b", dim: "#3a3a3a" };
const FONT = `'Trebuchet MS','Segoe UI',system-ui,sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

class Panel {
  constructor({ ox = 0, flip = false } = {}) { this.ox = ox; this.flip = flip; this.out = []; }
  X(x) { return x + this.ox; }
  Y(y) { return this.flip ? H - y : y; }
  candle(x, o, h, l, c, w = 36) {
    const O = this.Y(o), Hh = this.Y(h), L = this.Y(l), Cc = this.Y(c), X = this.X(x);
    const top = Math.min(O, Cc), bot = Math.max(O, Cc), up = Cc < O;
    this.out.push(`<line x1="${X}" y1="${Math.min(Hh, L)}" x2="${X}" y2="${Math.max(Hh, L)}" stroke="${C.ink}" stroke-width="2"/>`,
      `<rect x="${X - w / 2}" y="${top}" width="${w}" height="${Math.max(bot - top, 2)}" fill="${up ? C.bull : C.bear}" stroke="${C.ink}" stroke-width="1.6"/>`);
    return this;
  }
  path(pts, { arrow = false, dash = false, w = 2.2, color = C.ink } = {}) {
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${this.X(x)} ${this.Y(y)}`).join(" ");
    this.out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="7 7"` : ""}${arrow ? ` marker-end="url(#arr)"` : ""}/>`);
    return this;
  }
  level(x1, x2, y, { label, dash = false, w = 2.2, color = C.ink, size = 17 } = {}) {
    this.out.push(`<line x1="${this.X(x1)}" y1="${this.Y(y)}" x2="${this.X(x2)}" y2="${this.Y(y)}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="8 7"` : ""}/>`);
    if (label) this.out.push(`<text x="${this.X(x2) + 12}" y="${this.Y(y) + size * 0.35}" font-size="${size}" fill="${C.text}" font-family="${FONT}">${esc(label)}</text>`);
    return this;
  }
  // pos: above | below | mid. Above and below swap when the panel is flipped.
  text(x, y, s, { pos = "mid", size = 17, anchor = "middle", fill = C.text, weight = 400, italic = false, off = 10 } = {}) {
    let p = pos;
    if (this.flip && p === "above") p = "below"; else if (this.flip && p === "below") p = "above";
    const Y = this.Y(y), base = p === "above" ? Y - off : p === "below" ? Y + size + off - 4 : Y + size * 0.35;
    this.out.push(`<text x="${this.X(x)}" y="${base}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}"${italic ? ` font-style="italic"` : ""} font-family="${FONT}">${esc(s)}</text>`);
    return this;
  }
  // Text laid along a leg from a to b, nudged off the line to one side (side flips with the panel).
  leg(a, b, s, { side = 1, size = 16, gap = 14 } = {}) {
    const ax = this.X(a[0]), ay = this.Y(a[1]), bx = this.X(b[0]), by = this.Y(b[1]);
    let ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len, k = side * (this.flip ? -1 : 1) * gap;
    const mx = (ax + bx) / 2 + nx * k, my = (ay + by) / 2 + ny * k;
    this.out.push(`<text x="${mx}" y="${my}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="${C.text}" font-family="${FONT}" transform="rotate(${ang} ${mx} ${my})">${esc(s)}</text>`);
    return this;
  }
  shade(x1, y1, x2, y2) {
    const a = this.Y(y1), b = this.Y(y2);
    this.out.push(`<rect x="${this.X(x1)}" y="${Math.min(a, b)}" width="${x2 - x1}" height="${Math.abs(b - a)}" fill="${C.shade}"/>`);
    return this;
  }
  ring(x, y, r = 13) { this.out.push(`<circle cx="${this.X(x)}" cy="${this.Y(y)}" r="${r}" fill="none" stroke="#ffffff" stroke-width="2.6"/>`); return this; }
  cross(x, y, r = 16) { const X = this.X(x), Y = this.Y(y); this.out.push(`<path d="M${X - r} ${Y - r} L${X + r} ${Y + r} M${X + r} ${Y - r} L${X - r} ${Y + r}" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`); return this; }
  raw(s) { this.out.push(s); return this; }
  svg() { return this.out.join("\n"); }
}

const title = (x, y, s, size = 27) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="${C.head}" font-weight="600" font-family="${FONT}">${esc(s)}</text>`;
const note = (x, y, s, { size = 17, anchor = "middle", fill = C.text, weight = 400 } = {}) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" font-family="${FONT}">${esc(s)}</text>`;
const lines = (x, y, arr, opts = {}) => arr.map((s, i) => note(x, y + i * ((opts.size || 17) + 7), s, opts)).join("");
const pill = (x, y, w, h, s, size = 24) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.shade}" stroke="${C.ink}" stroke-width="1.6"/>` + note(x, y + size * 0.35, s, { size });
const box = (x, y, w, h, fill = C.shade) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${C.ink}" stroke-width="1.6"/>`;
const divider = `<line x1="${W / 2}" y1="120" x2="${W / 2}" y2="790" stroke="#6f6f6f" stroke-width="1.5"/>`;

// ---------------------------------------------------------------- figures
const FIG = {};

FIG["msnr-candle-anatomy"] = () => {
  const p = new Panel();
  p.candle(560, 610, 230, 720, 350, 120).candle(1040, 350, 230, 720, 610, 120);
  const tag = (x, y, s) => p.text(x, y, s, { size: 22, anchor: "start", weight: 600 });
  tag(635, 230, "H"); tag(635, 350, "C"); tag(635, 610, "O"); tag(635, 720, "L");
  tag(1115, 230, "H"); tag(1115, 350, "O"); tag(1115, 610, "C"); tag(1115, 720, "L");
  // brackets on the up candle
  p.path([[470, 236], [455, 236], [455, 344], [470, 344]], { w: 2 }).path([[470, 356], [455, 356], [455, 604], [470, 604]], { w: 2 });
  p.raw(lines(435, 282, ["Wick, the footprint.", "Price went here", "and was sent back."], { anchor: "end", size: 19 }));
  p.raw(lines(435, 465, ["Body, the decision.", "Where price settled", "when time ran out."], { anchor: "end", size: 19 }));
  p.raw(lines(1200, 455, ["The close is the", "price that matters.", "Every level comes", "off a body."], { anchor: "start", size: 19 }));
  p.raw(note(560, 790, "Up candle", { size: 19, fill: "#ffffff" }) + note(1040, 790, "Down candle", { size: 19, fill: "#ffffff" }));
  return title(W / 2, 110, "Body and wick") + p.svg();
};

FIG["msnr-line-chart"] = () => {
  const p = new Panel();
  const closes = [640, 600, 555, 520, 470, 420, 465, 515, 495, 575, 640, 590, 540, 470, 480, 410, 350];
  const wick = [[22, 18], [30, 14], [16, 26], [28, 20], [18, 30], [34, 16], [20, 22], [14, 28], [26, 18], [18, 24], [16, 36], [30, 18], [22, 20], [18, 26], [26, 22], [20, 18], [28, 16]];
  const x0 = 230, dx = 72, pts = [];
  for (let i = 1; i < closes.length; i++) {
    const o = closes[i - 1], c = closes[i], x = x0 + (i - 1) * dx;
    p.candle(x, o, Math.min(o, c) - wick[i][0], Math.max(o, c) + wick[i][1], c, 32);
    pts.push([x + 16, c]);
  }
  p.path(pts, { w: 3, color: "#ffffff" });
  for (const [x, y] of pts) p.raw(`<circle cx="${x}" cy="${y}" r="5" fill="#ffffff" stroke="${C.ink}" stroke-width="1.5"/>`);
  p.text(x0 + 4 * dx + 16, 420 - 46, "A", { size: 30, weight: 700 }).text(x0 + 9 * dx + 16, 640 + 62, "V", { size: 30, weight: 700 });
  p.raw(lines(W / 2, 800, ["The white line joins the closes and nothing else. The wicks fall away and the real turns show."], { size: 19 }));
  return title(W / 2, 110, "A line chart is only the closes") + p.svg();
};

FIG["msnr-five-levels"] = () => {
  const out = [title(W / 2, 110, "The five basic levels")];
  const cy = 430, xs = [190, 500, 800, 1100, 1410];
  const mini = (cx, f) => { const p = new Panel({ ox: cx }); f(p); return p.svg(); };
  const shift = (pts) => pts.map(([x, y]) => [x, y + cy]);
  // classic
  out.push(mini(xs[0], (p) => { p.level(-50, 125, cy - 70).path(shift([[-125, 110], [-50, -70], [-5, 40], [28, -12], [52, 30], [88, -70], [125, 105]]), { arrow: true }).ring(88, cy - 70); }));
  // gap
  out.push(mini(xs[1], (p) => { p.candle(-96, cy + 70, cy - 5 + 0 - 14, cy + 86, cy + 0, 26).candle(-66, cy, cy - 84, cy + 12, cy - 70, 26); p.level(-96, 125, cy).path(shift([[-66, -70], [-20, -118], [8, -55], [36, -88], [80, 0], [125, -125]]), { arrow: true }).ring(80, cy); }));
  // breakout
  out.push(mini(xs[2], (p) => { p.level(-75, 125, cy).path(shift([[-125, 95], [-75, 0], [-48, 60], [-2, -90], [24, -42], [44, -70], [80, 0], [125, -125]]), { arrow: true }).ring(80, cy); }));
  // hns
  out.push(mini(xs[3], (p) => { p.level(-82, 125, cy).path(shift([[-125, 95], [-82, 0], [-58, 52], [-22, -105], [14, 72], [36, 38], [54, 62], [86, 0], [125, 115]]), { arrow: true }).ring(86, cy); }));
  // broken hns
  out.push(mini(xs[4], (p) => { p.level(-92, 125, cy).path(shift([[-125, 95], [-92, 0], [-72, 48], [-48, -95], [-22, 66], [8, -85], [30, -42], [48, -70], [82, 0], [125, -128]]), { arrow: true }).ring(82, cy); }));
  const names = ["Classic", "Gap", "Breakout", "HNS", "Broken HNS"];
  const desc = [["Where a move turned.", "Body to body at the top", "or bottom of the turn."], ["The seam between two", "candles of the", "same colour."], ["A classic that a body", "closed through, then", "came back to."], ["A break that failed", "and closed back", "inside the line."], ["The failed break", "fails too. Retest", "and go."]];
  names.forEach((n, i) => { out.push(note(xs[i], 650, n, { size: 24, fill: "#ffffff", weight: 600 }), lines(xs[i], 688, desc[i], { size: 17 })); });
  out.push(note(W / 2, 845, "White ring: the return you trade, after a miss.", { size: 17, fill: C.dim }));
  return out.join("\n");
};

// One side of a classic, drawn as resistance; the mirror is support.
const classicSide = (ox, flip) => {
  const p = new Panel({ ox, flip });
  p.candle(110, 650, 630, 668, 590).candle(158, 590, 568, 606, 520).candle(206, 520, 490, 530, 430).candle(254, 430, 402, 520, 505);
  p.shade(390, 430, 500, 548);
  p.level(206, 650, 430, { label: flip ? "Classic V" : "Classic A" });
  p.path([[272, 505], [340, 610], [445, 548], [500, 600], [585, 430], [660, 700]], { arrow: true });
  p.ring(585, 430);
  p.text(445, 490, "miss", { size: 18, weight: 600 });
  p.text(585, 430, "first return", { pos: "above", size: 17, off: 26 });
  p.text(282, 430, "body seam", { pos: "above", size: 16, anchor: "start" });
  return p.svg();
};
FIG["msnr-classic"] = () => title(400, 110, "Classic A, resistance") + title(1200, 110, "Classic V, support") + divider + classicSide(40, false) + classicSide(840, true);

FIG["msnr-miss"] = () => {
  const a = new Panel({ ox: 0 }), b = new Panel({ ox: 800 });
  a.shade(318, 330, 470, 440).level(170, 690, 330);
  a.path([[90, 720], [230, 330], [340, 560], [400, 440], [460, 580], [590, 330], [690, 650]], { arrow: true }).ring(590, 330);
  a.text(394, 385, "the miss", { size: 19, weight: 600 }).text(590, 330, "clean first touch", { pos: "above", size: 17, off: 26 });
  b.level(130, 690, 330);
  b.path([[60, 720], [190, 330], [250, 410], [295, 334], [340, 395], [385, 328], [430, 392], [480, 336], [530, 380], [600, 330], [690, 220]], { arrow: true });
  b.cross(400, 480).text(400, 480, "no space left, nothing to return to", { pos: "below", size: 17, off: 30 });
  return title(400, 110, "With a miss") + title(1200, 110, "No miss") + divider + a.svg() + b.svg() +
    lines(400, 800, ["Price leaves the line, then pulls back", "without touching it. The return is clean."], { size: 18 }) +
    lines(1200, 800, ["Price keeps tagging the line. It never left,", "so there is no clean return. Skip it."], { size: 18 });
};

FIG["msnr-gap"] = () => {
  const a = new Panel({ ox: 0 }), b = new Panel({ ox: 800 });
  a.candle(170, 650, 632, 664, 560).candle(218, 560, 452, 574, 470);
  a.shade(340, 452, 430, 560).level(170, 690, 560, { label: "gap" });
  a.path([[236, 470], [330, 370], [385, 452], [440, 405], [530, 560], [680, 260]], { arrow: true }).ring(530, 560);
  a.text(385, 510, "miss", { size: 18, weight: 600 }).text(530, 560, "return", { pos: "below", size: 17, off: 26 });
  b.candle(150, 560, 542, 574, 480).candle(198, 480, 382, 492, 400);
  b.level(150, 690, 480, { label: "gap" });
  b.path([[216, 400], [270, 345], [345, 445], [410, 590], [450, 532], [490, 600], [560, 480], [680, 720]], { arrow: true }).ring(560, 480);
  b.shade(430, 480, 470, 532).text(352, 572, "closes through", { pos: "mid", size: 17, anchor: "end" }).text(560, 480, "retest", { pos: "above", size: 17, off: 26 });
  return title(400, 110, "Gap that holds") + title(1200, 110, "Gap used as a breakout") + divider + a.svg() + b.svg() +
    lines(400, 800, ["Two up candles. The line is their seam.", "Miss, return, continue."], { size: 18 }) +
    lines(1200, 800, ["A body closes through the seam the other way.", "Miss below it, then sell the return."], { size: 18 });
};

FIG["msnr-breakout"] = () => {
  const p = new Panel();
  p.candle(200, 650, 632, 664, 570).candle(248, 570, 552, 584, 480).candle(296, 480, 458, 568, 560);
  p.candle(344, 560, 548, 618, 605).candle(392, 605, 548, 620, 560).candle(440, 560, 492, 574, 505).candle(488, 505, 372, 516, 390);
  p.candle(536, 390, 352, 400, 362).candle(584, 362, 344, 430, 405);
  p.shade(560, 430, 640, 480).level(248, 1180, 480, { label: "classic A, now broken" });
  p.path([[602, 405], [700, 320], [830, 480], [1010, 250], [1120, 290], [1240, 160]], { arrow: true }).ring(830, 480);
  p.text(462, 425, "body closes above", { size: 17, anchor: "end" }).text(600, 455, "miss", { size: 18, weight: 600 });
  p.text(830, 480, "back to the line: buy", { pos: "below", size: 17, off: 26 }).text(222, 480, "the classic", { size: 16, anchor: "end" });
  return title(W / 2, 110, "Breakout") + p.svg() + note(W / 2, 800, "Old resistance, closed through by a body. Wait for the miss, then buy the return to the line.", { size: 19 });
};

const hnsSide = (ox, flip) => {
  const p = new Panel({ ox, flip });
  p.candle(110, 660, 642, 674, 580).candle(158, 580, 562, 594, 500).candle(206, 500, 478, 570, 560);
  p.level(158, 640, 500, { label: "HNS" });
  p.path([[224, 560], [285, 625], [360, 320], [430, 615], [485, 555], [530, 615], [600, 500], [690, 770]], { arrow: true }).ring(600, 500);
  p.shade(465, 500, 505, 555);
  p.text(360, 320, "head", { pos: "above", size: 17 }).text(440, 640, "closes back inside", { pos: "below", size: 17 });
  p.text(485, 528, "miss", { size: 16, weight: 600, anchor: "end" }).text(600, 500, "right shoulder", { pos: "above", size: 17, off: 26 });
  p.text(110, 500, "left shoulder", { pos: "above", size: 16, anchor: "start" });
  return p.svg();
};
FIG["msnr-hns"] = () => title(400, 110, "HNS, sell the retest") + title(1200, 110, "Bullish HNS, buy the retest") + divider + hnsSide(40, false) + hnsSide(840, true);

const bhnsSide = (ox, flip) => {
  const p = new Panel({ ox, flip });
  p.candle(100, 640, 622, 654, 560).candle(148, 560, 542, 574, 480).candle(196, 480, 458, 550, 540);
  p.level(148, 650, 480, { label: "the line" });
  p.path([[214, 540], [265, 600], [325, 320], [390, 640], [465, 330], [505, 418], [540, 372], [600, 480], [700, 190]], { arrow: true }).ring(600, 480);
  p.shade(490, 418, 535, 480);
  p.text(325, 320, "head", { pos: "above", size: 17 }).text(390, 640, "HNS forms", { pos: "below", size: 17 });
  p.text(465, 330, "closes back through", { pos: "above", size: 17 }).text(487, 452, "miss", { size: 16, weight: 600, anchor: "end" });
  p.text(600, 480, "retest", { pos: "below", size: 17, off: 26 });
  return p.svg();
};
FIG["msnr-bhns"] = () => title(400, 110, "Broken HNS, buy the retest") + title(1200, 110, "Broken HNS, sell the retest") + divider + bhnsSide(40, false) + bhnsSide(840, true);

const keySide = (ox, flip) => {
  const p = new Panel({ ox, flip });
  p.candle(200, 600, 448, 616, 470, 46).candle(262, 470, 455, 668, 645, 46);
  p.level(150, 330, 600, { dash: true, w: 1.8 });
  p.text(140, 600, flip ? "down candle's open" : "up candle's open", { size: 16, anchor: "end" });
  p.level(262, 640, 470, { label: "key level" });
  p.path([[285, 645], [360, 720], [420, 650], [470, 700], [560, 470], [680, 770]], { arrow: true }).ring(560, 470);
  p.text(300, 650, "closes past it", { pos: "mid", size: 17, anchor: "start" });
  p.text(298, 435, "engulfing candle's open", { size: 17, anchor: "start" });
  return p.svg();
};
FIG["msnr-key-level"] = () => title(400, 110, "Bearish key level") + title(1200, 110, "Bullish key level") + divider + keySide(40, false) + keySide(840, true) +
  lines(400, 820, ["A down candle closes below the up candle's open.", "Its open is the line. Sell the return."], { size: 18 }) +
  lines(1200, 820, ["An up candle closes above the down candle's open.", "Its open is the line. Buy the return."], { size: 18 });

FIG["msnr-key-level-gap"] = () => {
  const p = new Panel();
  p.candle(430, 640, 352, 662, 380, 50).candle(500, 380, 358, 566, 525, 50).candle(570, 525, 492, 718, 690, 50);
  p.level(395, 640, 640, { dash: true, w: 1.8, label: "up candle's open" });
  p.level(570, 1240, 525, { label: "key level: B's open" });
  p.text(500, 358, "A", { pos: "above", size: 22, weight: 700 }).text(570, 492, "B", { pos: "above", size: 22, weight: 700 });
  p.path([[595, 690], [700, 770], [760, 705], [815, 745], [930, 525], [1080, 790]], { arrow: true }).ring(930, 525);
  p.raw(lines(660, 330, ["A closes above the up candle's open.", "A did not eat it."], { anchor: "start", size: 18 }));
  p.raw(lines(375, 720, ["B closes below it.", "B is the engulfing candle,", "so B's open is the line."], { anchor: "end", size: 18 }));
  p.path([[652, 345], [530, 470]], { w: 1.5, dash: true }).path([[383, 728], [540, 692]], { w: 1.5, dash: true });
  return title(W / 2, 110, "Which candle did the eating?") + p.svg() + note(W / 2, 845, "Always ask whose close actually went past the open.", { size: 19 });
};

FIG["msnr-timeframes"] = () => {
  const cols = [[330, "Swing", ["Monthly", "Weekly", "Daily"], ["Trades held for days", "or longer."]], [800, "Intraday", ["4 hour", "1 hour", "30 minute"], ["Where NQ day trades", "get their direction."]], [1270, "Confirmation", ["15 minute", "5 minute", "1 minute"], ["Entries at the level only.", "Never for direction."]]];
  const out = [title(W / 2, 110, "Direction is read on a timeframe")];
  for (const [x, h, tfs, d] of cols) {
    out.push(note(x, 215, h, { size: 28, fill: "#ffffff", weight: 600 }));
    tfs.forEach((t, i) => out.push(pill(x, 300 + i * 100, 250, 66, t)));
    out.push(lines(x, 640, d, { size: 19 }));
  }
  out.push(`<path d="M505 400 L610 400" stroke="${C.ink}" stroke-width="2" marker-end="url(#arr)"/>`, `<path d="M975 400 L1080 400" stroke="${C.ink}" stroke-width="2" marker-end="url(#arr)"/>`);
  return out.join("\n");
};

const trendSide = (ox, flip) => {
  const p = new Panel({ ox, flip });
  const pts = [[70, 770], [200, 570], [290, 660], [420, 440], [510, 540], [640, 310], [730, 415], [770, 330]];
  p.path(pts, { arrow: true, w: 2.6 });
  const hh = [pts[1], pts[3], pts[5]], hl = [pts[2], pts[4], pts[6]];
  hh.forEach(([x, y]) => p.text(x, y, flip ? "LL" : "HH", { pos: "above", size: 18, weight: 700 }));
  hl.forEach(([x, y], i) => { p.level(x - 60, x + 50, y, { w: 2.4 }); p.text(x, y, flip ? "LH" : "HL", { pos: "below", size: 18, weight: 700 }); p.text(i < 2 ? x + 58 : x - 68, y, "key level", { size: 15, anchor: i < 2 ? "start" : "end" }); });
  for (let i = 0; i < 6; i++) p.leg(pts[i], pts[i + 1], i % 2 ? "pullback" : "continuation", { side: i % 2 ? -1 : -1, size: 15 });
  return p.svg();
};
FIG["msnr-trend"] = () => title(400, 110, "Uptrend") + title(1200, 110, "Downtrend") + divider + trendSide(10, false) + trendSide(800, true) +
  note(W / 2, 845, "Two modes only: continuation and pullback. Every pullback ends on a key level.", { size: 19 });

FIG["msnr-direction-signs"] = () => {
  const a = new Panel({ ox: 0 }), b = new Panel({ ox: 800 });
  a.candle(150, 650, 632, 664, 560).candle(198, 560, 540, 640, 625).candle(246, 625, 610, 690, 672).candle(294, 672, 595, 686, 612).candle(342, 612, 548, 624, 578).candle(390, 578, 462, 590, 480);
  a.level(198, 660, 560, { label: "classic" });
  a.path([[408, 480], [480, 410], [540, 470], [640, 300]], { arrow: true, dash: true });
  a.text(372, 470, "body closes above", { size: 17, anchor: "end" });
  b.level(170, 520, 600, { label: "HNS line" }).level(370, 640, 360, { label: "classic high" });
  b.path([[90, 300], [170, 600], [235, 470], [300, 740], [370, 360], [450, 600], [540, 330], [660, 160]], { arrow: true }).ring(450, 600);
  b.text(450, 600, "held", { pos: "below", size: 17, off: 26 }).text(552, 410, "close through: big move", { size: 17, anchor: "start" });
  return title(400, 110, "Sign 1: body close through a classic") + title(1200, 110, "Sign 2: price respects an HNS") + divider + a.svg() + b.svg() +
    lines(400, 800, ["Direction on that timeframe is now up.", "A wick through it changes nothing."], { size: 18 }) +
    lines(1200, 800, ["Hold at the HNS, then a close through the", "classic above it. This is the one you hold."], { size: 18 });
};

FIG["msnr-process"] = () => {
  const p = new Panel();
  p.level(250, 640, 410, { label: "classic" }).level(470, 720, 500, { label: "key level" });
  p.path([[80, 230], [190, 470], [250, 410], [360, 650], [470, 330], [520, 380], [560, 500]], { w: 2.6 });
  p.path([[560, 500], [690, 200]], { arrow: true, w: 2.6 });
  p.raw(`<circle cx="560" cy="500" r="40" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="6 6"/>`);
  // inset: the small timeframe at the level
  p.raw(box(1000, 270, 470, 440, "rgba(20,20,20,.10)"));
  p.raw(`<path d="M600 500 L1000 560" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="6 6"/>`);
  const badge = (x, y, n) => p.raw(`<circle cx="${x}" cy="${y}" r="19" fill="${C.ink}"/>` + note(x, y + 7, n, { size: 20, fill: "#ffffff", weight: 700 }));
  badge(405, 378, "1"); badge(440, 500, "2"); badge(1000, 270, "3");
  const legend = [["1", "Direction: a body closes through the classic"], ["2", "Key level in the new direction, first return"], ["3", "Confirmation on the 15, 5 or 1 minute"]];
  legend.forEach(([n, s], i) => { const y = 735 + i * 46; badge(110, y, n); p.raw(note(142, y + 7, s, { size: 19, anchor: "start" })); });
  const inset = new Panel();
  const lv = 560;
  inset.level(1030, 1440, lv, { w: 2 });
  const cs = [[1060, 380, 430], [1095, 430, 470], [1130, 470, 520], [1165, 520, 552], [1200, 552, 535], [1235, 535, 566], [1270, 566, 540], [1305, 540, 548], [1340, 548, 490], [1375, 490, 430], [1410, 430, 360]];
  for (const [x, o, c] of cs) inset.candle(x, o, Math.min(o, c) - 12, Math.max(o, c) + (x === 1235 ? 22 : 12), c, 22);
  p.raw(inset.svg());
  p.raw(note(1235, 680, "the level holds on the small timeframe", { size: 17 }));
  return title(W / 2, 110, "Direction, key level, confirmation") + p.svg();
};

FIG["msnr-phases"] = () => {
  const out = [title(W / 2, 110, "The phases of getting good")];
  const node = (x, y, s) => box(x - 120, y - 34, 240, 68) + note(x, y + 7, s, { size: 19 });
  out.push(node(330, 260, "Grab partial info"), node(500, 520, "Fail"), node(160, 520, "Switch strategy"));
  for (const d of ["M400 298 L470 478", "M378 520 L284 520", "M200 480 L268 300"]) out.push(`<path d="${d}" stroke="${C.ink}" stroke-width="2.2" fill="none" marker-end="url(#arr)"/>`);
  out.push(note(330, 640, "The loop. Most people never leave it.", { size: 19, fill: "#ffffff", weight: 600 }));
  out.push(`<path d="M640 400 L790 400" stroke="${C.ink}" stroke-width="2.6" marker-end="url(#arr)"/>`);
  const stage = (y, h, d) => box(820, y, 640, 150, "rgba(20,20,20,.13)") + note(850, y + 44, h, { size: 24, anchor: "start", fill: "#ffffff", weight: 600 }) + lines(850, y + 82, d, { size: 18, anchor: "start" });
  out.push(stage(170, "Learning", ["One teacher, one method. Do what it says,", "take real notes, trust it before it makes sense."]));
  out.push(stage(340, "Experience", ["The long, hard part. Journal precisely, collect", "a lot of data, adjust carefully, be brave."]));
  out.push(stage(510, "Mastery", ["One exact process, repeated. Trading feels", "light and the account grows steadily."]));
  return out.join("\n");
};

// ---------------------------------------------------------------- render
const wrap = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${C.bg}}svg{display:block}</style></head><body>
<svg id="c" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.ink}"/></marker></defs>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${body}
<text x="${W / 2}" y="${H - 22}" font-size="20" text-anchor="middle" fill="#f4f4f4" font-family="${FONT}">@d1fpc3</text>
</svg></body></html>`;

const OUT = process.env.OUT || join(tmpdir(), "msnr-diagrams");
mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FIG);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
for (const name of want) {
  await page.setContent(wrap(FIG[name]()), { waitUntil: "load" });
  await page.locator("#c").screenshot({ path: join(OUT, `${name}.png`) });
  console.log("wrote", join(OUT, `${name}.png`));
}
await browser.close();
