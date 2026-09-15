// tv-sync: TradingView invite-only access on autopilot.
//
// Members save a TradingView username in the app (rpc set_tv_username) and
// their tv_access rows go pending_grant. Purchases and comps land the same
// way through _grant_one; cancellations land as pending_revoke. Until now
// every one of those rows waited for D1 to open Manage Access on TradingView
// by hand. This function does that step itself, as D1, using his TradingView
// session cookies (sessionid + sessionid_sign) stored in public.tv_session.
//
// Who calls it
//   - trigger trg_tv_sync_kick on tv_access (pg_net, x-webhook-secret) the
//     moment a row goes pending
//   - cron tv-sync every 10 minutes as the backstop (same secret)
//   - the admin Access tab (admin JWT): status, connect, disconnect, sync
//   - the members app after a username save (member JWT): sync, own rows only
//
// POST { action: 'status' | 'connect' | 'disconnect' | 'sync' }
//   connect: { sessionid, sessionid_sign } tested against TradingView first.
//
// TradingView endpoints (the same ones its Manage Access dialog uses):
//   GET  /username_hint/?s=<name>                     public, exact-match check
//   POST /pine_perm/list_users/?limit=10&order_by=-created  pine_id, username
//   POST /pine_perm/add/                              pine_id, username_recip
//   POST /pine_perm/remove/                           pine_id, username_recip
// A 401/403 or an HTML sign-in page on any of them means the session is dead:
// the function marks tv_session.ok = false and the admin card asks for fresh
// cookies. Nothing is marked granted unless list_users confirms it after.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const TV = "https://www.tradingview.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const LOCK_SECONDS = 90;
const MAX_PASSES = 3;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

type Actor = { kind: "secret" } | { kind: "admin"; email: string } | { kind: "member"; email: string };

async function whoIs(req: Request, db: SupabaseClient): Promise<Actor | null> {
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const given = req.headers.get("x-webhook-secret");
  if (secret && given && given === secret) return { kind: "secret" };
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const { data: row } = await db.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? { kind: "admin", email: data.user.email.toLowerCase() } : { kind: "member", email: data.user.email.toLowerCase() };
}

// ── TradingView ──────────────────────────────────────────────

type Session = { sessionid: string; sessionid_sign: string };
class SessionDead extends Error {}

function tvHeaders(s: Session, form = false): Record<string, string> {
  return {
    "user-agent": UA,
    origin: TV,
    referer: `${TV}/`,
    accept: "application/json, text/plain, */*",
    "x-requested-with": "XMLHttpRequest",
    cookie: `sessionid=${s.sessionid}; sessionid_sign=${s.sessionid_sign}`,
    ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
  };
}

async function tvJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new SessionDead(`TradingView answered ${res.status}`);
  if (/<html|<!doctype/i.test(text.slice(0, 200)) && /sign ?in|login/i.test(text)) throw new SessionDead("TradingView served the sign-in page");
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300), status: res.status }; }
}

// Exact username as TradingView spells it, or null when no such user exists.
async function tvCanonical(name: string): Promise<string | null> {
  const res = await fetch(`${TV}/username_hint/?s=${encodeURIComponent(name)}`, { headers: { "user-agent": UA, referer: `${TV}/` } });
  if (!res.ok) return name; // the hint endpoint is best-effort; never block on it
  const list = (await res.json().catch(() => [])) as Array<{ username?: string }>;
  const hit = list.find((u) => (u.username ?? "").toLowerCase() === name.toLowerCase());
  return hit?.username ?? null;
}

async function tvHasAccess(s: Session, pineId: string, name: string): Promise<boolean> {
  const body = new URLSearchParams({ pine_id: pineId, username: name });
  const res = await fetch(`${TV}/pine_perm/list_users/?limit=10&order_by=-created`, { method: "POST", headers: tvHeaders(s, true), body });
  const data = (await tvJson(res)) as { results?: Array<{ username?: string }> };
  return (data.results ?? []).some((u) => (u.username ?? "").toLowerCase() === name.toLowerCase());
}

async function tvAdd(s: Session, pineId: string, name: string): Promise<string> {
  const body = new URLSearchParams({ pine_id: pineId, username_recip: name });
  const res = await fetch(`${TV}/pine_perm/add/`, { method: "POST", headers: tvHeaders(s, true), body });
  const data = (await tvJson(res)) as { status?: string; raw?: string };
  if (!res.ok) throw new Error(`add ${res.status}: ${data.raw ?? JSON.stringify(data)}`);
  return data.status ?? "ok";
}

