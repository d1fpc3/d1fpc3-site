// Member-versus-member isolation (manual). Run after any policy, view or function change:
//   node tests/security-member-isolation.mjs
// Two throwaway members, A and B, both with a real entitlement. A writes private things
// (journal, lesson note, DM, notification prefs). B then tries to read, change and delete
// what is not theirs, across every private table and every admin-only table. Exits 1 on a leak.
import { readFileSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const S = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const leaks = []; const ok = (c, w) => { console.log((c ? "ok   " : "LEAK ") + w); if (!c) leaks.push(w) };

// leftovers first
{ const r = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=500`, { headers: S })).json(); for (const u of r.users || []) if (/@d1fpc3\.test$/.test(u.email || "") && Date.now() - new Date(u.created_at).getTime() > 5 * 60000) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: S }); await fetch(`${SB}/rest/v1/entitlements?email=like.*@d1fpc3.test&user_id=is.null`, { method: "DELETE", headers: S }); }

const made = [];
const mk = async (tag, entitled = true) => {
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: S, body: JSON.stringify({ email: `harness-iso-${tag}-${Date.now()}@d1fpc3.test`, password: "x-" + Math.random().toString(36).slice(2) + "A9!", email_confirm: true }) })).json();
  made.push(u.id);
  if (entitled) await fetch(`${SB}/rest/v1/entitlements`, { method: "POST", headers: S, body: JSON.stringify({ user_id: u.id, email: u.email, status: "active", source: "comp", product: "course", interval: "one_time" }) });
  const l = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: S, body: JSON.stringify({ type: "magiclink", email: u.email }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: l.hashed_token }) })).json();
  return { id: u.id, email: u.email, H: { apikey: anon, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" } };
};
const cleanup = async () => { for (const id of made) await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: S }).catch(() => {}); await fetch(`${SB}/rest/v1/entitlements?email=like.*harness-iso-*`, { method: "DELETE", headers: S }).catch(() => {}); };
process.on("uncaughtException", async (e) => { console.error(e); await cleanup(); process.exit(1) }); process.on("unhandledRejection", async (e) => { console.error(e); await cleanup(); process.exit(1) });

const A = await mk("a"), B = await mk("b"), C = await mk("c", false);   // C owns nothing
// the app mints a profile on first load; do the same so DMs have someone to find
for (const [u, n] of [[A, "a"], [B, "b"], [C, "c"]]) await fetch(`${SB}/rest/v1/profiles`, { method: "POST", headers: S, body: JSON.stringify({ user_id: u.id, username: "harnessiso" + n + String(Date.now()).slice(-5) }) });
const get = async (who, path) => { const r = await fetch(`${SB}/rest/v1/${path}`, { headers: who.H }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { status: r.status, rows: Array.isArray(j) ? j : [], raw: j } };
const rpc = async (who, fn, body = {}) => { const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: who.H, body: JSON.stringify(body) }); const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t } return { status: r.status, body: j } };

// A makes private things
const lesson = (await (await fetch(`${SB}/rest/v1/lessons?is_published=eq.true&select=id&limit=1`, { headers: S })).json())[0];
const j = await fetch(`${SB}/rest/v1/journal_entries`, { method: "POST", headers: A.H, body: JSON.stringify({ user_id: A.id, entry_date: new Date().toISOString().slice(0, 10), body: "harness private journal" }) }); const jr = await j.json().catch(() => []);
const n = await fetch(`${SB}/rest/v1/lesson_notes`, { method: "POST", headers: A.H, body: JSON.stringify({ user_id: A.id, lesson_id: lesson.id, kind: "note", quote: "harness", note: "harness private note" }) }); const nr = await n.json().catch(() => []);
const admin = (await (await fetch(`${SB}/rest/v1/admins?select=user_id&limit=1`, { headers: S })).json())[0].user_id;
const dm = await rpc(A, "open_dm", { p_other: B.id }); const dmId = typeof dm.body === "string" ? dm.body : null;
ok(dm.status === 200 && !!dmId, "two members can still open a DM with each other: HTTP " + dm.status);
const toNobody = await rpc(A, "open_dm", { p_other: C.id }); ok(toNobody.status >= 400, "a member cannot open a DM with an account that owns nothing: HTTP " + toNobody.status);
// a DM between A and the owner, which B must never see
const lo = A.id < admin ? A.id : admin, hi = A.id < admin ? admin : A.id;
const th = (await (await fetch(`${SB}/rest/v1/dm_threads?on_conflict=user_lo,user_hi`, { method: "POST", headers: { ...S, Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify({ user_lo: lo, user_hi: hi }) })).json())[0];
const secret = (await (await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: S, body: JSON.stringify({ dm_id: th.id, user_id: A.id, body: "harness: private to the owner" }) })).json())[0];
console.log("setup: journal", j.status, "note", n.status, "dm", dm.status, "secret msg", !!secret?.id);

// 1. B reads private tables: nothing of A's may come back
const ownerCol = { journal_entries: "user_id", lesson_notes: "user_id", homework_submissions: "user_id", notifications: "user_id", push_tokens: "user_id", push_subscriptions: "user_id", entitlements: "user_id", tv_access: "user_id", check_results: "user_id", progress: "user_id", library_views: "user_id", lesson_views: "user_id", member_onboarding: "user_id", course_intake: "user_id", discord_links: "user_id", my_discord: "user_id", notify_prefs: "user_id", read_state: "user_id", affiliate_applications: "user_id" };
for (const [t, col] of Object.entries(ownerCol)) { const r = await get(B, `${t}?select=*&limit=1000`); const foreign = r.rows.filter((x) => x[col] && x[col] !== B.id); ok(foreign.length === 0, `${t}: member B sees ${r.rows.length} rows, ${foreign.length} not their own (HTTP ${r.status})`) }
// 2. admin-only tables and views
{ const r = await get(B, "admin_buyers?select=*&limit=1000"); const foreign = r.rows.filter((x) => x.user_id !== B.id); ok(foreign.length === 0, `admin_buyers: member B sees ${r.rows.length} rows, ${foreign.length} not their own`) }
for (const t of ["stripe_events", "access_codes", "applications", "free_applications", "mod_invites", "affiliate_payouts", "affiliate_referrals", "admins", "tv_session", "curriculum"]) { const r = await get(B, `${t}?select=*&limit=50`); ok(r.rows.length === 0, `${t}: member B reads ${r.rows.length} rows (HTTP ${r.status})`) }
// 3. someone else's DM
const peek = await get(B, `messages?dm_id=eq.${th.id}&select=id,body`); ok(peek.rows.length === 0, `B cannot read a DM between A and the owner: ${peek.rows.length} rows`);
const threads = await get(B, `dm_threads?select=id,user_lo,user_hi`); ok(threads.rows.every((x) => x.user_lo === B.id || x.user_hi === B.id), `B only sees DM threads they are part of: ${threads.rows.length}`);
const inject = await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: B.H, body: JSON.stringify({ dm_id: th.id, user_id: B.id, body: "harness: intruder" }) }); ok(inject.status >= 400, `B cannot post into someone else's DM: HTTP ${inject.status}`);
const spoof = await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: B.H, body: JSON.stringify({ dm_id: dmId, user_id: A.id, body: "harness: spoofed as A" }) }); ok(spoof.status >= 400, `B cannot post as A: HTTP ${spoof.status}`);
// 4. B tries to change or delete A's things
if (jr[0]?.id) { const u = await fetch(`${SB}/rest/v1/journal_entries?id=eq.${jr[0].id}`, { method: "PATCH", headers: B.H, body: JSON.stringify({ body: "defaced" }) }); const back = await u.json().catch(() => []); ok(!Array.isArray(back) || back.length === 0, `B cannot edit A's journal entry (rows changed: ${Array.isArray(back) ? back.length : 0})`); const d = await fetch(`${SB}/rest/v1/journal_entries?id=eq.${jr[0].id}`, { method: "DELETE", headers: B.H }); const gone = await d.json().catch(() => []); ok(!Array.isArray(gone) || gone.length === 0, `B cannot delete A's journal entry`) } else console.log("skip journal edit (insert shape differs): " + JSON.stringify(jr).slice(0, 120));
const pe = await fetch(`${SB}/rest/v1/profiles?user_id=eq.${A.id}`, { method: "PATCH", headers: B.H, body: JSON.stringify({ bio: "defaced by B" }) }); const peb = await pe.json().catch(() => []); ok(!Array.isArray(peb) || peb.length === 0, `B cannot edit A's profile`);
const selfAdmin = await fetch(`${SB}/rest/v1/admins`, { method: "POST", headers: B.H, body: JSON.stringify({ user_id: B.id, email: B.email }) }); ok(selfAdmin.status >= 400, `B cannot make themselves an admin: HTTP ${selfAdmin.status}`);
const selfMod = await fetch(`${SB}/rest/v1/mods`, { method: "POST", headers: B.H, body: JSON.stringify({ user_id: B.id }) }); ok(selfMod.status >= 400, `B cannot make themselves a mod: HTTP ${selfMod.status}`);
const selfEnt = await fetch(`${SB}/rest/v1/entitlements`, { method: "POST", headers: C.H, body: JSON.stringify({ user_id: C.id, email: C.email, status: "active", source: "comp", product: "course", interval: "one_time" }) }); ok(selfEnt.status >= 400, `an account that owns nothing cannot grant itself access: HTTP ${selfEnt.status}`);
const delMsg = await fetch(`${SB}/rest/v1/messages?id=eq.${secret.id}`, { method: "DELETE", headers: B.H }); const dmr = await delMsg.json().catch(() => []); ok(!Array.isArray(dmr) || dmr.length === 0, `B cannot delete someone else's message`);
// 5. staff-only functions
for (const [fn, body] of [["approve_affiliate", { p_user: A.id }], ["deny_affiliate", { p_user: A.id }], ["pay_affiliate", { p_user: A.id, p_note: "x" }], ["pin_message", { p_id: secret.id, p_on: true }], ["library_stats", {}], ["grant_entitlement", { p_email: B.email, p_product: "course", p_interval: "one_time", p_source: "comp" }], ["nq_store", {}], ["notify", { p_user: A.id, p_kind: "system", p_actor: null, p_recap: null }]]) {
  const r = await rpc(B, fn, body); const harmless = r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0) || r.body === null || r.body === false; ok(harmless, `${fn}: member gets HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 70)}`) }
