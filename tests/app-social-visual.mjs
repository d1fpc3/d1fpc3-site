// Social layer harness (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8080
//   2. node tests/app-social-visual.mjs
// As the App Review account (a plain member) at 390x844: the Feed tab lists
// posts with like / comment / share; liking the owner's trade writes a
// post_likes row and a notification for the owner; commenting writes a
// post_comments row; following the owner writes a follows row and the member
// card shows Following + counts + heatmap; the leaderboard renders; the home
// stats show a Day streak; the profile shows an invite code; then, as the
// owner, the bell shows unread and the inbox lists the like / comment /
// follow. Cleans up its own rows afterwards. Screenshots in OUT.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const LOCAL_PW = "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright";
const { chromium, devices } = require(existsSync(LOCAL_PW) ? LOCAL_PW : "playwright");

const OUT = process.env.OUT || `${tmpdir()}/app-social-shots`;
mkdirSync(OUT, { recursive: true });
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
async function mint(email) {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  const session = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
  if (!session.access_token) throw new Error(`verify failed for ${email}`);
  return session;
}
const owner = (await sql("select a.user_id, u.email, p.username from admins a join auth.users u on u.id = a.user_id join profiles p on p.user_id = a.user_id order by a.added_at limit 1"))[0];
const member = (await sql("select u.id as user_id, u.email from auth.users u where u.email = 'appreview@d1fpc3.com'"))[0];
const post = (await sql(`select id from member_recaps where user_id = '${owner.user_id}' order by created_at desc limit 1`))[0];
if (!post) throw new Error("owner has no post to test with");
// clean slate for the test rows
await sql(`delete from post_likes where user_id = '${member.user_id}' and recap_id = '${post.id}'`);
await sql(`delete from post_comments where user_id = '${member.user_id}' and recap_id = '${post.id}' and body like 'Harness comment%'`);
await sql(`delete from follows where follower_id = '${member.user_id}' and followee_id = '${owner.user_id}'`);
await sql(`delete from notifications where actor_id = '${member.user_id}' and user_id = '${owner.user_id}'`);

