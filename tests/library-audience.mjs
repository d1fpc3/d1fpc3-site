// Library audience (manual, not a node:test). Run after any change to library policies or media-url:
//   node tests/library-audience.mjs
// Plants one published probe video (a real file path so media-url can sign it), makes three
// throwaway members (A plain, B plain, C a mod), then walks the three audiences and checks,
// for each of them, what the app would list (REST under RLS) and what media-url will sign:
//   mods   -> A no, B no, C yes, admin yes
//   people -> A no, B yes (listed), C no, admin yes
//   members-> A yes
// Sweeps the video, the users, their entitlements, profiles and mod row, even on a crash. Exits 1 on any leak.
import { readFileSync } from 'fs'; import { homedir } from 'os'; import { join } from 'path'
const REF = 'cqdignbleethroyxxvzr', SB = `https://${REF}.supabase.co`
const mgmt = readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim()
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${mgmt}` } })).json()
const service = keys.find((k) => k.name === 'service_role').api_key, anon = keys.find((k) => k.name === 'anon').api_key
const S = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const leaks = []; const ok = (c, w) => { console.log((c ? 'ok   ' : 'LEAK ') + w); if (!c) leaks.push(w) }
const sj = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }

const made = []; let videoId = null
const cleanup = async () => {
  if (videoId) await fetch(`${SB}/rest/v1/library_videos?id=eq.${videoId}`, { method: 'DELETE', headers: S }).catch(() => {})
  for (const id of made) {
    await fetch(`${SB}/rest/v1/mods?user_id=eq.${id}`, { method: 'DELETE', headers: S }).catch(() => {})
    await fetch(`${SB}/rest/v1/profiles?user_id=eq.${id}`, { method: 'DELETE', headers: S }).catch(() => {})
    await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: S }).catch(() => {})
  }
  await fetch(`${SB}/rest/v1/entitlements?email=like.harness-aud-*`, { method: 'DELETE', headers: S }).catch(() => {})
}
process.on('uncaughtException', async (e) => { console.error(e); await cleanup(); process.exit(1) })
process.on('unhandledRejection', async (e) => { console.error(e); await cleanup(); process.exit(1) })

const session = async (email) => {
  const l = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: 'POST', headers: S, body: JSON.stringify({ type: 'magiclink', email }) })).json()
  const s = await (await fetch(`${SB}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: l.hashed_token }) })).json()
  if (!s.access_token) throw new Error('no session for ' + email + ': ' + JSON.stringify(s).slice(0, 120))
  return { apikey: anon, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
}
const mk = async (tag, mod = false) => {
  const email = `harness-aud-${tag}-${Date.now()}@d1fpc3.test`
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: S, body: JSON.stringify({ email, email_confirm: true }) })).json()
  if (!u.id) throw new Error('user not made: ' + JSON.stringify(u).slice(0, 120))
  made.push(u.id)
  await fetch(`${SB}/rest/v1/entitlements`, { method: 'POST', headers: S, body: JSON.stringify({ user_id: u.id, email, status: 'active', source: 'comp', product: 'course' }) })
  await fetch(`${SB}/rest/v1/profiles`, { method: 'POST', headers: S, body: JSON.stringify({ user_id: u.id, username: 'harnessaud' + tag + String(Date.now()).slice(-4) }) })
  if (mod) { const admin = (await sj(await fetch(`${SB}/rest/v1/admins?select=user_id&limit=1`, { headers: S })))[0]?.user_id; await fetch(`${SB}/rest/v1/mods`, { method: 'POST', headers: S, body: JSON.stringify({ user_id: u.id, added_by: admin }) }) }
  return { id: u.id, email, H: await session(email) }
}

// a real storage path so the signer has something to sign
const real = (await sj(await fetch(`${SB}/rest/v1/library_videos?is_published=eq.true&audience=eq.members&select=storage_path&limit=1`, { headers: S })))[0]
if (!real) throw new Error('no published video to borrow a storage_path from')
const made_v = await sj(await fetch(`${SB}/rest/v1/library_videos`, { method: 'POST', headers: S, body: JSON.stringify({ title: `Audience probe ${Date.now()}`, category: 'concept', storage_path: real.storage_path, is_published: true, audience: 'mods', discord_notified_at: new Date().toISOString() }) }))
videoId = made_v?.[0]?.id; if (!videoId) throw new Error('probe video not made: ' + JSON.stringify(made_v).slice(0, 160))
console.log('probe video', videoId)