async function tvRemove(s: Session, pineId: string, name: string): Promise<void> {
  const body = new URLSearchParams({ pine_id: pineId, username_recip: name });
  const res = await fetch(`${TV}/pine_perm/remove/`, { method: "POST", headers: tvHeaders(s, true), body });
  const data = (await tvJson(res)) as { raw?: string };
  if (!res.ok) throw new Error(`remove ${res.status}: ${data.raw ?? JSON.stringify(data)}`);
}

// The signed-in username, read off the home page's embedded user object.
async function tvWhoAmI(s: Session): Promise<string | null> {
  try {
    const res = await fetch(`${TV}/`, { headers: { "user-agent": UA, cookie: `sessionid=${s.sessionid}; sessionid_sign=${s.sessionid_sign}` } });
    const html = await res.text();
    const m = /"username"\s*:\s*"([A-Za-z0-9_.-]{2,40})"/.exec(html);
    return m?.[1] ?? null;
  } catch { return null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── the queue ────────────────────────────────────────────────

type Row = { id: string; email: string; product: string; tv_username: string | null; state: string; note: string | null };
type Outcome = { added: string[]; removed: string[]; sent_back: string[]; failed: string[] };

async function runSync(db: SupabaseClient, onlyEmail: string | null, reason: string) {
  const { data: sess } = await db.from("tv_session").select("sessionid, sessionid_sign, ok").eq("id", 1).maybeSingle();
  if (!sess?.sessionid || !sess?.sessionid_sign) return { ok: false, reason: "no_session" };

  // one runner at a time; the others return busy and the runner re-checks the queue
  const { data: lock } = await db.rpc("tv_sync_claim", { p_seconds: LOCK_SECONDS });
  if (!lock) return { ok: true, busy: true };

  const session: Session = { sessionid: sess.sessionid, sessionid_sign: sess.sessionid_sign };
  const { data: products } = await db.from("products").select("key, tv_pine_id").eq("kind", "indicator");
  const pine = new Map<string, string>();
  for (const p of products ?? []) if (p.tv_pine_id) pine.set(p.key, p.tv_pine_id);

  const out: Outcome = { added: [], removed: [], sent_back: [], failed: [] };
  let dead: string | null = null;
  const seen = new Set<string>();

  try {
    for (let pass = 0; pass < MAX_PASSES && !dead; pass++) {
      let q = db.from("tv_access").select("id, email, product, tv_username, state, note").in("state", ["pending_grant", "pending_revoke"]).order("requested_at", { ascending: true });
      if (onlyEmail) q = q.eq("email", onlyEmail);
      const { data: rows } = await q;
      const todo = (rows ?? []).filter((r) => !seen.has(r.id)) as Row[];
      if (!todo.length) break;

      for (const r of todo) {
        seen.add(r.id);
        const tag = `${r.email} ${r.product}`;
        const pineId = pine.get(r.product);
        try {
          if (!pineId) {
            await db.from("tv_access").update({ note: "No TradingView script id on this product yet" }).eq("id", r.id);
            out.failed.push(tag); continue;
          }
          if (r.state === "pending_revoke") {
            if (r.tv_username) await tvRemove(session, pineId, r.tv_username);
            await db.from("tv_access").update({ state: "revoked", actioned_at: new Date().toISOString(), note: null }).eq("id", r.id);
            out.removed.push(tag); await sleep(300); continue;
          }
          // pending_grant
          if (!r.tv_username) {
            await db.from("tv_access").update({ state: "needs_username" }).eq("id", r.id);
            out.sent_back.push(tag); continue;
          }
          const name = await tvCanonical(r.tv_username);
          if (!name) {
            await db.from("tv_access").update({ state: "needs_username", note: `TradingView has no user "${r.tv_username}". Check the spelling and save it again.` }).eq("id", r.id);
            out.sent_back.push(tag); continue;
          }
          // a username change leaves a note naming the old TradingView user: take that one off first
          const old = /remove old TV user "([^"]+)"/.exec(r.note ?? "")?.[1];
          if (old && old.toLowerCase() !== name.toLowerCase()) {
            try { await tvRemove(session, pineId, old); } catch (e) { if (e instanceof SessionDead) throw e; }
            await sleep(300);
          }
          if (!(await tvHasAccess(session, pineId, name))) {
            await sleep(300);
            await tvAdd(session, pineId, name);
            await sleep(500);
            if (!(await tvHasAccess(session, pineId, name))) throw new Error("TradingView accepted the add but the user is not on the access list");
          }
          await db.from("tv_access").update({ state: "granted", tv_username: name, actioned_at: new Date().toISOString(), note: null }).eq("id", r.id);
          out.added.push(tag);
          await sleep(300);
        } catch (e) {
          if (e instanceof SessionDead) { dead = e.message; break; }
          const msg = e instanceof Error ? e.message : String(e);
          await db.from("tv_access").update({ note: `Autopilot could not finish: ${msg.slice(0, 180)}` }).eq("id", r.id);
          out.failed.push(tag);
        }
      }
    }
  } finally {
    const now = new Date().toISOString();
    await db.from("tv_session").update({
      sync_lock_until: null,
      last_sync_at: now,
      last_sync: { reason, at: now, ...out, dead },
      ok: !dead,
      checked_at: now,
      last_error: dead ? `TradingView signed the session out (${dead}). Paste fresh cookies.` : null,
    }).eq("id", 1);
  }
  return { ok: !dead, dead, ...out };
}