const fails = [];
const browser = await chromium.launch();
async function open(session) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-quotes-off", "1"); localStorage.setItem("echelon-gex-tour", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#ov-hi", { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const view = async (page, v) => { await page.evaluate((v) => document.querySelector(`.tab[data-view="${v}"]`).click(), v); await page.waitForTimeout(700); };

// ── as the member ─────────────────────────────────────────────────
{
  const { ctx, page } = await open(await mint(member.email));
  const shot = (n) => page.screenshot({ path: `${OUT}/m-${n}.png` });
  // home: streak stat
  const stats = await page.textContent("#ov-mystats");
  if (!/Day streak/i.test(stats)) fails.push("home stats have no Day streak");
  // nav has Feed
  const slots = await page.$$eval("#bnav button:not([hidden])", (bs) => bs.map((b) => b.dataset.view));
  if (!slots.includes("feed")) fails.push("bottom nav has no feed slot: " + slots);
  // feed
  await page.click('#bnav button[data-view="feed"]'); await page.waitForTimeout(2000);
  const cards = await page.locator("#feed .rv-post").count();
  if (!cards) fails.push("feed is empty");
  const card = page.locator(`#feed .rv-post[data-id="${post.id}"]`);
  if (!(await card.count())) fails.push("owner post not in feed");
  for (const sel of [".rv-act .like", ".rv-act button[title=Comment]", ".rv-act button[title=Share]", ".rv-more", ".rv-ago"]) if (!(await card.locator(sel).count())) fails.push("post card missing " + sel);
  await shot("01-feed");
  // like
  await card.locator(".rv-act .like").click(); await page.waitForTimeout(1200);
  const liked = (await sql(`select count(*)::int n from post_likes where user_id = '${member.user_id}' and recap_id = '${post.id}'`))[0].n;
  if (liked !== 1) fails.push("like did not persist");
  if (!(await card.locator(".rv-act .like.liked").count())) fails.push("heart not filled after like");
  if (!/[0-9]+ likes?/.test(await card.locator(".rv-likes").textContent())) fails.push("like count line wrong: " + (await card.locator(".rv-likes").textContent()));
  // comment
  await card.locator(".rv-act button[title=Comment]").click(); await page.waitForTimeout(1200);
  if (!(await page.locator("#cmsheet").isVisible())) fails.push("comments sheet did not open");
  const stamp = "Harness comment " + Date.now();
  await page.fill("#cm-input", stamp); await page.click("#cm-post"); await page.waitForTimeout(1200);
  const cm = (await sql(`select count(*)::int n from post_comments where user_id = '${member.user_id}' and recap_id = '${post.id}' and body = '${stamp}'`))[0].n;
  if (cm !== 1) fails.push("comment did not persist");
  if (!(await page.locator("#cm-list .cm-row", { hasText: stamp }).count())) fails.push("comment not in the sheet");
  await shot("02-comments");
  await page.goBack(); await page.waitForTimeout(800);
  if (await page.locator("#cmsheet").isVisible()) fails.push("Back did not close the comments sheet");
  if (!/View all 1 comment/.test(await card.locator(".rv-more").textContent())) fails.push("comment count line wrong: " + (await card.locator(".rv-more").textContent()));
  // follow from the member card (tap the name in the post)
  await card.locator(".rv-user b").click(); await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => document.getElementById("mm-scrim").classList.contains("on")))) fails.push("member card did not open from the feed");
  const fb = page.locator("#mm-followbtn");
  if (!(await fb.isVisible())) fails.push("follow button hidden");
  await fb.click(); await page.waitForTimeout(1200);
  const fl = (await sql(`select count(*)::int n from follows where follower_id = '${member.user_id}' and followee_id = '${owner.user_id}'`))[0].n;
  if (fl !== 1) fails.push("follow did not persist");
  if ((await fb.textContent()).trim() !== "Following") fails.push("follow button label: " + (await fb.textContent()));
  if (!/1s*follower/.test(await page.textContent("#mm-follow"))) fails.push("follow counts: " + (await page.textContent("#mm-follow")));
  if (await page.locator("#mm-heat").count()) fails.push("heatmap still on the member card");
  await shot("03-member-follow");
  await page.goBack(); await page.waitForTimeout(800);
  // one feed, no scopes; the owner (staff) carries the gold check on the card
  if (await page.locator("#v-feed .feed-scopes").count()) fails.push("feed still has scope tabs");
  if (!(await card.locator(".rv-user .vcheck").count())) fails.push("no gold check on the owner's card");
  // leaderboard
  await view(page, "board"); await page.waitForTimeout(1200);
  if (!(await page.locator("#board .lb-row").count()) && (await page.locator("#board-empty").isHidden())) fails.push("leaderboard rendered nothing");
  if (await page.locator("#board-optin").count()) fails.push("leaderboard opt-out still present");
  if (await page.locator("#v-board .feed-scopes").count()) fails.push("leaderboard still has a time toggle");
  await shot("04-board");
  // profile: follow counts only (no invite code, no invited count, no heatmap)
  await page.click('#bnav button[data-view="set-profile"]'); await page.waitForTimeout(1500);
  if (await page.locator("#pro-ref").count()) fails.push("invite code still on the profile");
  if (await page.locator("#pro-heat").count()) fails.push("heatmap still on the profile");
  const pf = await page.textContent("#pro-follow");
  if (!/followers/.test(pf)) fails.push("profile follow line missing");
  if (/invited/.test(pf)) fails.push("invited count still on the profile");
  await shot("05-profile");
  // invite code lives under Settings → Invite friends
  await view(page, "set-invite"); await page.waitForTimeout(1200);
  const code = (await page.textContent("#inv-code")).trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) fails.push("invite code shape: " + code);
  if (!/joined|Nobody/.test(await page.textContent("#inv-n"))) fails.push("invited line missing");
  await shot("06-invite");
  // Settings → Statistics: your grid + everyone's numbers
  await view(page, "set-stats"); await page.waitForTimeout(1500);
  if (!(await page.locator("#stx-heat").count())) fails.push("statistics heatmap missing");
  const stxRows = await page.locator("#stx-list .stx-row").count();
  if (stxRows < 5) fails.push("statistics list rows: " + stxRows);
  if (await page.locator("#ov-heat-sec").count()) fails.push("heatmap still on the home screen");
  await shot("07-statistics");
  // notifications page: device row present
  await view(page, "notifs"); await page.waitForTimeout(500);
  if (!(await page.locator("#nt-social").count())) fails.push("social switch missing");
  await ctx.close();
}

// ── as the owner: the inbox ───────────────────────────────────────
{
  const { ctx, page } = await open(await mint(owner.email));
  const shot = (n) => page.screenshot({ path: `${OUT}/o-${n}.png` });
  const notes = (await sql(`select kind from notifications where user_id = '${owner.user_id}' and actor_id = '${member.user_id}' order by created_at`)).map((r) => r.kind);
  for (const k of ["like", "comment", "follow"]) if (!notes.includes(k)) fails.push("no " + k + " notification for the owner");
  if (!(await page.locator("#bell-n").isVisible())) fails.push("bell dot not showing with unread");
  await page.click("#tb-bell"); await page.waitForTimeout(1500);
  const rows = await page.locator("#inbox .nb-row").count();
  if (rows < 3) fails.push("inbox rows: " + rows);
  await shot("01-inbox");
  await page.waitForTimeout(800);
  if (!(await page.locator("#bell-n").isHidden())) fails.push("bell not cleared after reading the inbox");
  await ctx.close();
}

await browser.close();
// tidy
await sql(`delete from post_likes where user_id = '${member.user_id}' and recap_id = '${post.id}'`);
await sql(`delete from post_comments where user_id = '${member.user_id}' and recap_id = '${post.id}' and body like 'Harness comment%'`);
await sql(`delete from follows where follower_id = '${member.user_id}' and followee_id = '${owner.user_id}'`);
await sql(`delete from notifications where actor_id = '${member.user_id}' and user_id = '${owner.user_id}'`);
if (fails.length) { console.error("FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`ok · shots in ${OUT}`);
