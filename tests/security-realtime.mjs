// Realtime authorization (manual). Run after touching realtime policies or channel names:
//   node tests/security-realtime.mjs
// Presence and typing ride on private channels. A member may join; an account that owns
// nothing may not; nobody may join a DM topic they are not part of; and nothing a member
// sends on a private topic reaches someone listening on the public topic of the same name.
import { createRequire } from "module"; import { readFileSync, existsSync } from "fs"; import { homedir } from "os"; import { join } from "path";
const require = createRequire(import.meta.url);
const SJ = ["C:/Users/clari/OneDrive/Desktop/Projects/clients/outback-running-club/client/node_modules/@supabase/supabase-js", "C:/Users/Deb/Desktop/Projects/outback-running-club/client/node_modules/@supabase/supabase-js"].find((p) => existsSync(p)) || "@supabase/supabase-js";
const { createClient } = require(SJ);
const REF = "cqdignbleethroyxxvzr", SB = `https://${REF}.supabase.co`;
const mgmt = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json();
const service = keys.find((k) => k.name === "service_role").api_key, anon = keys.find((k) => k.name === "anon").api_key;
const S = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=representation" };
const leaks = []; const ok = (c, w) => { console.log((c ? "ok   " : "LEAK ") + w); if (!c) leaks.push(w) };
{ const r = await (await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=500`, { headers: S })).json(); for (const u of r.users || []) if (/@d1fpc3\.test$/.test(u.email || "") && Date.now() - new Date(u.created_at).getTime() > 5 * 60000) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: S }); await fetch(`${SB}/rest/v1/entitlements?email=like.*@d1fpc3.test&user_id=is.null`, { method: "DELETE", headers: S }); }
const made = [], clients = [];
const cleanup = async () => { for (const c of clients) { try { await c.removeAllChannels() } catch {} } for (const id of made) await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: S }).catch(() => {}); await fetch(`${SB}/rest/v1/entitlements?email=like.*harness-rt-*`, { method: "DELETE", headers: S }).catch(() => {}) };
process.on("uncaughtException", async (e) => { console.error(e); await cleanup(); process.exit(1) }); process.on("unhandledRejection", async (e) => { console.error(e); await cleanup(); process.exit(1) });
const mk = async (tag, entitled) => {
  const pw = "x-" + Math.random().toString(36).slice(2) + "A9!"; const email = `harness-rt-${tag}-${Date.now()}@d1fpc3.test`;
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: S, body: JSON.stringify({ email, password: pw, email_confirm: true }) })).json(); made.push(u.id);
  if (entitled) await fetch(`${SB}/rest/v1/entitlements`, { method: "POST", headers: S, body: JSON.stringify({ user_id: u.id, email, status: "active", source: "comp", product: "course", interval: "one_time" }) });
  await fetch(`${SB}/rest/v1/profiles`, { method: "POST", headers: S, body: JSON.stringify({ user_id: u.id, username: "harnessrt" + tag + String(Date.now()).slice(-5) }) });
  const c = createClient(SB, anon, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(c);
  const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error;
  await c.realtime.setAuth();
  return { id: u.id, c };
};
const joinAs = (who, topic, priv, onMsg) => new Promise((res) => {
  const ch = who.c.channel(topic, { config: { private: priv, broadcast: { self: false } } });
  if (onMsg) ch.on("broadcast", { event: "typing" }, onMsg);
  let done = false; const fin = (st) => { if (done) return; done = true; res({ st, ch }) };
  ch.subscribe((st, err) => { if (st === "SUBSCRIBED" || st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") fin(st + (err ? " " + (err.message || "") : "")) });
  setTimeout(() => fin("NO_ANSWER"), 12000);
});

const A = await mk("a", true), B = await mk("b", true), C = await mk("c", false), D = await mk("d", true);
const chan = (await (await fetch(`${SB}/rest/v1/channels?select=id&limit=1`, { headers: S })).json())[0];
const dm = (await (await fetch(`${SB}/rest/v1/dm_threads`, { method: "POST", headers: S, body: JSON.stringify({ user_lo: A.id < B.id ? A.id : B.id, user_hi: A.id < B.id ? B.id : A.id }) })).json())[0];

let r = await joinAs(A, "online", true); ok(/^SUBSCRIBED/.test(r.st), "a member joins the private online topic: " + r.st);
r = await joinAs(C, "online", true); ok(!/^SUBSCRIBED/.test(r.st), "an account that owns nothing is refused on online: " + r.st);
r = await joinAs(C, "room:channel:" + chan.id, true); ok(!/^SUBSCRIBED/.test(r.st), "and refused on a channel's typing topic: " + r.st);
r = await joinAs(D, "room:dm:" + dm.id, true); ok(!/^SUBSCRIBED/.test(r.st), "a member is refused on a DM topic they are not part of: " + r.st);

// typing inside the DM reaches the other person, and nobody listening on the PUBLIC topic of the same name
let bGot = 0, pubGot = 0;
const bj = await joinAs(B, "room:dm:" + dm.id, true, () => { bGot++ }); ok(/^SUBSCRIBED/.test(bj.st), "B joins their own DM topic: " + bj.st);
const aj = await joinAs(A, "room:dm:" + dm.id, true); ok(/^SUBSCRIBED/.test(aj.st), "A joins their own DM topic: " + aj.st);
const spy = await joinAs(C, "room:dm:" + dm.id, false, () => { pubGot++ });   // public join of the same name
console.log("     (outsider's public join of the same topic name: " + spy.st + ")");
await new Promise((r) => setTimeout(r, 800));
for (let i = 0; i < 3; i++) { await aj.ch.send({ type: "broadcast", event: "typing", payload: { uid: A.id } }); await new Promise((r) => setTimeout(r, 400)) }
await new Promise((r) => setTimeout(r, 1500));
ok(bGot >= 1, "typing on the private DM topic reaches the other person: " + bGot + " events");
ok(pubGot === 0, "and nothing reaches an outsider on the public topic of the same name: " + pubGot + " events");

await fetch(`${SB}/rest/v1/dm_threads?id=eq.${dm.id}`, { method: "DELETE", headers: S });
await cleanup();
if (leaks.length) { console.log("\nLEAKS\n - " + leaks.join("\n - ")); process.exit(1) } else { console.log("\nREALTIME IS MEMBERS ONLY"); process.exit(0) }
