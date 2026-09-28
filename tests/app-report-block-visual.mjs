// Report + block (App Review 1.2) and the iOS sign-in (4.8), end to end against the live Echelon project.
// Manual, not a node:test: python -m http.server 8123 (repo root), then OUT=<dir> node tests/app-report-block-visual.mjs
// Signs in as appreview@d1fpc3.com. Reports a real chat message (row + admin bell note appear), blocks its
// author from the member card (their messages leave the log, a user_blocks row exists), unblocks from the
// directory (they come back), checks the post menu, then proves the server refuses a DM from a blocked
// member inside a rolled-back transaction. Everything it writes is deleted at the end.
// PLAYWRIGHT_DIR overrides where playwright is loaded from; the Supabase token comes from
// SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token.
import { createRequire } from "module"; import { readFileSync, mkdirSync, existsSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const PW = process.env.PLAYWRIGHT_DIR || ["C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright", "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright"].find((p) => existsSync(p));
const { chromium, webkit, devices } = createRequire(import.meta.url)(PW);
const OUT = process.env.OUT || "tests/out-report-block"; mkdirSync(OUT, { recursive: true });
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`, APP = "http://127.0.0.1:8123/echelon/app/";
const tokFile = join(homedir(), ".supabase", "access-token");
const mgmt = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(tokFile) ? readFileSync(tokFile, "utf8").trim() : "");
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j };
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const EMAIL = "appreview@d1fpc3.com";
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email: EMAIL }) })).json();
const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
const ME = session.user.id;
const t0 = new Date().toISOString();
const fails = [], ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!cond) fails.push(name) };
const prep = (k, v) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-splash-day", new Date().toDateString()); localStorage.setItem("echelon-theme", "dark"); for (const id of ["ig", "dc", "bt"]) localStorage.setItem("echelon-promo-until:" + id, String(Date.now() + 864e5)) };
const IOS_STUB = "window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }";
const cleanup = async () => {
  await sql(`delete from content_reports where reporter = '${ME}'; delete from user_blocks where blocker = '${ME}'; delete from notifications where kind = 'system' and body like 'New report:%' and created_at >= '${t0}';`)
}
const cb = await chromium.launch(); const wb = await webkit.launch()
try {
  await cleanup()
  // ── 1. sign-in screen: Discord on the web, not in the iOS shell ──
  for (const [label, stub] of [["web", ""], ["ios", IOS_STUB]]) {
    const ctx = await wb.newContext({ ...devices["iPhone 13"] })
    await ctx.addInitScript((s) => { localStorage.setItem("echelon-splash-day", new Date().toDateString()); if (s) new Function(s)() }, stub)
    const p = await ctx.newPage()
    await p.goto(APP, { waitUntil: "domcontentloaded" })
    await p.waitForSelector("#signin-email", { timeout: 30000 })
    const hasDiscord = await p.evaluate(() => [...document.querySelectorAll("#gate-actions button")].some((b) => /Discord/.test(b.textContent)))
    ok(`sign-in ${label}: Discord ${label === "ios" ? "hidden" : "shown"}`, label === "ios" ? !hasDiscord : hasDiscord)
    if (label === "ios") await p.screenshot({ path: `${OUT}/0-ios-signin.png` })
    await ctx.close()
  }

  // ── 2. report a chat message (desktop, hover reveals the actions) ──
  const ctx = await cb.newContext({ viewport: { width: 1360, height: 900 } })
  await ctx.addInitScript(([k, v, f]) => { new Function("k", "v", f)(k, v) }, [`sb-${REF}-auth-token`, JSON.stringify(session), `(${prep.toString()})(k, v)`])
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message))
  await p.goto(APP, { waitUntil: "domcontentloaded" })
  await p.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 })
  await p.waitForTimeout(1200)
  await p.evaluate(() => document.querySelector('.tab[data-view="chat"]').click())
  await p.waitForSelector("#chat-log .msg[data-uid]", { timeout: 20000 })
  const target = await p.evaluate((me) => { const r = [...document.querySelectorAll("#chat-log .msg[data-uid]")].reverse().find((x) => x.dataset.uid !== me); return r ? { uid: r.dataset.uid, mid: r.dataset.mid, name: r.querySelector(".m-name")?.textContent } : null }, ME)
  ok("a message by another member is on screen", !!target, JSON.stringify(target))
  if (!target) throw new Error("no target message")
  const row = p.locator(`#chat-log .msg[data-mid="${target.mid}"]`)
  await row.hover(); await p.waitForTimeout(250)
  ok("own messages carry no Report", (await p.locator(`#chat-log .msg[data-uid="${ME}"] .m-flag`).count()) === 0)
  await row.locator(".m-flag").click()
  await p.waitForSelector("#cfmodal:not([hidden]) .cf-choice", { timeout: 5000 })
  const dlg = await p.evaluate(() => ({ title: document.getElementById("cf-title").textContent, n: document.querySelectorAll(".cf-choice").length, yesDisabled: document.getElementById("cf-yes").disabled, noteShown: !document.getElementById("cf-text").hidden }))
  ok("report dialog: title, four reasons, Send locked until a pick, optional note", /Report this message/.test(dlg.title) && dlg.n === 4 && dlg.yesDisabled && dlg.noteShown, JSON.stringify(dlg))
  await p.locator(".cf-choice").nth(2).click()
  ok("picking a reason unlocks Send", !(await p.locator("#cf-yes").isDisabled()))
  await p.fill("#cf-text", "harness: automated check, safe to ignore")
  await p.screenshot({ path: `${OUT}/1-report-dialog-desktop.png` })
  await p.click("#cf-yes"); await p.waitForTimeout(1500)
  const toast1 = await p.evaluate(() => document.getElementById("co-toast")?.textContent)
  ok("toast confirms the report", /Report sent/.test(toast1 || ""), toast1)
  const rep = await sql(`select kind, target_id, target_user, reason, note from content_reports where reporter = '${ME}'`)
  ok("content_reports row written", rep.length === 1 && rep[0].kind === "message" && rep[0].target_id === target.mid && rep[0].target_user === target.uid && rep[0].reason === "spam", JSON.stringify(rep))
  const bell = await sql(`select count(*)::int n from notifications where kind = 'system' and body like 'New report: a chat message%' and created_at >= '${t0}'`)
  ok("every admin got a bell note", bell[0].n >= 1, JSON.stringify(bell))

  // ── 3. block from the member card: their messages leave the log ──
  await p.locator(`#chat-log .msg[data-uid="${target.uid}"] .m-name`).last().click()
  await p.waitForSelector("#mm-scrim.on #mm-safety:not([hidden])", { timeout: 5000 })
  ok("member card shows Report and Block", (await p.textContent("#mm-report")) === "Report" && (await p.textContent("#mm-block")) === "Block")
  await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/2-member-card-desktop.png` })
  await p.click("#mm-block")
  await p.waitForSelector("#cfmodal:not([hidden])", { timeout: 5000 })
  ok("block asks first", /Block @/.test(await p.textContent("#cf-title")))
  await p.click("#cf-yes"); await p.waitForTimeout(1500)
  const gone = await p.evaluate((uid) => document.querySelectorAll(`#chat-log .msg[data-uid="${uid}"]`).length, target.uid)
  ok("blocked member's messages are gone from the log", gone === 0, `left: ${gone}`)
  const blk = await sql(`select blocked from user_blocks where blocker = '${ME}'`)
  ok("user_blocks row written", blk.length === 1 && blk[0].blocked === target.uid, JSON.stringify(blk))
  ok("the member card closed", !(await p.evaluate(() => document.getElementById("mm-scrim").classList.contains("on"))))

  // ── 4. survives a reload, then unblock from the directory brings them back ──
  await p.reload({ waitUntil: "domcontentloaded" })
  await p.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 })
  await p.evaluate(() => document.querySelector('.tab[data-view="chat"]').click())
  await p.waitForSelector("#chat-log .msg", { timeout: 20000 }).catch(async (e) => { await p.screenshot({ path: `${OUT}/debug-reload-chat.png` }); console.log("debug", await p.evaluate(() => ({ view: document.querySelector(".tab.on")?.dataset.view, log: document.getElementById("chat-log")?.innerHTML.slice(0, 300), cur: document.getElementById("chat")?.className }))); throw e })
  await p.waitForTimeout(800)
  ok("still hidden after a reload", (await p.evaluate((uid) => document.querySelectorAll(`#chat-log .msg[data-uid="${uid}"]`).length, target.uid)) === 0)
  await p.evaluate(() => document.querySelector('.tab[data-view="members"]').click())
  await p.waitForSelector(`#member-grid .mcard[data-uid="${target.uid}"]`, { timeout: 15000 })
  await p.click(`#member-grid .mcard[data-uid="${target.uid}"]`)
  await p.waitForSelector("#mm-scrim.on", { timeout: 5000 }); await p.waitForTimeout(400)
  ok("card of a blocked member says Unblock and hides Message", (await p.textContent("#mm-block")) === "Unblock" && (await p.evaluate(() => document.getElementById("mm-msg").style.display === "none")))
  await p.click("#mm-block"); await p.waitForTimeout(1200)
  ok("unblock flips the card back", (await p.textContent("#mm-block")) === "Block")
  ok("user_blocks row removed", (await sql(`select count(*)::int n from user_blocks where blocker = '${ME}'`))[0].n === 0)
  await p.evaluate(() => { document.getElementById("mm-x").click() }); await p.waitForTimeout(400)
  await p.evaluate(() => document.querySelector('.tab[data-view="chat"]').click()); await p.waitForTimeout(1500)
  ok("their messages are back", (await p.evaluate((uid) => document.querySelectorAll(`#chat-log .msg[data-uid="${uid}"]`).length, target.uid)) > 0)

  // ── 5. feed: anyone else's post has Report post + Block in its menu ──
  await p.evaluate(() => document.querySelector('.tab[data-view="feed"]').click())
  await p.waitForSelector("#feed .rv-post", { timeout: 20000 }); await p.waitForTimeout(800)
  const postId = await p.evaluate((me) => { const all = [...document.querySelectorAll("#feed .rv-post")]; for (const post of all) { const b = post.querySelector(".rv-menu-btn"); if (b) return post.dataset.id } return null }, ME)
  ok("posts carry a menu", !!postId)
  if (postId) {
    await p.click(`#feed .rv-post[data-id="${postId}"] .rv-menu-btn`); await p.waitForTimeout(300)
    const items = await p.evaluate((id) => [...document.querySelectorAll(`#feed .rv-post[data-id="${id}"] .rv-menu button`)].map((b) => b.textContent), postId)
    ok("post menu offers Report post and Block (or Edit/Delete on your own)", items.includes("Report post") ? items.some((t) => /^Block @/.test(t)) : items.includes("Edit"), JSON.stringify(items))
  }
  if (errs.length) ok("no page errors", false, errs.join(" | "))
  await ctx.close()

  // ── 6. phone look (WebKit, the iOS engine): report dialog + member card ──
  const pctx = await wb.newContext({ ...devices["iPhone 13"] })
  await pctx.addInitScript(([k, v, f, s]) => { new Function("k", "v", f)(k, v); new Function(s)() }, [`sb-${REF}-auth-token`, JSON.stringify(session), `(${prep.toString()})(k, v)`, IOS_STUB])
  const pp = await pctx.newPage()
  await pp.goto(APP, { waitUntil: "domcontentloaded" })
  await pp.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 })
  await pp.waitForTimeout(1200)
  await pp.evaluate(() => document.querySelector('.tab[data-view="members"]').click())
  await pp.waitForSelector(`#member-grid .mcard[data-uid="${target.uid}"]`, { timeout: 15000 })
  await pp.click(`#member-grid .mcard[data-uid="${target.uid}"]`); await pp.waitForTimeout(900)
  await pp.screenshot({ path: `${OUT}/3-member-card-phone.png` })
  await pp.click("#mm-report"); await pp.waitForSelector("#cfmodal:not([hidden]) .cf-choice"); await pp.locator(".cf-choice").first().click(); await pp.waitForTimeout(400)
  await pp.screenshot({ path: `${OUT}/4-report-dialog-phone.png` })
  await pp.click("#cf-no")
  await pctx.close()

  // ── 7. server: a blocked member cannot write in the DM (rolled back, nothing persists) ──
  const other = target.uid
  const lo = ME < other ? ME : other, hi = ME < other ? other : ME
  // One DO block: send once unblocked (must land), block, send again (must be refused), then raise so the
  // whole transaction rolls back and the result rides out in the error text.
  const r7 = await sql(`
    do $$ declare d uuid; before text := 'ok'; after text := 'ok'; flag boolean; begin
      insert into dm_threads (user_lo, user_hi) values ('${lo}', '${hi}') on conflict do nothing;
      select id into d from dm_threads where user_lo = '${lo}' and user_hi = '${hi}';
      perform set_config('request.jwt.claims', json_build_object('sub', '${ME}', 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin insert into messages (dm_id, user_id, body) values (d, '${ME}', 'harness'); exception when others then before := sqlerrm; end;
      execute 'reset role';
      insert into user_blocks (blocker, blocked) values ('${other}', '${ME}');
      execute 'set local role authenticated';
      flag := public.dm_blocked(d);
      begin insert into messages (dm_id, user_id, body) values (d, '${ME}', 'harness'); exception when others then after := sqlerrm; end;
      raise exception 'HARNESS_RESULT before=% after=% flag=%', before, after, flag;
    end $$;
  `).then(() => "no result").catch((e) => e.message)
  const res = String(r7).match(/HARNESS_RESULT before=(.*?) after=(.*?) flag=(\w+)/)
  ok("unblocked, the DM send goes through", res?.[1] === "ok", res?.[1] ?? r7)
  ok("blocked, the server refuses the DM", /row-level security/i.test(res?.[2] || "") && /^t(rue)?$/.test(res?.[3] || ""), res ? `${res[2]} flag=${res[3]}` : r7)
} finally {
  await cb.close(); await wb.close()
  await cleanup()
  const left = await sql(`select (select count(*) from content_reports where reporter = '${ME}') r, (select count(*) from user_blocks where blocker = '${ME}' or blocked = '${ME}') b`)
  console.log("cleanup left:", JSON.stringify(left))
}
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL OK"); process.exit(fails.length ? 1 : 0)
