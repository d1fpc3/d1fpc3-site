// Video protection (manual): the download hole is shut and every frame carries the viewer's name.
//   node tests/video-protect-visual.mjs   (APP_URL / OUT / W / THEME env)
//
// What it actually drives, on the real watch screen, signed in as a real member:
//   1. the <video> refuses download, picture-in-picture and remote playback
//   2. right-click on the player is swallowed, so there is no native "Save video as"
//   3. the mark is there, carries this viewer's name, and has moved on its own within 25s
//   4. tearing the mark out of the DOM stops playback instead of freeing the video
//   5. media-url signs video for five minutes, not an hour, and Supabase enforces expiry
//   6. re-signing mid-playback keeps the position and keeps playing
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "video-protect"); mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "appreview@d1fpc3.com" }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
if (!session.access_token) throw new Error("verify failed");
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };

// Playwright's own Chromium ships without H.264, so a real MP4 never decodes in
// it. Installed Chrome has the codecs; fall back only so the DOM checks still run.
let browser, engine = "chrome";
try { browser = await chromium.launch({ channel: "chrome" }) } catch { engine = "bundled chromium (no H.264: playback checks will be soft)"; browser = await chromium.launch() }
const ctx = await browser.newContext({ viewport: { width: Number(process.env.W || 1440), height: Number(process.env.HGT || 900) } });
await ctx.addInitScript(([k, v, theme]) => { localStorage.setItem(k, v); if (theme) localStorage.setItem("echelon-theme", theme); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); }, [`sb-${REF}-auth-token`, JSON.stringify(session), process.env.THEME || ""]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#td-h1", { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const go = async (v) => { await page.evaluate((v) => document.querySelector('.tab[data-view="' + v + '"]')?.click(), v); await page.waitForTimeout(2200) };
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
console.log("engine: " + engine);

// ── open a real published video on the real watch screen ──
const vids = await (await fetch(`${SB}/rest/v1/library_videos?is_published=eq.true&select=id,title,storage_path&order=created_at.desc&limit=1`, { headers: H })).json();
const vid = vids[0];
if (!vid) throw new Error("no published library video to test against");
ok(true, "testing against a published video: " + vid.title);
await go("library"); await page.waitForTimeout(1200);
await page.locator(".lib-card", { hasText: vid.title }).first().click();
await page.waitForSelector(".vp video", { timeout: 20000 });
await page.waitForTimeout(2500);
await shot("01-watch");

// ── 1. the element refuses the easy exits ──
const attrs = await page.evaluate(() => { const v = document.querySelector(".vp video"); return { cl: v.controlsList ? [...v.controlsList].join(" ") : "", pip: v.disablePictureInPicture, rp: v.disableRemotePlayback } });
ok(/nodownload/.test(attrs.cl), "controlsList blocks download: '" + attrs.cl + "'");
ok(attrs.pip === true, "picture-in-picture is off");
ok(attrs.rp === true, "remote playback (cast) is off");

// ── 2. right-click is swallowed on every layer of the player ──
const menus = await page.evaluate(() => {
  const out = {};
  for (const sel of [".vp video", ".vp .vp-tap", ".vp"]) {
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector(sel).dispatchEvent(e);
    out[sel] = e.defaultPrevented;
  }
  return out;
});
ok(menus[".vp video"] && menus[".vp .vp-tap"] && menus[".vp"], "right-click is prevented on the video, the tap layer and the frame: " + JSON.stringify(menus));

// ── 3. the mark names this viewer, and moves on its own ──
const prof = (await (await fetch(`${SB}/rest/v1/profiles?user_id=eq.${session.user.id}&select=username`, { headers: H })).json())[0];
const me = { u: prof?.username, e: session.user.email, id: session.user.id };
const mark = await page.evaluate(() => { const t = document.querySelector(".vp .vp-wm-t"); return t ? t.textContent : null });
ok(!!mark, "the mark is on the video: '" + mark + "'");
const expectWho = me.u || (me.e || "").split("@")[0];
ok(!!mark && mark.includes(expectWho), "it carries this viewer's name (" + expectWho + ")");
const expectTag = (me.id || "").replace(/-/g, "").slice(-6);
ok(!!mark && mark.includes(expectTag), "it carries this viewer's id tag (" + expectTag + ")");
const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".vp .vp-wm")).opacity));
ok(opacity > 0.05 && opacity < 0.4, "it is quiet but visible: opacity " + opacity);
const pos1 = await page.evaluate(() => { const w = document.querySelector(".vp .vp-wm"); return w.style.left + "," + w.style.top });
console.log("     waiting 23s for the mark to drift...");
await page.waitForTimeout(23000);
const pos2 = await page.evaluate(() => { const w = document.querySelector(".vp .vp-wm"); return w.style.left + "," + w.style.top });
ok(pos1 !== pos2, "it drifted on its own: " + pos1 + " -> " + pos2);
await shot("02-mark-drifted");

