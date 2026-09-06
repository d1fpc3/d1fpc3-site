// Confirm dialog, undo/retry toasts, notification pre-prompt, profile + lesson
// dirty tracking, users table tools, TradingView bulk bar (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-admin-dialogs-visual.mjs   (ADMIN_URL / APP_URL / OUT / EMAIL / OWNER env)
// App runs as the review member; chat writes are mocked at the network so nothing
// real is inserted or deleted. Admin runs as the owner; the lesson editor is
// opened, dirtied and discarded, never saved.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/echelon-dialogs-shots`;
mkdirSync(OUT, { recursive: true });
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:8080/echelon/admin/";
const APP_URL = process.env.APP_URL || "http://localhost:8080/echelon/app/";
const REF = "cqdignbleethroyxxvzr";
const SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const sql = (q) => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${mgmt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
}).then((r) => r.json());
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key;
const anon = keys.find((k) => k.name === "anon").api_key;
const sessionFor = async (email) => {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!s.access_token) throw new Error(`verify failed for ${email}`);
  return s;
};

const fails = [];
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails.push(msg); };
const browser = await chromium.launch();

/* ─────────────── app: member ─────────────── */
{
  const email = process.env.EMAIL || "appreview@d1fpc3.com";
  const session = await sessionFor(email);
  const uid = session.user.id;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-gex-tour", "1"); localStorage.setItem("echelon-quotes-off", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  // headless Chromium reports notifications as denied; make it look like an undecided browser so the pre-prompt path runs
  await ctx.addInitScript(() => { try { Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true }); Notification.requestPermission = () => Promise.resolve("default"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("app pageerror: " + e.message));
  let deleteCalls = 0, patchCalls = 0, insertCalls = 0;
  await page.route("**/functions/v1/delete-account", (r) => { deleteCalls++; r.fulfill({ status: 500, body: "{}" }); });
  // chat: one fake message of ours in whichever room opens; inserts fail; soft-deletes are swallowed
  const fake = { id: "00000000-0000-4000-8000-00000000f00d", user_id: uid, body: "harness message, delete me", created_at: new Date(Date.now() - 60000).toISOString(), edited_at: null, deleted_at: null, image_url: null, poll: null };
  await page.route(/\/rest\/v1\/messages(\?|$)/, (r) => {
    const req = r.request(), m = req.method();
    if (m === "GET" && /select=id%2Cuser_id%2Cbody/.test(req.url())) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([fake]) });
    if (m === "PATCH") { patchCalls++; return r.fulfill({ status: 200, contentType: "application/json", body: "[]" }); }
    if (m === "POST") { insertCalls++; return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "harness: insert refused" }) }); }
    return r.continue();
  });
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#app") && !document.getElementById("v-overview")?.hidden, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const go = async (view) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), view); await page.waitForTimeout(700); };

  // 1. delete account: type DELETE
  await go("settings");
  await page.evaluate(() => document.querySelector('[data-go="set-account"]')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById("del-account").click());
  await page.waitForTimeout(400);
  const d1 = await page.evaluate(() => ({ open: !document.getElementById("cfmodal").hidden && document.getElementById("cfmodal").classList.contains("on"), title: document.getElementById("cf-title").textContent, disabled: document.getElementById("cf-yes").disabled, yes: document.getElementById("cf-yes").textContent, danger: document.getElementById("cf-yes").classList.contains("danger"), hint: document.getElementById("cf-field-hint").textContent }));
  ok(d1.open && d1.title === "Delete your account" && d1.disabled && d1.yes === "Delete my account" && d1.danger, "delete account opens the type-to-confirm dialog " + JSON.stringify(d1));
  await page.locator("#cf-input").fill("DELET");
  ok(await page.locator("#cf-yes").isDisabled(), "delete stays disabled on a partial word");
  await page.locator("#cf-input").fill("DELETE");
  ok(!(await page.locator("#cf-yes").isDisabled()), "DELETE enables the button");
  await page.screenshot({ path: join(OUT, "app-delete-account.png") });
  await page.keyboard.press("Escape"); await page.waitForTimeout(350);
  ok(await page.evaluate(() => !document.getElementById("cfmodal").classList.contains("on")) && deleteCalls === 0, "Escape closes it and nothing was sent");

  // 6. notification pre-prompt (browser permission is 'default' in headless)
  await go("settings");
  await page.evaluate(() => document.querySelector('[data-go="notifs"]')?.click());
  await page.waitForTimeout(600);
  // the per-alert switches ask the same way as the device button; use the Asia-high sweep switch
  const cbId = await page.evaluate(() => [...document.querySelectorAll("#v-notifs input[type=checkbox]")].find((c) => !c.checked && c.id.startsWith("nt-"))?.id ?? null);
  const cbOk = cbId ? true : "every switch already on";
  if (cbOk === true) {
    await page.evaluate((id) => document.getElementById(id).click(), cbId); await page.waitForTimeout(400);
    const n1 = await page.evaluate(() => ({ on: document.getElementById("cfmodal").classList.contains("on"), title: document.getElementById("cf-title").textContent, no: document.getElementById("cf-no").textContent }));
    ok(n1.on && n1.title === "Turn on notifications" && n1.no === "Not now", "an alert switch shows the pre-prompt before the browser asks " + JSON.stringify(n1));
    await page.screenshot({ path: join(OUT, "app-notify-preprompt.png") });
    await page.evaluate(() => document.getElementById("cf-no").click()); await page.waitForTimeout(400);
    ok(await page.evaluate((id) => Notification.permission === "default" && !document.getElementById(id).checked, cbId), "Not now leaves the permission untouched and the switch off");
  } else console.log("  note  sweep switch state " + cbOk + ", pre-prompt not exercised");

  // 9. profile edit: Save lights up on change, Done asks before discarding
  await go("set-profile");
  await page.evaluate(() => document.getElementById("pro-edit").click()); await page.waitForTimeout(300);
  const p0 = await page.evaluate(() => ({ open: !document.getElementById("pro-edit-wrap").hidden, saveDisabled: document.getElementById("profile-save").disabled, name: document.getElementById("set-username").value }));
  ok(p0.open && p0.saveDisabled, "edit profile opens with Save disabled (nothing changed) " + JSON.stringify(p0));
  await page.locator("#set-bio").fill("harness bio " + Date.now()); await page.waitForTimeout(100);
  ok(!(await page.locator("#profile-save").isDisabled()), "a bio edit enables Save");
  await page.evaluate(() => document.getElementById("pro-edit-done").click()); await page.waitForTimeout(400);
  const p1 = await page.evaluate(() => ({ on: document.getElementById("cfmodal").classList.contains("on"), title: document.getElementById("cf-title").textContent, no: document.getElementById("cf-no").textContent, yes: document.getElementById("cf-yes").textContent }));
  ok(p1.on && p1.title === "Discard changes?" && p1.no === "Keep editing" && p1.yes === "Discard", "Done with edits asks first " + JSON.stringify(p1));
  await page.evaluate(() => document.getElementById("cf-no").click()); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.getElementById("pro-edit-wrap").hidden), "Keep editing stays in the editor");
  await page.evaluate(() => document.getElementById("pro-edit-done").click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("cf-yes").click()); await page.waitForTimeout(400);
  const p2 = await page.evaluate(() => ({ closed: document.getElementById("pro-edit-wrap").hidden, bio: document.getElementById("set-bio").value }));
  ok(p2.closed && !p2.bio.startsWith("harness bio"), "Discard closes and restores the saved bio " + JSON.stringify(p2));

  // 4 + 7. chat: delete with undo, send with retry (all mocked)
  await go("chat");
  await page.waitForFunction(() => document.querySelectorAll("#chat-rail .cr-item").length > 0, null, { timeout: 15000 }).catch(() => {});
  // first room where this member may post (announcement rooms hide the composer)
  const roomCount = await page.evaluate(() => document.querySelectorAll("#chat-rail .cr-item").length);
  for (let i = 0; i < roomCount; i++) {
    await page.evaluate((i) => document.querySelectorAll("#chat-rail .cr-item")[i].click(), i); await page.waitForTimeout(900);
    if (await page.evaluate(() => document.getElementById("chat-composer").style.display !== "none")) break;
  }
  await page.waitForFunction(() => [...document.querySelectorAll("#chat-log .msg")].length > 0, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const c0 = await page.evaluate(() => ({ rows: document.querySelectorAll("#chat-log .msg").length, dels: document.querySelectorAll("#chat-log .m-del").length, text: document.querySelector("#chat-log")?.textContent.includes("harness message") }));
  ok(c0.dels >= 1 && c0.text, "our mocked message renders with a delete control " + JSON.stringify(c0));
  await page.evaluate(() => document.querySelector("#chat-log .m-del").click()); await page.waitForTimeout(400);
  const c1 = await page.evaluate(() => ({ gone: !document.querySelector("#chat-log")?.textContent.includes("harness message"), toast: document.getElementById("co-toast")?.textContent, act: document.querySelector("#co-toast .act")?.textContent }));
  ok(c1.gone && /Message deleted/.test(c1.toast || "") && c1.act === "Undo", "delete removes at once and offers Undo " + JSON.stringify(c1));
  await page.screenshot({ path: join(OUT, "app-chat-undo.png") });
  await page.evaluate(() => document.querySelector("#co-toast .act").click()); await page.waitForTimeout(400);
  const c2 = await page.evaluate(() => ({ back: document.querySelector("#chat-log")?.textContent.includes("harness message"), toastOn: document.getElementById("co-toast").classList.contains("on") }));
  ok(c2.back && !c2.toastOn, "Undo puts the message back and drops the toast " + JSON.stringify(c2));
  await page.waitForTimeout(6500);
  ok(patchCalls === 0, "no soft-delete reached the database after Undo (" + patchCalls + ")");
  await page.locator("#chat-input").fill("harness send"); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
  const c3 = await page.evaluate(() => ({ toast: document.getElementById("co-toast")?.textContent, act: document.querySelector("#co-toast .act")?.textContent, input: document.getElementById("chat-input").value }));
  ok(insertCalls === 1 && /Could not send/.test(c3.toast || "") && c3.act === "Retry" && c3.input === "harness send", "failed send keeps the text and offers Retry " + JSON.stringify(c3));
  await page.evaluate(() => document.querySelector("#co-toast .act").click()); await page.waitForTimeout(900);
  ok(insertCalls === 2, "Retry sends again (" + insertCalls + ")");
  await page.screenshot({ path: join(OUT, "app-chat-retry.png") });
  await ctx.close();
}

