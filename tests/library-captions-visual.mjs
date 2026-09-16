// Library captions (manual, not a node:test): python -m http.server 8123, then OUT=<dir> node tests/library-captions-visual.mjs
// Kicks the captions function for the smallest published library video (the row's captions_kick, same
// path the post trigger takes), waits for the row to go ready, then signs in as appreview, opens the
// video in the app and checks the CC button is there, cues loaded, and a cue paints on screen.
// Needs ASSEMBLYAI_API_KEY set on the project. Uses branded Chrome (Playwright's Chromium has no H.264).
// VIDEO=<library_videos id> picks a video; SKIP_KICK=1 reuses captions that are already ready.
import { createRequire } from "module"; import { mkdirSync, existsSync } from "fs";
const pw = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"].find(existsSync);
const { chromium, devices } = createRequire(import.meta.url)(pw);
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = process.env.SUPABASE_ACCESS_TOKEN;
const sql = async (query) => (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) })).json();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token })})).json();

// the video under test: smallest published file unless VIDEO says otherwise
const pick = process.env.VIDEO
  ? (await sql(`select id, title from public.library_videos where id = '${process.env.VIDEO}'`))[0]
  : (await sql(`select v.id, v.title from public.library_videos v join storage.objects o on o.bucket_id = 'lesson-files' and o.name = v.storage_path where v.is_published order by (o.metadata->>'size')::bigint limit 1`))[0];
console.log("video", pick.title, pick.id);
const fails = [];
if (!process.env.SKIP_KICK) {
  await sql(`select public.captions_kick('${pick.id}', 'start')`);
  const t0 = Date.now(); let row;
  while (Date.now() - t0 < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 10000));
    row = (await sql(`select captions_status, captions_error, captions_path from public.library_videos where id = '${pick.id}'`))[0];
    process.stdout.write(`  ${Math.round((Date.now() - t0) / 1000)}s ${row.captions_status ?? "null"}${row.captions_error ? " " + row.captions_error : ""}\n`);
    if (row.captions_status === "ready" || row.captions_status === "failed") break;
  }
  if (row?.captions_status !== "ready") { console.log("FAIL: captions never went ready", JSON.stringify(row)); process.exit(1); }
  const vtt = await (await fetch(`${SB}/storage/v1/object/authenticated/lesson-files/${row.captions_path}`, { headers: H })).text();
  const cues = (vtt.match(/-->/g) || []).length;
  console.log("vtt bytes", vtt.length, "cues", cues, "first:", JSON.stringify(vtt.split("\n").slice(0, 6).join(" | ")));
  if (!/^WEBVTT/.test(vtt) || cues < 3) fails.push("vtt shape: cues " + cues);
}

const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"].find(existsSync);
const b = await chromium.launch({ executablePath: exe, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  for (const [name, vp] of [["desk", { viewport: { width: 1440, height: 900 } }], ["phone", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext(vp);
    await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:8123/echelon/app/?video=${pick.id}`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("#libmodal:not([hidden]) #lib-player video", { state: "attached", timeout: 30000 });
    // metadata unhides the CC button when a track is on the element
    await p.waitForFunction(() => { const v = document.querySelector("#lib-player video"); return v && v.readyState >= 1 }, null, { timeout: 60000 });
    await p.waitForTimeout(600);
    const st = await p.evaluate(() => {
      const v = document.querySelector("#lib-player video"); const cc = document.querySelector("#lib-player .vp-right button[title='Captions']");
      const t = v.textTracks[0];
      return { tracks: v.textTracks.length, ccHidden: cc?.hidden, cors: v.crossOrigin, mode: t?.mode, cues: t?.cues?.length ?? null, src: v.querySelector("track")?.src?.slice(0, 60) };
    });
    console.log(name, "player", JSON.stringify(st));
    if (st.tracks !== 1 || st.ccHidden !== false || st.cors !== "anonymous") fails.push(name + ": track/cc " + JSON.stringify(st));
    // turn captions on, play a few seconds, catch a cue on screen
    await p.locator("#lib-player .vp-right button[title='Captions']").click();
    await p.evaluate(() => { const v = document.querySelector("#lib-player video"); v.muted = true; v.currentTime = 5; return v.play().catch(() => {}) });
    await p.waitForFunction(() => { const t = document.querySelector("#lib-player video").textTracks[0]; return t && t.mode === "showing" && (t.cues?.length ?? 0) > 0 }, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const on = await p.evaluate(() => { const t = document.querySelector("#lib-player video").textTracks[0]; const cc = document.querySelector("#lib-player .vp-right button[title='Captions']"); return { mode: t?.mode, cues: t?.cues?.length ?? 0, active: [...(t?.activeCues ?? [])].map((c) => c.text), ccOn: cc?.classList.contains("on") } });
    console.log(name, "showing", JSON.stringify(on));
    if (on.mode !== "showing" || on.cues < 3 || !on.ccOn) fails.push(name + ": showing " + JSON.stringify(on));
    if (!on.active.length) fails.push(name + ": no active cue at t=5..8s (timing?)");
    await p.screenshot({ path: `${OUT}/${name}-captions.png` });
    if (errs.length) fails.push(name + ": page errors " + errs.join(" | "));
    await ctx.close();
  }
} finally { await b.close(); }
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS");
process.exit(fails.length ? 1 : 0);
