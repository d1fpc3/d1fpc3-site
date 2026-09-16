// captions: a subtitle track for every library video, made the moment it is posted.
//
// Both posting surfaces (the app's Post a video sheet and the admin Video
// library) insert a library_videos row after the file lands in lesson-files.
// A trigger on that insert kicks this function; nothing in the upload code
// knows captions exist. The file is never streamed through here: recaps run
// hundreds of MB, so AssemblyAI pulls a signed URL itself and calls back.
//
// Who calls it
//   - trigger trg_captions_kick on library_videos (pg_net, x-webhook-secret)
//     with { action: 'start', id } right after a post
//   - the admin Video library (admin JWT) with { action: 'start', id } to make
//     or redo one by hand
//   - AssemblyAI when the transcript is done: POST ?action=done&id=<video>,
//     x-webhook-secret set through the job's webhook_auth_header
//   - cron captions-poll every 10 minutes with { action: 'poll' }, the backstop
//     for a webhook that never arrived
//
// The VTT lands next to the video (library/<folder>/captions.vtt) and
// captions_path points at it. media-url signs it alongside the video, and the
// player's CC button lights up on its own.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const AAI = "https://api.assemblyai.com";
const SIGN_SECONDS = 6 * 3600; // AssemblyAI fetches within minutes; generous for a queue
const CHARS_PER_CAPTION = 42; // two short lines on a phone, one on a desktop
const POLL_BATCH = 10;

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

type Actor = { kind: "secret" } | { kind: "admin"; email: string };

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
  return row ? { kind: "admin", email: data.user.email.toLowerCase() } : null;
}

type Video = { id: string; storage_path: string; captions_status: string | null; captions_job: string | null };
const COLS = "id, storage_path, captions_status, captions_job";

async function fail(db: SupabaseClient, id: string, message: string) {
  await db.from("library_videos").update({ captions_status: "failed", captions_error: message }).eq("id", id);
  return { ok: false, error: message };
}

// ── start: hand the file to AssemblyAI ─────────────────────────

async function start(db: SupabaseClient, id: string) {
  const { data: v } = await db.from("library_videos").select(COLS).eq("id", id).maybeSingle<Video>();
  if (!v) return { ok: false, error: "no such video" };
  const key = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!key) return fail(db, id, "ASSEMBLYAI_API_KEY is not set");
  const { data: signed, error: signErr } = await db.storage.from("lesson-files").createSignedUrl(v.storage_path, SIGN_SECONDS);
  if (signErr || !signed) return fail(db, id, `could not sign the video: ${signErr?.message ?? "unknown"}`);
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
  const webhook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/captions?action=done&id=${id}`;
  const res = await fetch(`${AAI}/v2/transcript`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: signed.signedUrl,
      language_code: "en",
      punctuate: true,
      format_text: true,
      webhook_url: webhook,
      webhook_auth_header_name: "x-webhook-secret",
      webhook_auth_header_value: secret,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) return fail(db, id, `AssemblyAI refused the job: ${body.error ?? res.status}`);
  await db.from("library_videos").update({ captions_status: "working", captions_job: body.id, captions_error: null }).eq("id", id);
  return { ok: true, job: body.id };
}

// ── finish: pull the VTT once the job is done ──────────────────

async function finish(db: SupabaseClient, v: Video, key: string) {
  if (!v.captions_job) return fail(db, v.id, "no transcript job on the row");
  const st = await fetch(`${AAI}/v2/transcript/${v.captions_job}`, { headers: { authorization: key } });
  const job = await st.json().catch(() => ({}));
  if (!st.ok) return fail(db, v.id, `AssemblyAI lost the job: ${job.error ?? st.status}`);
  if (job.status === "error") return fail(db, v.id, job.error ?? "AssemblyAI reported an error");
  if (job.status !== "completed") return { ok: true, pending: true, status: job.status };
  if (!String(job.text ?? "").trim()) return fail(db, v.id, "no speech found in the video");
  const vtt = await fetch(`${AAI}/v2/transcript/${v.captions_job}/vtt?chars_per_caption=${CHARS_PER_CAPTION}`, { headers: { authorization: key } });
  if (!vtt.ok) return fail(db, v.id, `could not fetch the captions: ${vtt.status}`);
  const text = await vtt.text();
  if (!/^WEBVTT/.test(text)) return fail(db, v.id, "captions came back in an unexpected shape");
  const path = v.storage_path.replace(/\/[^/]+$/, "") + "/captions.vtt";
  const { error: upErr } = await db.storage.from("lesson-files")
    .upload(path, new Blob([text], { type: "text/vtt" }), { contentType: "text/vtt", upsert: true });
  if (upErr) return fail(db, v.id, `could not save the captions: ${upErr.message}`);
  await db.from("library_videos")
    .update({ captions_path: path, captions_status: "ready", captions_error: null, updated_at: new Date().toISOString() })
    .eq("id", v.id);
  return { ok: true, path };
}

async function done(db: SupabaseClient, id: string, transcriptId: string | undefined) {
  const key = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!key) return { ok: false, error: "ASSEMBLYAI_API_KEY is not set" };
  const { data: v } = await db.from("library_videos").select(COLS).eq("id", id).maybeSingle<Video>();
  if (!v) return { ok: false, error: "no such video" };
  // a stale callback from a job that was since redone is ignored
  if (transcriptId && v.captions_job && transcriptId !== v.captions_job) return { ok: true, ignored: true };
  return finish(db, v, key);
}

async function poll(db: SupabaseClient) {
  const key = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!key) return { ok: false, error: "ASSEMBLYAI_API_KEY is not set" };
  const { data: rows } = await db.from("library_videos").select(COLS).eq("captions_status", "working").limit(POLL_BATCH);
  const out: Record<string, unknown> = {};
  for (const v of (rows ?? []) as Video[]) out[v.id] = await finish(db, v, key);
  return { ok: true, checked: Object.keys(out).length, results: out };
}

// ── dispatch ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const db = admin();
  const actor = await whoIs(req, db);
  if (!actor) return json(401, { error: "not allowed" });
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* the webhook and the trigger always send JSON; an empty body is fine */ }
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? body.action;
  const id = url.searchParams.get("id") ?? body.id;
  try {
    if (action === "start") {
      if (!id) return json(400, { error: "missing id" });
      return json(200, await start(db, id));
    }
    if (action === "done") {
      if (actor.kind !== "secret") return json(403, { error: "not allowed" });
      if (!id) return json(400, { error: "missing id" });
      return json(200, await done(db, id, body.transcript_id));
    }
    if (action === "poll") return json(200, await poll(db));
    return json(400, { error: "unknown action" });
  } catch (e) {
    console.error("captions:", e);
    return json(500, { error: (e as Error).message });
  }
});