async function status(db: SupabaseClient) {
  const { data: s } = await db.from("tv_session").select("sessionid, tv_username, ok, checked_at, last_error, last_sync_at, last_sync").eq("id", 1).maybeSingle();
  const { count: pending } = await db.from("tv_access").select("id", { count: "exact", head: true }).in("state", ["pending_grant", "pending_revoke"]);
  const { count: waiting } = await db.from("tv_access").select("id", { count: "exact", head: true }).eq("state", "needs_username");
  return {
    connected: !!s?.sessionid,
    ok: !!s?.sessionid && !!s?.ok,
    tv_username: s?.tv_username ?? null,
    session_tail: s?.sessionid ? s.sessionid.slice(-4) : null,
    checked_at: s?.checked_at ?? null,
    last_error: s?.last_error ?? null,
    last_sync_at: s?.last_sync_at ?? null,
    last_sync: s?.last_sync ?? null,
    pending: pending ?? 0,
    waiting_for_username: waiting ?? 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const db = admin();
  const actor = await whoIs(req, db);
  if (!actor) return json(401, { error: "sign in" });
  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const action = body.action ?? "sync";

  try {
    if (action === "sync") {
      const only = actor.kind === "member" ? actor.email : null;
      const result = await runSync(db, only, actor.kind === "secret" ? (body.reason ?? "kick") : actor.kind);
      return json(200, actor.kind === "admin" ? { ...result, status: await status(db) } : result);
    }
    // status / connect / disconnect: the admin card, or the tos-gex GitHub jobs (secret), which
    // hand over the TradingView session they keep fresh after every run (tv-session-share.mjs).
    if (actor.kind === "member") return json(403, { error: "admins only" });

    if (action === "status") return json(200, await status(db));

    if (action === "disconnect") {
      await db.from("tv_session").update({ sessionid: null, sessionid_sign: null, tv_username: null, ok: false, last_error: null, sync_lock_until: null }).eq("id", 1);
      return json(200, await status(db));
    }

    if (action === "connect") {
      const sessionid = (body.sessionid ?? "").trim();
      const sessionid_sign = (body.sessionid_sign ?? "").trim();
      if (!sessionid || !sessionid_sign) return json(400, { error: "Both cookies are needed: sessionid and sessionid_sign." });
      const session = { sessionid, sessionid_sign };
      const { data: p } = await db.from("products").select("tv_pine_id").eq("kind", "indicator").not("tv_pine_id", "is", null).limit(1).maybeSingle();
      if (!p?.tv_pine_id) return json(400, { error: "No indicator has a TradingView script id yet." });
      try {
        await tvHasAccess(session, p.tv_pine_id, "D1fpc3"); // any 200 proves the session
      } catch (e) {
        const msg = e instanceof SessionDead ? "TradingView rejected those cookies. Copy sessionid and sessionid_sign again from a tab where you are signed in." : (e instanceof Error ? e.message : String(e));
        return json(400, { error: msg });
      }
      const who = await tvWhoAmI(session);
      const now = new Date().toISOString();
      await db.from("tv_session").upsert({ id: 1, sessionid, sessionid_sign, tv_username: who, ok: true, checked_at: now, last_error: null, sync_lock_until: null });
      const result = await runSync(db, null, "connect");
      return json(200, { ...result, status: await status(db) });
    }

    return json(400, { error: `unknown action ${action}` });
  } catch (e) {
    console.error("tv-sync", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
