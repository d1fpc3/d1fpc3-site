// Edit profile + member card follow state (manual, not a node:test). D1, 2026-09-27: "make the edit ur profile
// flow a lot lot better" and "when i click on someone's profile it glitches and says follow for a second".
//   1. from the repo root:  python -m http.server 8123
//   2. node tests/app-profile-edit-visual.mjs        (APP_URL / OUT env)
// Mints a throwaway member (@d1fpc3.test), and on 1440, 2560 and an iPhone (WebKit):
//   the pencil opens one sheet (Cancel, Edit profile, Save); Save is off until something changes; a taken name
//   says so and blocks Save; a free one says it is free; the bio counts down and grows; a new photo is placed in
//   the round window, staged, and only uploads with Save; Save writes username, bio and photo in one go and the
//   profile page shows them; Remove photo clears it; Cancel with edits asks first; Esc and Ctrl+Enter work.
// Then the member card: the throwaway follows @d1fpc3, and opening that card must never show "Follow", not even
// for a frame (a MutationObserver records every label the button ever carries).
// Sweeps the member, its follow, its profile and its photo at the end, and any @d1fpc3.test leftovers first.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = ["C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright", "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright"];
const { chromium, webkit, devices } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || join(tmpdir(), "app-profile-edit"); mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL || "http://127.0.0.1:8123/echelon/app/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const HS = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
// leftovers first: a run that crashed must never leave fake members in the real Members list
{ const r = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=500`, { headers: HS })).json();
  for (const u of r.users || []) if (/@d1fpc3.test$/.test(u.email || "") && Date.now() - new Date(u.created_at).getTime() > 5 * 60000) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: HS });
  await fetch(`${SB}/rest/v1/entitlements?email=like.*@d1fpc3.test&user_id=is.null`, { method: "DELETE", headers: HS }); }

const fails = []; const ok = (c, w) => { console.log((c ? "  ok   " : "  FAIL ") + w); if (!c) fails.push(w) };
const stamp = Date.now().toString(36);
const email = `harness-pfe-${stamp}@d1fpc3.test`;
const created = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: HS, body: JSON.stringify({ email, email_confirm: true }) })).json();
const uid = created.id; if (!uid) throw new Error("could not mint the member " + JSON.stringify(created));
// a comp membership, the way the other harnesses let a throwaway past the gate
await fetch(`${SB}/rest/v1/entitlements`, { method: "POST", headers: HS, body: JSON.stringify({ user_id: uid, email, status: "active", source: "comp", product: "course", interval: "one_time" }) });
const sessionFor = async () => { const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: HS, body: JSON.stringify({ type: "magiclink", email }) })).json(); return (await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json()) };
const d1 = (await (await fetch(`${SB}/rest/v1/profiles?username=eq.d1fpc3&select=user_id,username`, { headers: HS })).json())[0];
const profile = async () => (await (await fetch(`${SB}/rest/v1/profiles?user_id=eq.${uid}&select=username,bio,avatar_url`, { headers: HS })).json())[0];

const VP = {
  desk: [chromium, { viewport: { width: 1440, height: 900 } }],
  wide: [chromium, { viewport: { width: 2560, height: 1300 } }],
  iphone: [webkit, { ...devices["iPhone 13"] }],
};
async function open(name) {
  const [eng, dev] = VP[name]; const b = await eng.launch(); const ctx = await b.newContext(dev)
  const sess = await sessionFor()
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-onb-done", "1") }, [`sb-${REF}-auth-token`, JSON.stringify(sess)])
  const page = await ctx.newPage(); page.on("pageerror", (e) => fails.push(`${name} pageerror: ${e.message}`))
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#td-h1", { timeout: 30000 }).catch(async () => { await page.screenshot({ path: `${OUT}/${name}-boot.png` }); console.log("  boot views:", await page.evaluate(() => [...document.querySelectorAll(".view.on, [id$='gate']:not([hidden]), .onb:not([hidden])")].map((v) => v.id))) })
  await page.waitForTimeout(2000)
  await page.evaluate(() => { const o = document.getElementById("onb"); if (o && !o.hidden) { o.hidden = true; document.body.classList.remove("onb-open") } })
  return { b, ctx, page }
}
const goProfile = (page) => page.evaluate(() => (document.querySelector('.tab[data-view="set-profile"]') || document.querySelector('[data-view="set-profile"]'))?.click())
const st = (page) => page.evaluate(() => ({ open: !document.getElementById("pfe").hidden, save: !document.getElementById("pfe-save").disabled, help: document.getElementById("pfe-user-help").textContent, helpC: document.getElementById("pfe-user-help").className, count: document.getElementById("pfe-bio-count").textContent, pv: document.getElementById("pfe-pv-name").textContent, pvBio: document.getElementById("pfe-pv-bio").textContent, img: !!document.querySelector("#pfe-av-img img"), crop: !document.getElementById("pfe-crop").hidden, rm: !document.getElementById("pfe-rmphoto").hidden }))

// a real picture to upload: a gradient screenshot
const pic = await (async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 600 } }); await p.setContent('<body style="margin:0;height:100vh;background:radial-gradient(circle at 30% 40%, #f5d27a, #a8842c 45%, #1a1207)"><div style="position:absolute;left:380px;top:230px;width:140px;height:140px;border-radius:50%;background:#0b0a09"></div></body>'); const buf = await p.screenshot(); await b.close(); return buf })()

try {
  for (const name of ["desk", "wide", "iphone"]) {
    console.log(`\n${name}`)
    const { b, page } = await open(name)
    await goProfile(page); await page.waitForTimeout(1500)
    const before = await profile()
    await page.evaluate(() => document.getElementById("pro-edit").click()); await page.waitForTimeout(700)
    let s = await st(page)
    ok(s.open && !s.save, `the pencil opens the sheet, Save off until something changes (${before.username})`)
    ok(s.pv === "@" + before.username, `the live card shows you: ${s.pv}`)
    await page.screenshot({ path: `${OUT}/${name}-1-open.png` })
    // a taken name
    await page.fill("#pfe-user", "d1fpc3"); await page.waitForTimeout(250)
    s = await st(page)
    ok(/@d1fpc3 is taken\./.test(s.help) && /bad/.test(s.helpC) && !s.save, `a taken name says so and blocks Save: "${s.help}"`)
    await page.screenshot({ path: `${OUT}/${name}-2-taken.png` })
    const fresh = `pfe_${stamp}`.slice(0, 20)
    await page.fill("#pfe-user", fresh); await page.waitForTimeout(250)
    s = await st(page)
    ok(new RegExp(`@${fresh} is free`).test(s.help) && /ok/.test(s.helpC) && s.save && s.pv === "@" + fresh, `a free name says so, Save lights up, the card follows: "${s.help}"`)
    await page.fill("#pfe-bio", "Harness bio. NQ, London open, LIT."); await page.waitForTimeout(200)
    s = await st(page)
    ok(/^\d+ left$/.test(s.count) && s.pvBio.startsWith("Harness bio"), `bio counts down (${s.count}) and the card shows it`)
    // a photo, placed and staged
    await page.setInputFiles("#pfe-file", { name: "me.png", mimeType: "image/png", buffer: pic }); await page.waitForTimeout(900)
    s = await st(page); ok(s.crop, "a new photo opens the round cropper")
    await page.screenshot({ path: `${OUT}/${name}-3-crop.png` })
    const vp = await page.locator("#pfe-crop-vp").boundingBox()
    await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2); await page.mouse.down(); await page.mouse.move(vp.x + vp.width / 2 + 40, vp.y + vp.height / 2 + 10, { steps: 6 }); await page.mouse.up()
    await page.evaluate(() => { const z = document.getElementById("pfe-zoom"); z.value = "1.6"; z.dispatchEvent(new Event("input")) })
    await page.click("#pfe-crop-use"); await page.waitForTimeout(700)
    s = await st(page)
    const db0 = await profile()
    ok(!s.crop && s.img && s.rm && db0.avatar_url === before.avatar_url, "Use photo stages it in the avatar; nothing uploads before Save")
    await page.screenshot({ path: `${OUT}/${name}-4-staged.png` })
    // save with the keyboard on desktops, the button on the phone
    if (name === "iphone") await page.tap("#pfe-save"); else { await page.focus("#pfe-bio"); await page.keyboard.press("Control+Enter") }
    await page.waitForFunction(() => document.getElementById("pfe").hidden, null, { timeout: 15000 }).catch(() => {})
    const db1 = await profile()
    ok(db1.username === fresh && db1.bio === "Harness bio. NQ, London open, LIT." && /avatars\/.+avatar\.jpg\?v=\d+/.test(db1.avatar_url || ""), `Save wrote username, bio and photo in one go (${db1.username})`)
    const page1 = await page.evaluate(() => ({ name: document.getElementById("pro-name").textContent, bio: document.getElementById("pro-bio").textContent, img: !!document.querySelector("#pro-av img"), side: document.getElementById("u-name")?.textContent }))
    ok(page1.name.startsWith("@" + fresh) && page1.bio.startsWith("Harness bio") && page1.img, `the profile page shows them at once: ${JSON.stringify(page1)}`)
    await page.screenshot({ path: `${OUT}/${name}-5-saved.png` })
    // remove the photo, cancel asks first, then save the removal and put the name back
    await page.evaluate(() => document.getElementById("pro-edit").click()); await page.waitForTimeout(600)
    await page.click("#pfe-rmphoto"); await page.waitForTimeout(200)
    s = await st(page); ok(!s.img && s.save, "Remove photo shows your initials and lights Save")
    await page.click("#pfe-cancel"); await page.waitForTimeout(500)
    const ask = await page.evaluate(() => document.body.textContent.includes("Discard changes?"))
    ok(ask, "Cancel with edits asks before throwing them away")
    await page.getByRole("button", { name: "Keep editing" }).click().catch(() => {}); await page.waitForTimeout(400)
    await page.fill("#pfe-user", before.username); await page.fill("#pfe-bio", ""); await page.waitForTimeout(150)
    await page.click("#pfe-save"); await page.waitForFunction(() => document.getElementById("pfe").hidden, null, { timeout: 15000 }).catch(() => {})
    const db2 = await profile()
    ok(db2.username === before.username && db2.avatar_url == null && db2.bio == null, `the removal saved and the name went back (${db2.username}, photo ${db2.avatar_url})`)
    // Esc closes a clean sheet
    if (name !== "iphone") { await page.evaluate(() => document.getElementById("pro-edit").click()); await page.waitForTimeout(500); await page.keyboard.press("Escape"); await page.waitForTimeout(600); ok(await page.evaluate(() => document.getElementById("pfe").hidden), "Esc closes a clean sheet") }
    await b.close()
  }

  // the member card: follow state is right from the first frame
  console.log("\nmember card")
  await fetch(`${SB}/rest/v1/follows`, { method: "POST", headers: { ...HS, Prefer: "return=minimal" }, body: JSON.stringify({ follower_id: uid, followee_id: d1.user_id }) })
  for (const name of ["desk", "iphone"]) {
    const { b, page } = await open(name)
    await page.waitForTimeout(1500)
    await page.evaluate(() => { window.__fbSeen = []; const fb = document.getElementById("mm-followbtn"); new MutationObserver(() => window.__fbSeen.push(fb.classList.contains("pending") ? "(pending)" : fb.textContent)).observe(fb, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] }) })
    // open @d1fpc3 the way a tap on the Members list does
    await page.evaluate((u) => { const m = (window.__state?.members || []).find((x) => x.user_id === u); const card = document.querySelector(`#member-grid .mcard[data-uid="${u}"]`); if (card) card.click(); else throw new Error("no card") }, d1.user_id).catch(async () => { await page.evaluate(() => document.querySelector('.tab[data-view="members"]')?.click()); await page.waitForTimeout(1500); await page.locator(`#member-grid .mcard[data-uid="${d1.user_id}"]`).click() })
    const first = await page.evaluate(() => { const fb = document.getElementById("mm-followbtn"); return fb.classList.contains("pending") ? "(pending)" : fb.textContent })
    await page.waitForTimeout(2000)
    const seen = await page.evaluate(() => window.__fbSeen)
    const last = await page.evaluate(() => document.getElementById("mm-followbtn").textContent)
    ok(first === "Following" && last === "Following" && !seen.includes("Follow"), `${name}: the button reads Following from the first frame (first "${first}", every label ${JSON.stringify([...new Set(seen)])})`)
    await page.screenshot({ path: `${OUT}/${name}-card.png` })
    await b.close()
  }
} finally {
  await fetch(`${SB}/rest/v1/follows?follower_id=eq.${uid}`, { method: "DELETE", headers: HS })
  await fetch(`${SB}/rest/v1/entitlements?user_id=eq.${uid}`, { method: "DELETE", headers: HS })
  await fetch(`${SB}/storage/v1/object/avatars/${uid}/avatar.jpg`, { method: "DELETE", headers: HS }).catch(() => {})
  await fetch(`${SB}/rest/v1/profiles?user_id=eq.${uid}`, { method: "DELETE", headers: HS })
  const del = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: HS })
  console.log(`\nswept the throwaway member (${del.status})`)
}
console.log(`screenshots: ${OUT}`)
if (fails.length) { console.log(`\n${fails.length} FAILED:\n - ` + fails.join("\n - ")); process.exit(1) }
console.log("\nALL OK")