const A = await mk('a'), B = await mk('b'), C = await mk('c', true)
const ADMIN = await session(process.env.EMAIL || 'd1fpc3@gmail.com')
const lists = async (H) => { const j = await sj(await fetch(`${SB}/rest/v1/library_videos?id=eq.${videoId}&select=id`, { headers: H })); return Array.isArray(j) && j.length === 1 }
const signs = async (H) => { const r = await fetch(`${SB}/functions/v1/media-url`, { method: 'POST', headers: H, body: JSON.stringify({ library_id: videoId }) }); const j = await sj(r); return { status: r.status, url: !!j?.url } }
const setAud = async (aud) => { const r = await fetch(`${SB}/rest/v1/library_videos?id=eq.${videoId}`, { method: 'PATCH', headers: S, body: JSON.stringify({ audience: aud }) }); if (!r.ok) throw new Error('audience not set: ' + r.status) }

console.log('\n== audience: mods ==')
ok(!(await lists(A.H)), 'A (member) cannot list a mods-only video')
{ const s = await signs(A.H); ok(s.status === 403 && !s.url, `A (member) is refused a signed URL (${s.status})`) }
ok(await lists(C.H), 'C (mod) lists it')
{ const s = await signs(C.H); ok(s.status === 200 && s.url, `C (mod) gets a signed URL (${s.status})`) }
ok(await lists(ADMIN), 'admin lists it')
{ const s = await signs(ADMIN); ok(s.status === 200 && s.url, `admin gets a signed URL (${s.status})`) }

console.log('\n== audience: people (B chosen) ==')
await setAud('people')
await fetch(`${SB}/rest/v1/library_video_access`, { method: 'POST', headers: S, body: JSON.stringify({ video_id: videoId, user_id: B.id }) })
ok(!(await lists(A.H)), 'A (not chosen) cannot list it')
{ const s = await signs(A.H); ok(s.status === 403, `A (not chosen) is refused (${s.status})`) }
ok(await lists(B.H), 'B (chosen) lists it')
{ const s = await signs(B.H); ok(s.status === 200 && s.url, `B (chosen) gets a signed URL (${s.status})`) }
ok(!(await lists(C.H)), 'C (mod, not chosen) cannot list it')
{ const s = await signs(C.H); ok(s.status === 403, `C (mod, not chosen) is refused (${s.status})`) }
// B may read their own access row and nothing else's
{ const j = await sj(await fetch(`${SB}/rest/v1/library_video_access?select=video_id,user_id`, { headers: B.H })); ok(Array.isArray(j) && j.length === 1 && j[0].user_id === B.id, 'B reads only their own access row') }
{ const j = await sj(await fetch(`${SB}/rest/v1/library_video_access?select=video_id,user_id`, { headers: A.H })); ok(Array.isArray(j) && j.length === 0, 'A reads no access rows') }
{ const r = await fetch(`${SB}/rest/v1/library_video_access`, { method: 'POST', headers: { ...A.H, Prefer: 'return=minimal' }, body: JSON.stringify({ video_id: videoId, user_id: A.id }) }); ok(r.status >= 400, `A cannot add themselves to the list (${r.status})`) }
ok(!(await lists(A.H)), 'A still cannot list it after trying')

console.log('\n== the uploader manages their own list ==')
{ const r = await fetch(`${SB}/rest/v1/library_videos?id=eq.${videoId}`, { method: 'PATCH', headers: S, body: JSON.stringify({ created_by: C.id }) }); if (!r.ok) throw new Error('created_by not set') }
{ const r = await fetch(`${SB}/rest/v1/library_video_access`, { method: 'POST', headers: { ...C.H, Prefer: 'return=minimal' }, body: JSON.stringify({ video_id: videoId, user_id: A.id }) }); ok(r.status < 300, `C (uploader) can add A to the list (${r.status})`) }
ok(await lists(A.H), 'A (now chosen by the uploader) lists it')
{ const r = await fetch(`${SB}/rest/v1/library_video_access?video_id=eq.${videoId}&user_id=eq.${A.id}`, { method: 'DELETE', headers: { ...C.H, Prefer: 'return=minimal' } }); ok(r.status < 300, `C (uploader) can remove A again (${r.status})`) }
ok(!(await lists(A.H)), 'A is out again')
{ const r = await fetch(`${SB}/rest/v1/library_video_access`, { method: 'POST', headers: { ...B.H, Prefer: 'return=minimal' }, body: JSON.stringify({ video_id: videoId, user_id: A.id }) }); ok(r.status >= 400, `B (chosen, not the uploader) cannot add anyone (${r.status})`) }
{ const r = await fetch(`${SB}/rest/v1/library_videos?id=eq.${videoId}`, { method: 'PATCH', headers: S, body: JSON.stringify({ created_by: null }) }); if (!r.ok) throw new Error('created_by not reset') }

console.log('\n== audience: members ==')
await setAud('members')
ok(await lists(A.H), 'A (member) lists it again')
{ const s = await signs(A.H); ok(s.status === 200 && s.url, `A (member) gets a signed URL (${s.status})`) }

await cleanup()
console.log(leaks.length ? `\n${leaks.length} LEAK(S)` : '\nNO LEAKS')
process.exit(leaks.length ? 1 : 0)
