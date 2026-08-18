// Visual harness for Echelon lesson block rendering (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/lesson-render-visual.mjs        (APP_URL / OUT / SLUG env to override)
// Loads /echelon/app/, bypasses the login gate in-page, pulls renderProse +
// inlineText out of the page's own module source (they only touch `document`),
// and renders every lesson from Projects/echelon/content/lit-course.mjs into
// #lesson with the real app CSS. Screenshots each lesson to OUT and fails on
// page errors, unrendered markdown markers, or empty output.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { pathToFileURL } from "url";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/lesson-render-shots`;
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const ONLY = process.env.SLUG || "";

const { course } = await import(pathToFileURL("C:/Users/Deb/Desktop/Projects/echelon/content/lit-course.mjs").href);
const src = readFileSync(new URL("../echelon/app/index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const fnSrc = (name) => {
  const m = src.match(new RegExp(`\\n    function ${name}\\([\\s\\S]*?\\n    }\\n`));
  if (!m) throw new Error(`could not extract ${name} from app source`);
  return m[0];
};
const renderSrc = fnSrc("inlineText") + fnSrc("renderProse");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/supabase|esm\.sh|discord/.test(m.text())) errors.push("console: " + m.text()); });

await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.evaluate((renderSrc) => {
  document.getElementById("gate").style.display = "none";
  document.getElementById("app").classList.add("on");
  document.documentElement.setAttribute("data-theme", "dark");
  // show the Course view
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
  document.getElementById("v-course").classList.add("on");
  // eslint-disable-next-line no-new-func
  window.__render = new Function("host", "lesson", renderSrc + `
    host.textContent = ''
    const kind = document.createElement('p'); kind.className = 'label lesson-kind'; kind.textContent = 'Written'; host.appendChild(kind)
    const h = document.createElement('h1'); h.className = 'lesson-h'; h.textContent = lesson.title; host.appendChild(h)
    if (lesson.summary) { const s = document.createElement('p'); s.className = 'lesson-sum'; s.textContent = lesson.summary; host.appendChild(s) }
    for (const b of lesson.blocks) {
      if (b.type === 'heading' && b.text) { const w = document.createElement('div'); w.className = 'prose'; const h2 = document.createElement('h2'); h2.textContent = b.text; w.appendChild(h2); host.appendChild(w) }
      else if (b.type === 'text' && b.md) { const p = document.createElement('div'); p.className = 'prose'; renderProse(p, b.md); host.appendChild(p) }
    }
  `);
}, renderSrc);

let n = 0, bad = 0;
for (const m of course) {
  for (const l of m.lessons) {
    if (ONLY && l.slug !== ONLY) continue;
    const stats = await page.evaluate((lesson) => {
      const host = document.getElementById("lesson");
      window.__render(host, lesson);
      const text = host.innerText;
      return {
        h2: host.querySelectorAll(".prose h2").length,
        p: host.querySelectorAll(".prose p").length,
        li: host.querySelectorAll(".prose li").length,
        strong: host.querySelectorAll(".prose strong").length,
        quote: host.querySelectorAll(".prose blockquote").length,
        // "1. " at a line start is legit (bold numbered paragraphs); the rest are unrendered markers
        leftoverMd: (text.match(/(^|\n)\s*(##|- |> )|\*\*/g) || []).length,
        chars: text.length,
        rows: host.querySelectorAll(".prose > *").length,
      };
    }, l);
    n++;
    const ok = stats.p > 0 && stats.leftoverMd === 0 && stats.chars > 500;
    if (!ok) bad++;
    console.log(`${ok ? "ok " : "BAD"} ${m.slug}/${l.slug}  h2=${stats.h2} p=${stats.p} li=${stats.li} b=${stats.strong} q=${stats.quote} leftover=${stats.leftoverMd} chars=${stats.chars}`);
    await page.screenshot({ path: `${OUT}/${m.position ?? 0}-${l.slug}.png`, fullPage: true });
  }
}
await browser.close();
console.log(`\n${n} lessons rendered, ${bad} bad, shots in ${OUT}`);
if (errors.length) { console.log("errors:\n  " + errors.join("\n  ")); process.exit(1); }
if (bad) process.exit(1);