/* ─────────────── admin: owner ─────────────── */
{
  const ownerEmail = process.env.OWNER || (await sql("select email from admins order by added_at limit 1"))[0].email;
  const owner = await sessionFor(ownerEmail);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "1"); localStorage.setItem("echelon-gex-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(owner)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("admin pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() === 401 || r.status() >= 500) fails.push(`admin ${r.status()} ${r.url()}`); });
  await page.goto(ADMIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#recent-buyers tr").length > 0 || !document.getElementById("recent-empty")?.hidden, null, { timeout: 25000 });
  await page.waitForTimeout(600);
  const go = async (view) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), view); await page.waitForTimeout(700); };

  // 5. users: search, status, sort, pager
  await go("users");
  const [{ total }] = await sql("select count(*)::int as total from admin_buyers");
  const u0 = await page.evaluate(() => ({ rows: document.querySelectorAll("#users-table tbody tr").length, pager: !document.getElementById("users-pager").hidden, sorted: document.querySelector("#users-table th.sorted")?.textContent, statuses: document.getElementById("users-status").options.length }));
  ok(u0.rows === Math.min(50, total) && u0.pager === total > 50 && /Joined/.test(u0.sorted || "") && u0.statuses >= 2, `users: ${u0.rows} of ${total} rows, pager ${u0.pager}, sorted by ${u0.sorted}, ${u0.statuses} status options`);
  const firstEmail = await page.evaluate(() => document.querySelector("#users-table tbody td.ink")?.textContent);
  await page.locator("#users-q").fill(firstEmail.split("@")[0]); await page.waitForTimeout(200);
  const u1 = await page.evaluate(() => ({ rows: document.querySelectorAll("#users-table tbody tr").length, shown: document.getElementById("users-shown").textContent }));
  ok(u1.rows >= 1 && u1.rows < Math.max(2, u0.rows) && /match/.test(u1.shown), "search narrows the table " + JSON.stringify(u1));
  await page.locator("#users-q").fill("zzz-no-such-buyer"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll("#users-table tbody tr").length === 0 && !document.getElementById("users-empty").hidden && document.getElementById("users-empty").textContent === "No one matches that."), "no match shows the empty line");
  await page.locator("#users-q").fill(""); await page.waitForTimeout(200);
  await page.evaluate(() => [...document.querySelectorAll("#users-table th")].find((t) => t.textContent.startsWith("Email")).click()); await page.waitForTimeout(300);
  const u2 = await page.evaluate(() => [...document.querySelectorAll("#users-table tbody td.ink")].map((t) => t.textContent.toLowerCase()));
  ok(u2.length > 1 && u2.every((e, i) => i === 0 || u2[i - 1] <= e) && (await page.evaluate(() => document.querySelector("#users-table th.sorted")?.textContent.startsWith("Email"))), "clicking Email sorts ascending");
  await page.evaluate(() => [...document.querySelectorAll("#users-table th")].find((t) => t.textContent.startsWith("Email")).click()); await page.waitForTimeout(300);
  const u3 = await page.evaluate(() => [...document.querySelectorAll("#users-table tbody td.ink")].map((t) => t.textContent.toLowerCase()));
  ok(u3.every((e, i) => i === 0 || u3[i - 1] >= e), "second click flips to descending");
  await page.screenshot({ path: join(OUT, "admin-users-tools.png") });

  // 8. tradingview access: bulk bar
  await go("access"); await page.waitForTimeout(1500);
  const a0 = await page.evaluate(() => ({ boxes: document.querySelectorAll("#access-table tbody input[type=checkbox]").length, bar: !document.getElementById("access-bulk").hidden }));
  if (a0.boxes) {
    ok(!a0.bar, "bulk bar hidden until something is ticked");
    await page.evaluate(() => document.querySelector("#access-table tbody input[type=checkbox]").click()); await page.waitForTimeout(200);
    ok(await page.evaluate(() => !document.getElementById("access-bulk").hidden && document.getElementById("access-bulk-n").textContent === "1 selected"), "one tick shows the bar with 1 selected");
    await page.evaluate(() => document.querySelector("#access-table thead input[type=checkbox]").click()); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.getElementById("access-bulk-n").textContent === `${document.querySelectorAll("#access-table tbody input[type=checkbox]").length} selected`), "header box selects every row");
    await page.screenshot({ path: join(OUT, "admin-access-bulk.png") });
    await page.evaluate(() => document.getElementById("access-bulk-clear").click()); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.getElementById("access-bulk").hidden && ![...document.querySelectorAll("#access-table input[type=checkbox]")].some((c) => c.checked)), "Clear empties the selection");
  } else console.log("  note  nothing to action in TradingView access right now; bulk bar not exercised");

  // 3. lesson editor: unsaved-changes bar
  await go("content"); await page.waitForTimeout(1200);
  await page.evaluate(() => [...document.querySelectorAll("#course-list-wrap button")].find((b) => b.textContent.trim() === "Edit")?.click()); await page.waitForTimeout(600);
  const e0 = await page.evaluate(() => ({ open: !document.getElementById("page-editor").hidden, bar: document.getElementById("pe-unsaved").hidden, title: document.getElementById("pe-title").value }));
  ok(e0.open && e0.bar, "editor opens clean, no bar " + JSON.stringify(e0));
  await page.locator("#pe-title").fill(e0.title + " x"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.getElementById("pe-unsaved").hidden), "a title edit shows the unsaved bar");
  await page.evaluate(() => document.getElementById("pe-back").click()); await page.waitForTimeout(300);
  const e1 = await page.evaluate(() => ({ stillOpen: !document.getElementById("page-editor").hidden, warn: document.getElementById("pe-unsaved").classList.contains("warn"), msg: document.getElementById("pe-unsaved-msg").textContent }));
  ok(e1.stillOpen && e1.warn && /Save or discard/.test(e1.msg), "Back refuses to leave while dirty " + JSON.stringify(e1));
  await page.screenshot({ path: join(OUT, "admin-lesson-unsaved.png") });
  await page.locator("#pe-title").fill(e0.title); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById("pe-unsaved").hidden), "restoring the title clears the bar");
  await page.locator("#pe-title").fill(e0.title + " y"); await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById("pe-discard").click()); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById("page-editor").hidden && !document.getElementById("course-list-wrap").hidden), "Discard leaves without saving");
  const [{ t }] = await sql(`select title as t from lessons where title = '${e0.title.replace(/'/g, "''")}' limit 1`).then((r) => (r.length ? r : [{ t: null }]));
  ok(t === e0.title, "the lesson title in the database is unchanged");
  await ctx.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED\n- ${fails.join("\n- ")}` : "\nall checks passed");
console.log("shots:", OUT);
process.exit(fails.length ? 1 : 0);