const pinned = (await (await fetch(`${SB}/rest/v1/messages?id=eq.${secret.id}&select=pinned_at`, { headers: S })).json())[0]; ok(!pinned?.pinned_at, "the pin attempt changed nothing");
// 6. the account that owns nothing
const cdm = await rpc(C, "open_dm", { p_other: A.id }); ok(cdm.status >= 400 && /members_only/.test(JSON.stringify(cdm.body)), `an account that owns nothing cannot open a DM with a member: HTTP ${cdm.status} ${JSON.stringify(cdm.body).slice(0, 60)}`);
for (const t of ["messages", "member_recaps", "profiles", "lessons", "library_videos", "member_directory", "chat_staff", "dm_threads", "channels"]) { const r = await get(C, `${t}?select=*&limit=5`); const others = r.rows.filter((x) => x.user_id !== C.id); ok(others.length === 0, `owns-nothing account reads ${t}: ${others.length} rows`) }

await fetch(`${SB}/rest/v1/messages?id=eq.${secret.id}`, { method: "DELETE", headers: S }); await fetch(`${SB}/rest/v1/dm_threads?id=eq.${th.id}`, { method: "DELETE", headers: S });
await cleanup();
if (leaks.length) { console.log("\nLEAKS\n - " + leaks.join("\n - ")); process.exit(1) } else console.log("\nNO LEAKS BETWEEN MEMBERS");