// ── 6. re-signing mid-playback (before the tamper test kills the player) ──
if (engine === "chrome") {
  await page.evaluate(() => { const v = document.querySelector(".vp video"); v.muted = true; return v.play().catch(() => {}) });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => { const v = document.querySelector(".vp video"); return { t: v.currentTime, playing: !v.paused, src: v.src } });
  ok(before.playing && before.t > 0, "the video is actually playing: t=" + before.t.toFixed(2));
  const swapped = await page.evaluate(async () => { const v = document.querySelector(".vp video"); if (!v.__resign) return "no resign hook"; await v.__resign(); return "done" });
  ok(swapped === "done", "the player exposes a re-sign path: " + swapped);
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => { const v = document.querySelector(".vp video"); return { t: v.currentTime, playing: !v.paused, src: v.src } });
  ok(after.src !== before.src, "it swapped in a freshly signed URL");
  ok(Math.abs(after.t - before.t) < 6, "it kept the position across the swap: " + before.t.toFixed(2) + " -> " + after.t.toFixed(2));
  ok(after.playing, "it was still playing after the swap");
} else {
  console.log("skip  playback checks: this browser has no H.264");
}

// ── 6b. the real thing: sit past the signature's own death and then seek ──
// Only forced by SLOW=1, because there is no honest way to do it in under six
// minutes. Nothing else proves the error/seeking path ever fires on its own.
if (process.env.SLOW === "1" && engine === "chrome") {
  console.log("     SLOW: playing past the five minute signature, ~5.5 min...");
  const src0 = await page.evaluate(() => document.querySelector(".vp video").src);
  await page.evaluate(() => { const v = document.querySelector(".vp video"); v.muted = true; v.currentTime = 0; return v.play().catch(() => {}) });
  await page.waitForTimeout(315000);
  const dead = await fetch(src0, { method: "HEAD" });
  ok(!dead.ok, "the URL it started with is genuinely dead by now: " + dead.status);
  await page.evaluate(() => { const v = document.querySelector(".vp video"); v.currentTime = Math.max(0, v.duration - 20) });
  await page.waitForTimeout(8000);
  const rec = await page.evaluate(() => { const v = document.querySelector(".vp video"); return { src: v.src, t: v.currentTime, playing: !v.paused, err: v.error?.code || 0 } });
  ok(rec.src !== src0, "seeking after expiry swapped in a new signature on its own");
  ok(!rec.err && rec.t > 0, "playback survived: t=" + rec.t.toFixed(1) + " err=" + rec.err);
  ok(rec.playing, "and it is still playing");
  await shot("04-survived-expiry");
}

// ── 4. tearing the mark out stops the video ──
await page.evaluate(() => document.querySelector(".vp .vp-wm").remove());
await page.waitForTimeout(2500);
const tripped = await page.evaluate(() => { const v = document.querySelector(".vp video"); return { paused: v.paused, stop: !!document.querySelector(".vp .vp-stop"), says: document.querySelector(".vp .vp-stop strong")?.textContent } });
ok(tripped.paused, "deleting the mark pauses the video");
ok(tripped.stop, "and puts a notice over the player: " + tripped.says);
await shot("03-tampered");

// hiding it counts too, on a fresh player
await page.click("#lib-x"); await page.waitForTimeout(800);
await page.locator(".lib-card", { hasText: vid.title }).first().click();
await page.waitForSelector(".vp .vp-wm", { timeout: 20000 }); await page.waitForTimeout(2000);
await page.evaluate(() => { document.querySelector(".vp .vp-wm").style.opacity = "0" });
await page.waitForTimeout(2500);
ok(await page.locator(".vp .vp-stop").count() === 1, "fading it to nothing stops playback the same way");

// ── 5. the signature is short, and expiry is real ──
const signed = await (await fetch(`${SB}/functions/v1/media-url`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", origin: "https://d1fpc3.com" }, body: JSON.stringify({ library_id: vid.id }) })).json();
ok(signed.expires_in === 300, "media-url signs video for five minutes: expires_in=" + signed.expires_in);
ok(await (await fetch(signed.url, { method: "HEAD" })).ok, "the fresh signed URL plays");
const shortLived = await (await fetch(`${SB}/storage/v1/object/sign/lesson-files/${encodeURI(vid.storage_path)}`, { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 1 }) })).json();
await new Promise((r) => setTimeout(r, 2500));
const dead = await fetch(`${SB}/storage/v1${shortLived.signedURL}`, { method: "HEAD" });
ok(!dead.ok && dead.status >= 400, "an expired signature is refused by storage, not just by us: " + dead.status);

await browser.close();
console.log(fails.length ? "\n" + fails.length + " FAILED:\n" + fails.map((f) => " - " + f).join("\n") : "\nall checks passed");
console.log("shots: " + OUT);
process.exit(fails.length ? 1 : 0);
