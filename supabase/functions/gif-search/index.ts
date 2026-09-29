// gif-search: GIPHY behind our own endpoint (D1, 09-29: "should also have gifs"), so the key stays on the server
// and every member shares one cache. GET ?q=&offset= (no q = trending). Signed-in members only.
// Needs the GIPHY_API_KEY secret; without it every call answers 503 { error: 'not_configured' } and the app hides
// its GIF buttons. Deployed with JWT verification on (the default).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const KEY = Deno.env.get('GIPHY_API_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, OPTIONS' }
// per isolate: trending for 10 minutes, a search for 30, so a busy chat does not spend the key's hourly calls
const cache = new Map<string, { at: number; body: string }>()

type GiphyImage = { url?: string; webp?: string; width?: string; height?: string }
type Giphy = { id: string; title?: string; images?: Record<string, GiphyImage> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'private, max-age=60' } })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: who } = token ? await admin.auth.getUser(token) : { data: { user: null } }
  if (!who?.user) return json({ error: 'sign in' }, 401)
  if (!KEY) return json({ error: 'not_configured' }, 503)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60)
  const offset = Math.max(0, Math.min(4000, parseInt(url.searchParams.get('offset') || '0', 10) || 0))
  const ck = `${q.toLowerCase()}|${offset}`
  const hit = cache.get(ck)
  if (hit && Date.now() - hit.at < (q ? 30 : 10) * 60e3) return json(hit.body)

  const api = new URL(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}`)
  api.searchParams.set('api_key', KEY)
  api.searchParams.set('limit', '24')
  api.searchParams.set('offset', String(offset))
  api.searchParams.set('rating', 'pg-13')
  api.searchParams.set('bundle', 'messaging_non_clips')
  if (q) { api.searchParams.set('q', q); api.searchParams.set('lang', 'en') }
  const r = await fetch(api)
  if (!r.ok) return json({ error: `giphy ${r.status}` }, 502)
  const j = await r.json() as { data?: Giphy[]; pagination?: { offset: number; count: number; total_count: number } }
  const items = (j.data || []).map((g) => {
    const im = g.images || {}, pv = im.fixed_width || {}, full = (im.downsized_medium?.url ? im.downsized_medium : im.downsized) || im.original || {}
    return { id: g.id, title: g.title || '', w: Number(pv.width) || 200, h: Number(pv.height) || 200, preview: pv.webp || pv.url, url: full.url }
  }).filter((x) => x.preview && x.url)
  const p = j.pagination
  const body = JSON.stringify({ items, next: p && p.offset + p.count < p.total_count ? offset + items.length : null })
  if (cache.size > 400) cache.clear()
  cache.set(ck, { at: Date.now(), body })
  return json(body)
})
