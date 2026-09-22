// Security: what a stranger and a non-member can reach (manual, not a node:test).   node tests/security-leak.mjs
// 1. the public sign-up endpoint must refuse; 2. an account with no entitlement must read nothing from chat, feed,
// comments, profiles, library, directories or the search RPCs, must not post, and must get 403 from tape;
// 3. an anonymous visitor must not be able to list any storage bucket. Creates one throwaway user and deletes it.
// Exits 1 on any leak. Run it after every policy, view, bucket or edge-function change.
import { readFileSync } from 'fs'; import { homedir } from 'os'; import { join } from 'path'
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const tok = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json()
const anon = keys.find((k) => k.name === 'anon').api_key, service = keys.find((k) => k.name === 'service_role').api_key
const SH = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
const su = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `leaktest-${Date.now()}@d1fpc3.test`, password: 'Xk9!aaaaQz' + Math.random().toString(36).slice(2) }) })
console.log('1. stranger signup:', su.status, (await su.json()).msg || '')
// an account that exists but owns nothing (made with the admin API, the way a lapsed member looks)
const email = `nomember-${Date.now()}@d1fpc3.test`
const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: SH, body: JSON.stringify({ email, email_confirm: true }) })).json()
const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: SH, body: JSON.stringify({ type: 'magiclink', email }) })).json()
const sess = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }) })).json()
const H = { apikey: anon, Authorization: `Bearer ${sess.access_token}`, 'Content-Type': 'application/json' }
console.log('2. non-member account signed in:', !!sess.access_token)
let leaks = 0
for (const [name, path] of [['chat messages', 'messages?select=id&limit=3'], ['memecoin wire', 'memecoin_posts?select=id&limit=3'], ['memecoin calls', 'memecoin_scorecard?select=id&limit=3'], ['feed posts', 'member_recaps?select=id&limit=3'], ['comments', 'post_comments?select=id&limit=3'], ['profiles', 'profiles?select=username&limit=3'], ['library', 'library_videos?select=id&limit=3'], ['video likes', 'library_likes?select=video_id&limit=3'], ['applications', 'applications?select=email&limit=3'], ['channels', 'channels?select=slug&limit=9'], ['follows', 'follows?select=follower_id&limit=3'], ['member_directory', 'member_directory?select=username&limit=3'], ['chat_staff', 'chat_staff?select=user_id&limit=3'], ['mods', 'mods?select=user_id&limit=3'], ['likes', 'post_likes?select=user_id&limit=3'], ['lessons paid', 'lessons?select=id&is_preview=eq.false&limit=3'], ['entitlements', 'entitlements?select=id&limit=3']]) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H }); const j = await r.json().catch(() => null); const n = Array.isArray(j) ? j.length : -1; if (n > 0) leaks++
  console.log('   ', name.padEnd(18), r.status, n >= 0 ? `${n} rows` : JSON.stringify(j).slice(0, 70))
}
{ // the wire takes notes from the admin only; a non-member's insert must be refused
  const wp = await fetch(`${SB}/rest/v1/memecoin_posts`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ kind: 'note', title: 'leak probe', body: 'must be refused' }) })
  if (wp.status < 300) leaks++; console.log('    write memecoin_posts', wp.status, wp.status < 300 ? 'LEAK' : 'refused')
}
for (const [name, fn, body] of [['search_messages', 'search_messages', { p_q: 'patient' }], ['chat_previews', 'chat_previews', {}], ['feed_posts', 'feed_posts', { p_scope: 'all', p_before: new Date().toISOString(), p_limit: 5 }]]) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json().catch(() => null); const n = Array.isArray(j) ? j.length : -1; if (n > 0) leaks++
  console.log('    rpc', name.padEnd(14), r.status, n >= 0 ? `${n} rows` : JSON.stringify(j).slice(0, 70))
}
const gen = (await (await fetch(`${SB}/rest/v1/channels?slug=eq.general&select=id`, { headers: SH })).json())[0].id
const w = await fetch(`${SB}/rest/v1/messages`, { method: 'POST', headers: H, body: JSON.stringify({ channel_id: gen, user_id: u.id, body: 'should not post' }) })
console.log('3. non-member posting to #general:', w.status); if (w.status < 300) leaks++
const tp = await fetch(`${SB}/functions/v1/tape?symbol=NQ&tail=1`, { headers: H }); console.log('4. tape as non-member:', tp.status)
await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SH })
 
for (const b of ['chat-media', 'recap-media', 'avatars', 'library-thumbs', 'journal-media', 'homework-media', 'lesson-files', 'desktop']) {
  const r = await fetch(`${SB}/storage/v1/object/list/${b}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100 }) })
  const j = await r.json().catch(() => null); const n = Array.isArray(j) ? j.length : 0; if (n > 0) leaks++
  console.log('5. anon list', b.padEnd(16), r.status, `${n} entries`)
}
if (su.status < 300) leaks++
if (tp.status !== 403) leaks++
console.log(leaks ? `LEAKS: ${leaks}` : 'NO LEAKS'); process.exit(leaks ? 1 : 0)
