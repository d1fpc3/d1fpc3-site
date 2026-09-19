// discord-video-alert (manual, not a node:test): node tests/discord-video-alert.mjs
//
// Proves the announce bot is safe before it is allowed near #updates. It posts a
// deliberately hostile fixture to the PRIVATE test webhook and checks that:
//   - a title of "@everyone" cannot ping anybody
//   - markdown and masked links in the title/summary come out inert
//   - a video with no poster still announces, with no broken image
//   - a dry run never stamps a row
//   - the anon key and a bare request are both turned away
// The fixture row is inserted unpublished so it can never surface in the real
// library, and both it and the Discord message are deleted at the end, including
// when an assertion fails.
//
// Needs SUPABASE_ACCESS_TOKEN (or ~/.supabase/access-token).

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const REF = "cqdignbleethroyxxvzr";
const FN = `https://${REF}.supabase.co/functions/v1/discord-video-alert`;
const token = process.env.SUPABASE_ACCESS_TOKEN
  || readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`sql ${r.status} ${t}`);
  return JSON.parse(t);
};

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
})).json();
// This project is on the new API key system, so the value the edge runtime sees
// as SUPABASE_SERVICE_ROLE_KEY is the sb_secret_ one, not the legacy JWT.
const SVC = keys.find((k) => k.type === "secret").api_key;
const ANON = keys.find((k) => k.name === "anon").api_key;

const call = async (key, body) => {
  const r = await fetch(FN, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};

let fail = 0, n = 0;
const ok = (cond, label, extra = "") => {
  n += 1;
  console.log(`${cond ? "ok  " : "FAIL"} ${n}. ${label}${extra ? "  " + extra : ""}`);
  if (!cond) fail += 1;
};

const HOSTILE = "@everyone @here *pwn* `code` [click](https://evil.example) _x_";
const SUMMARY = "See [my site](https://evil.example) and https://evil.example/raw for more";
let fixtureId = null, messageId = null;

try {
  const ins = await sql(`
    insert into public.library_videos (title, summary, category, storage_path, is_published, thumb_path)
    values ($t$${HOSTILE}$t$, $s$${SUMMARY}$s$, 'concept', 'library/harness/none.mp4', false, null)
    returning id`);
  fixtureId = ins[0].id;
  console.log(`fixture ${fixtureId} (unpublished, no poster)`);

  const res = await call(SVC, { mode: "test", id: fixtureId });
  ok(res.status === 200 && res.body.ok, "dry run posts to the test webhook", `status ${res.status}`);
  const m = res.body.discord ?? {};
  messageId = res.body.message_id ?? null;

  ok(m.mention_everyone === false, "an @everyone title does not ping everyone", `mention_everyone=${m.mention_everyone}`);
  ok(Array.isArray(m.mention_roles) && m.mention_roles.length === 0, "no role is pinged on a dry run");
  ok(!(m.content ?? "").includes("@everyone"), "the row's text never reaches the message content");

  const e = (m.embeds ?? [])[0] ?? {};
  ok((e.title ?? "").includes("\\*pwn\\*"), "markdown in the title is escaped", JSON.stringify(e.title));
  ok(!/\]\(/.test(e.description ?? ""), "a masked link in the summary is defused", JSON.stringify(e.description));
  ok((e.description ?? "").includes("<https://evil.example/raw>"), "a bare url in the summary cannot unfurl");
  ok(e.image === undefined, "a video with no poster sends no image key", JSON.stringify(e.image ?? null));
  ok(e.color === 13938487, "the embed is Echelon gold");
  ok((m.components ?? []).length === 1, "the Watch now button is attached");

  const row = (await sql(`select discord_notified_at, discord_attempts, discord_claimed_at
                            from public.library_videos where id = '${fixtureId}'`))[0];
  ok(row.discord_notified_at === null && row.discord_attempts === 0 && row.discord_claimed_at === null,
    "a dry run stamps nothing", JSON.stringify(row));

  const anon = await call(ANON, { mode: "test" });
  ok(anon.status === 401, "the anon key is turned away", `status ${anon.status}`);
  const bare = await fetch(FN, { method: "POST" });
  ok(bare.status === 401, "a request with no key is turned away", `status ${bare.status}`);
  const get = await fetch(FN, { method: "GET", headers: { Authorization: `Bearer ${SVC}`, apikey: SVC } });
  ok(get.status === 405, "GET is refused", `status ${get.status}`);
} finally {
  if (messageId) {
    const d = await call(SVC, { mode: "test", cleanup: messageId });
    console.log(`cleanup: discord message ${messageId} deleted=${d.body?.ok}`);
  }
  if (fixtureId) {
    await sql(`delete from public.library_videos where id = '${fixtureId}'`);
    const left = await sql(`select count(*)::int as c from public.library_videos where id = '${fixtureId}'`);
    console.log(`cleanup: fixture row removed=${left[0].c === 0}`);
    if (left[0].c !== 0) fail += 1;
  }
}

console.log(fail ? `\n${fail} FAILED` : "\nALL OK");
process.exit(fail ? 1 : 0);
