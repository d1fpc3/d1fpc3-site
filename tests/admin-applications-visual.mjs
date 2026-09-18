// Admin Applications tab (manual, not a node:test).
//   1. from the repo root:  python -m http.server 8124
//   2. node tests/admin-applications-visual.mjs      (ADMIN_URL / OUT env)
// Seeds two throwaway applications with the service key, signs in as the owner by magic
// link (no email is sent), checks the list, the filter, a status change and a delete, and
// that a plain member cannot read the table. Cleans up after itself.
import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
const require = createRequire(import.meta.url);
const PW_PATHS = [
  "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/playwright",
  "C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/playwright",
];
const { chromium } = require(PW_PATHS.find((p) => existsSync(p)) || "playwright");
const OUT = process.env.OUT || `${tmpdir()}/admin-applications`; mkdirSync(OUT, { recursive: true });
const URL_ = process.env.ADMIN_URL || "http://127.0.0.1:8124/echelon/admin/";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const signIn = async (email) => {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) })).json();
  return (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }) })).json();
};
const fails = []; const ok = (c, w) => { console.log((c ? "ok   " : "FAIL ") + w); if (!c) fails.push(w) };
const stamp = Date.now();
await fetch(`${SB}/rest/v1/applications`, { method: "POST", headers: H, body: JSON.stringify([
  { name: "Harness Alpha", email: `harness-app-a-${stamp}@d1fpc3.test`, invest: "5000_plus", ref: "D1" },
  { name: "Harness Beta", email: `harness-app-b-${stamp}@d1fpc3.test`, invest: "under_500", ref: null },
]) }).then(async (r) => { if (!r.ok) throw new Error("seed failed: " + (await r.text())) });

// a plain member must not see applications
const member = await signIn("appreview@d1fpc3.com");
const leak = await (await fetch(`${SB}/rest/v1/applications?select=email`, { headers: { apikey: anon, Authorization: `Bearer ${member.access_token}` } })).json();
ok(Array.isArray(leak) && leak.length === 0, "a member reads zero applications: " + JSON.stringify(leak).slice(0, 80));

// the owner is whoever public.admins says, not a hard-coded address
const adminId = (await (await fetch(`${SB}/rest/v1/admins?select=user_id&limit=1`, { headers: H })).json())[0]?.user_id;
const adminEmail = process.env.EMAIL || (await (await fetch(`${SB}/auth/v1/admin/users/${adminId}`, { headers: H })).json()).email;
const session = await signIn(adminEmail);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("echelon-admin-tour", "done"); localStorage.setItem("echelon-gex-tour", "1") }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto(URL_, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.getElementById("app")?.classList.contains("on"), null, { timeout: 30000 }).catch(async () => { console.log("gate stuck. errors:", errors.join(" | "), "| text:", (await page.evaluate(() => document.body.innerText)).slice(0, 300)); });
await page.waitForTimeout(2000);
await page.click('.side .tab[data-view="applications"]'); await page.waitForTimeout(1200);
const rowOf = (n) => page.locator("#apps-table tr", { hasText: n });
ok(await rowOf("Harness Alpha").count() === 1 && await rowOf("Harness Beta").count() === 1, "both applications list under Open");
ok(/\$5,000\+/.test(await rowOf("Harness Alpha").textContent()) && /D1/.test(await rowOf("Harness Alpha").textContent()), "the row shows the range and the code");
ok(Number(await page.textContent("#c-apps")) >= 2, "the tab counts new applications: " + (await page.textContent("#c-apps")));
await page.screenshot({ path: `${OUT}/applications.png` });
await rowOf("Harness Alpha").locator("select").selectOption("accepted"); await page.waitForTimeout(1200);
ok(await rowOf("Harness Alpha").count() === 0, "accepting moves it out of Open");
await page.click('#apps-filter [data-f="accepted"]'); await page.waitForTimeout(400);
ok(await rowOf("Harness Alpha").count() === 1, "and into Accepted");
const db = await (await fetch(`${SB}/rest/v1/applications?email=eq.harness-app-a-${stamp}@d1fpc3.test&select=status`, { headers: H })).json();
ok(db[0]?.status === "accepted", "the status saved: " + db[0]?.status);
await page.click('#apps-filter [data-f="all"]'); await page.waitForTimeout(400);
await rowOf("Harness Beta").locator("button", { hasText: "Delete" }).click(); await page.waitForTimeout(1200);
const gone = await (await fetch(`${SB}/rest/v1/applications?email=eq.harness-app-b-${stamp}@d1fpc3.test&select=id`, { headers: H })).json();
ok(gone.length === 0 && await rowOf("Harness Beta").count() === 0, "delete removes the row and the record");
ok(errors.length === 0, "no page errors: " + errors.join(" | "));
await fetch(`${SB}/rest/v1/applications?email=like.harness-app-*`, { method: "DELETE", headers: H });
await browser.close();
if (fails.length) { console.log(["FAILS", ...fails].join(String.fromCharCode(10) + " - ")); process.exit(1) } else console.log("ALL OK, shots: " + OUT);
