// Echelon | radar (D1, 10/8/26: "alerts when events happen near me ... special deals that i can
// actually save money with without giving out information ... amazon deals walmart deals")
// Spec: docs/superpowers/specs/2026-10-08-radar-deals-events-design.md
//
// Public pages and RSS only: no account, no API key, nothing about D1 is sent to any source.
// verify_jwt = false. Two ways in:
//   x-webhook-secret (pg_cron via public.radar_kick)    { scan: 'deals' | 'events' } | { digest: 'morning' | 'weekend' }
//   D1's own session (Admin > Radar, "Scan now")         the same bodies, owner uid only
// { dry: true } on a scan returns what it read without writing or pushing. { test_push: true } sends one push.
//
// Pushes go through send-push's admins-only branch (the one the Kalshi bot uses), so Pause all and the
// device list are send-push's, not ours.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const OWNER = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'    // d1fpc3@gmail.com, as in owner_money
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
// the admin page is served from d1fpc3.com (and www); anything else gets no CORS grant
const corsFor = (req: Request): Record<string, string> => {
  const o = req.headers.get('origin') ?? ''
  return /^https:\/\/(www\.)?d1fpc3\.com$/.test(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' }
}

// ── small helpers ──────────────────────────────────────────────────────────
async function getText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' } })
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`)
  const t = await r.text()
  if (/<title>(Just a moment|Attention Required)/i.test(t)) throw new Error(`${new URL(url).host} bot wall`)
  return t
}
const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;|&rsquo;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
const strip = (s: string) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
const tag = (x: string, t: string) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1] : '' }
const num = (s: string | undefined) => (s == null ? null : Number(String(s).replace(/,/g, '')))
const usd = (n: number | null) => (n == null ? '' : '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)))
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

// New York wall clock (the digests and the quiet hours are New York times)
function ny(d = new Date()) {
  const p: Record<string, string> = {}
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) p[x.type] = x.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24, wd: p.weekday }
}
// the UTC instant of a New York wall time on a date ('2026-10-24', 12) -> Date
function nyAt(date: string, hour = 0, min = 0) {
  const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`)
  const shown = ny(guess), off = (hour - shown.hour + 24) % 24          // 4 in EDT, 5 in EST
  return new Date(guess.getTime() + off * 3600e3)
}

async function push(title: string, body: string, path: string) {
  const r = await fetch(`${SB_URL}/functions/v1/send-push`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': SECRET },
    body: JSON.stringify({ kalshi: { title: clip(title, 80), body: clip(body, 300), path } }),   // the admins-only branch
  })
  return r.ok ? await r.json().catch(() => ({})) : { error: `send-push ${r.status}` }
}

async function prefs() {
  const { data } = await admin.from('radar_prefs').select('*').eq('id', 1).maybeSingle()
  return data ?? { deals_push: true, events_push: true, deal_cap: 3, min_pct: 40, sent: {} }
}

// ── deals: Slickdeals RSS, Amazon and Walmart only ─────────────────────────
type Deal = { ext_id: string; title: string; url: string; store: string; price: number | null; was_price: number | null; pct_off: number | null; atl: boolean; thumbs: number; posted: number; feed: string; image: string | null }
const SD = 'https://slickdeals.net/newsearch.php?searcharea=deals&searchin=first&rss=1'
const STORES: Record<string, string> = { amazon: 'Amazon', walmart: 'Walmart' }

function parseRss(xml: string, feed: string): Deal[] {
  const out: Deal[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], content = decode(tag(it, 'content:encoded')), desc = strip(tag(it, 'description'))
    const title = strip(tag(it, 'title')), link = decode(tag(it, 'link')).trim()
    // the outclick link names the store (data-store-slug="amazon"); the "<Store> [amazon.com] has" line is the fallback
    const slug = (content.match(/data-store-slug="([a-z0-9-]+)"/) || [])[1] || (desc.match(/^(Amazon|Walmart)\b/i) || [])[1]?.toLowerCase()
    const store = slug && STORES[slug]; if (!store) continue
    const id = (link.match(/\/f\/(\d+)/) || [])[1]; if (!id) continue
    const price = num((title.match(/\$\s?(\d[\d,]*(?:\.\d\d)?)(?!\s*off)/i) || [])[1])
    // a was price only when the post says so: list / reg. / retail / MSRP, or "for $X ... = $Y"
    let was = num((desc.match(/\b(?:list(?: price)?|reg(?:ular(?:ly)?)?\.?|retail|msrp|normally|usually|originally|was)\s*:?\s*(?:price\s*)?(?:of\s*)?\$\s?(\d[\d,]*(?:\.\d\d)?)/i) || [])[1])
    const eq = desc.match(/\bfor \$\s?(\d[\d,]*(?:\.\d\d)?)[^=]{0,220}=\s*\$\s?(\d[\d,]*(?:\.\d\d)?)/)
    if (!was && eq) was = num(eq[1])
    let pct = price && was && was > price ? Math.round((1 - price / was) * 100) : null
    if (pct == null) { const p = (title + ' ' + desc).match(/\b(\d{2})% off\b/i); if (p) pct = +p[1] }
    out.push({
      ext_id: id, title, url: link.replace(/\?.*$/, ''), store, price, was_price: was && price && was > price ? was : null, pct_off: pct,
      atl: /lowest price|all[- ]time low|historical low|lowest (?:we've|i've|ever)|price mistake/i.test(title + ' ' + desc),
      thumbs: +((content.match(/Thumb Score:\s*([+-]?\d+)/) || [])[1] ?? 0), posted: Date.parse(tag(it, 'pubDate')) || Date.now(), feed,
      image: (content.match(/<img src="([^"]+)"/) || [])[1] ?? null,
    })
  }
  return out
}

async function scanDeals(dry: boolean) {
  const P = await prefs()
  const { data: watch } = await admin.from('radar_watch').select('*').eq('active', true)
  const feeds: [string, string][] = [['front', `${SD}&mode=frontpage`], ['popular', `${SD}&mode=popdeals`]]
  for (const w of watch ?? []) if (w.query) feeds.push([`w${w.id}`, `${SD}&q=${encodeURIComponent(w.query)}`])
  const got = await Promise.allSettled(feeds.map(([f, u]) => getText(u).then((x) => parseRss(x, f))))
  const errors = got.flatMap((g, i) => (g.status === 'rejected' ? [`${feeds[i][0]}: ${g.reason?.message ?? g.reason}`] : []))
  const all = new Map<string, Deal & { feeds: Set<string> }>()
  got.forEach((g) => { if (g.status === 'fulfilled') for (const d of g.value) { const o = all.get(d.ext_id); if (o) o.feeds.add(d.feed); else all.set(d.ext_id, { ...d, feeds: new Set([d.feed]) }) } })
  const fresh = [...all.values()].filter((d) => Date.now() - d.posted < 4 * 864e5)

  const rows = fresh.map((d) => {
    const vetted = d.feeds.has('front') || d.feeds.has('popular')
    const hits = (watch ?? []).filter((w) => {
      let rx: RegExp; try { rx = new RegExp(w.match || `\\b${w.term}\\b`, 'i') } catch { return false }
      if (!rx.test(d.title)) return false
      if (w.max_price != null && d.price != null && d.price > +w.max_price) return false
      return w.category ? vetted : true                 // a category (Food) rides on vetted deals, a term on its own search too
    })
    const term = hits.find((w) => !w.category), food = hits.find((w) => w.category)
    const hot = d.feeds.has('front') && ((d.pct_off ?? 0) >= P.min_pct || d.atl)
    const why = term ? `Watchlist: ${term.term}` : hot ? (d.atl ? 'Lowest price' : `${d.pct_off}% off`) : food ? food.term : vetted ? 'Front page' : null
    // bands that never overlap: any watchlist hit outranks any hot deal, which outranks any food deal
    const score = term ? 300 + (d.pct_off ?? 0) : hot ? 200 + (d.pct_off ?? 0) : food ? 100 + (d.pct_off ?? 0) : vetted ? 10 + Math.min(60, Math.round(d.thumbs / 2)) : 0
    return { kind: 'deal', source: 'slickdeals', ext_id: d.ext_id, title: d.title, url: d.url, store: d.store, price: d.price, was_price: d.was_price, pct_off: d.pct_off,
      category: term ? 'watch' : hot ? 'hot' : food ? 'food' : 'front', score, reason: why, image: d.image, last_seen: new Date().toISOString() }
  }).filter((r) => r.score > 0)

  if (dry) return { ok: true, dry: true, feeds: feeds.length, errors, read: all.size, kept: rows.length, rows: rows.sort((a, b) => b.score - a.score).slice(0, 40) }
  if (rows.length) { const { error } = await admin.from('radar_items').upsert(rows, { onConflict: 'source,ext_id' }); if (error) return { ok: false, error: error.message } }
  const pushed = await pushDeals(P)
  return { ok: true, read: all.size, kept: rows.length, errors, pushed }
}

// the product without the price tail and the tags ("[SnS] $4.52 | 12-Pk Gatorade ... at Amazon" -> "12-Pk Gatorade ...")
const dealName = (t: string) => t.replace(/^(?:\[[^\]]*\]\s*)?(?:\$\s?[\d,.]+\s*\|\s*)?/, '').replace(/^Select Accounts:\s*/i, '')
  .replace(/\s+\$\s?[\d,.]+(?:\s.*)?$/, '').replace(/\s+at (Amazon|Walmart)\b.*$/i, '').trim()

// one push per run at most, holding several deals; watchlist > hot > food; food at most once a day
async function pushDeals(P: any) {
  if (!P.deals_push) return { skipped: 'deal pushes off' }
  const now = ny()
  if (now.hour < 8 || now.hour >= 22) return { skipped: 'quiet hours' }
  const since = nyAt(now.date, 0).toISOString()
  const { data: today } = await admin.from('radar_items').select('category').eq('kind', 'deal').gte('pushed_at', since)
  let left = P.deal_cap - (today?.length ?? 0), foodLeft = (today ?? []).some((r) => r.category === 'food') ? 0 : 1
  if (left <= 0) return { skipped: 'daily cap reached' }
  const { data: cand } = await admin.from('radar_items').select('id, title, store, price, pct_off, reason, category, score, url')
    .eq('kind', 'deal').is('pushed_at', null).is('dismissed_at', null).in('category', ['watch', 'hot', 'food'])
    .gte('first_seen', new Date(Date.now() - 12 * 3600e3).toISOString()).order('score', { ascending: false }).limit(10)
  const pick: any[] = []
  for (const c of cand ?? []) { if (left <= 0) break; if (c.category === 'food') { if (!foodLeft) continue; foodLeft-- } pick.push(c); left-- }
  if (!pick.length) return { sent: 0 }
  const line = (c: any) => `${clip(dealName(c.title), 44)} ${usd(c.price)} (${c.store}${c.pct_off ? `, ${c.pct_off}% off` : ''})`
  const title = pick.length === 1 ? `${pick[0].reason}: ${pick[0].store} deal` : `${pick.length} deals worth a look`
  const body = pick.length === 1 ? line(pick[0]) : pick.map(line).join(' · ')
  const r = await push(title, body, '/echelon/admin/?view=deals')
  if (!(r as any).error) await admin.from('radar_items').update({ pushed_at: new Date().toISOString() }).in('id', pick.map((p) => p.id))
  return { sent: pick.length, title, body, result: r }
}

// ── events: allevents + Eventbrite JSON-LD, Joppa / Bel Air ────────────────
// Harford County around Joppa and Bel Air; car meets also count a ring further out (D1 drives to those)
const HOME = ['bel air', 'joppa', 'joppatowne', 'abingdon', 'edgewood', 'fallston', 'forest hill', 'kingsville', 'churchville', 'belcamp', 'jarrettsville',
  'white marsh', 'perry hall', 'nottingham', 'aberdeen', 'havre de grace', 'street', 'whiteford', 'pylesville', 'darlington', 'baldwin', 'emmorton', 'riverside', 'benson', 'hickory', 'middle river', 'rosedale']
const CAR_RING = ['towson', 'timonium', 'cockeysville', 'lutherville', 'hunt valley', 'parkville', 'essex', 'dundalk', 'sparrows point', 'glen arm', 'hydes', 'phoenix', 'monkton',
  'perryville', 'north east', 'elkton', 'rising sun', 'port deposit', 'baltimore', 'delta', 'owings mills', 'reisterstown', 'catonsville', 'ellicott city', 'glen burnie', 'pasadena']
const CAR = /\b(?:car|auto|truck|jeep|motorcycle|bike|import|euro|jdm)\s*(?:show|meet|meetup|cruise|night|rally|expo)s?\b|\bcars?\s*(?:&|and|n'?)\s*coffee\b|\bcruise[- ]?in\b|\bcar ?meets?\b|\bauto ?shows?\b|\bhot ?rods?\b|\bcorvettes?\b|\bmustangs?\b|\bmopar\b|\bmuscle cars?\b|\bclassic cars?\b|\bexotic cars?\b|\bautocross\b|\btrack ?day\b|\bdrift(?:ing)?\b|\bdyno\b|\bcar ?club\b|\bshow ?(?:&|and|n'?) ?shine\b/i
const COMMUNITY = /\b(?:festival|fest|fair|farmers'? market|market|craft show|crafts? fair|parade|trunk[- ]or[- ]treat|trick[- ]or[- ]treat|harvest|block party|carnival|fireworks|tree lighting|holiday (?:market|lights)|winter wonderland|first friday|community day|celebration|concert in the park|movie night|food trucks?|small business saturday|witches'? night|pumpkin|hayrides?|corn maze|halloween|christmas|bazaar|flea market|yard sale|5k|fun run|story ?time|library|museum day|art walk|wine walk|tree|lighting|santa|easter|egg hunt|fourth of july|independence day|memorial day|veterans day|bingo)\b/i

type Ev = { key: string; title: string; url: string; starts: Date; ends: Date | null; allDay: boolean; venue: string; town: string; free: boolean; car: boolean; site: string; image: string | null }

function ldEvents(html: string): any[] {
  const out: any[] = []
  const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (/Event$/.test(String(x['@type'] ?? ''))) out.push(x); for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v) } }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) { try { walk(JSON.parse(m[1])) } catch { /* a broken block is skipped */ } }
  return out
}
function toEv(e: any, site: string, freeSource: boolean): Ev | null {
  const name = decode(String(e.name ?? '')).trim(); if (!name) return null
  const a = e.location?.address
  const addr = decode(typeof a === 'string' ? a : a ? [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ') : '')
  const where = (addr + ' ' + decode(String(e.location?.name ?? ''))).toLowerCase()
  if (!/\b(md|maryland|pa)\b/.test(where)) return null
  const text = name + ' ' + decode(String(e.description ?? '')).slice(0, 400)
  const car = CAR.test(text)
  const ring = car ? [...HOME, ...CAR_RING] : HOME
  const town = ring.find((t) => new RegExp(`\\b${t}\\b,?\\s*(md|maryland|pa)\\b`).test(where) || new RegExp(`,\\s*${t}\\b`).test(where))
  if (!town) return null
  const off = Array.isArray(e.offers) ? e.offers[0] : e.offers
  const price = off ? Number(off.price ?? off.lowPrice ?? NaN) : NaN
  const free = freeSource || e.isAccessibleForFree === true || price === 0 || /\bfree\b/i.test(name)
  if (!car && !COMMUNITY.test(text)) return null
  const sd = String(e.startDate ?? ''); if (!sd) return null
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(sd)
  const starts = allDay ? nyAt(sd, 12) : new Date(sd); if (isNaN(+starts)) return null
  const ed = String(e.endDate ?? ''), ends = ed ? (/^\d{4}-\d{2}-\d{2}$/.test(ed) ? nyAt(ed, 23, 59) : new Date(ed)) : null
  const day = ny(starts).date
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60) + '|' + day
  const img = Array.isArray(e.image) ? e.image[0] : e.image
  return { key, title: name, url: String(e.url ?? '').replace(/\?.*$/, ''), starts, ends: ends && !isNaN(+ends) ? ends : null, allDay, venue: decode(String(e.location?.name ?? '')).slice(0, 120),
    town: town.replace(/\b\w/g, (c) => c.toUpperCase()), free, car, site, image: typeof img === 'string' ? img : img?.url ?? null }
}

const EVENT_SOURCES: [string, string, boolean][] = [
  ['allevents', 'https://allevents.in/bel%20air', false],
  ['allevents', 'https://allevents.in/aberdeen-md', false],
  ['allevents', 'https://allevents.in/havre%20de%20grace', false],
  ['allevents', 'https://allevents.in/baltimore', false],              // car meets only: Baltimore is in the car ring, not home
  ['eventbrite', 'https://www.eventbrite.com/d/md--bel-air/free--events/', true],
  ['eventbrite', 'https://www.eventbrite.com/d/md--bel-air/free--events/?page=2', true],
  ['eventbrite', 'https://www.eventbrite.com/d/md--joppa/free--events/', true],
  ['eventbrite', 'https://www.eventbrite.com/d/md--bel-air/car-show/', false],
  ['eventbrite', 'https://www.eventbrite.com/d/md--bel-air/car-meet/', false],
  ['eventbrite', 'https://www.eventbrite.com/d/md--bel-air/cars-and-coffee/', false],
  ['eventbrite', 'https://www.eventbrite.com/d/md--baltimore/car-show/', false],
  ['eventbrite', 'https://www.eventbrite.com/d/md--baltimore/car-meet/', false],
]

async function scanEvents(dry: boolean) {
  const got = await Promise.allSettled(EVENT_SOURCES.map(([, u]) => getText(u)))
  const errors: string[] = [], seen = new Map<string, Ev>()
  let read = 0
  got.forEach((g, i) => {
    const [site, url, free] = EVENT_SOURCES[i]
    if (g.status === 'rejected') { errors.push(`${url}: ${g.reason?.message ?? g.reason}`); return }
    for (const e of ldEvents(g.value)) {
      read++
      const ev = toEv(e, site, free); if (!ev) continue
      if (+ev.starts < Date.now() - 864e5 || +ev.starts > Date.now() + 75 * 864e5) continue
      const o = seen.get(ev.key)
      if (!o) seen.set(ev.key, ev); else { o.free ||= ev.free; o.car ||= ev.car; o.image ||= ev.image }
    }
  })
  const rows = [...seen.values()].map((e) => ({
    kind: 'event', source: 'event', ext_id: e.key, title: e.title, url: e.url, starts_at: e.starts.toISOString(), ends_at: e.ends?.toISOString() ?? null, all_day: e.allDay,
    venue: e.venue, town: e.town, free: e.free, category: e.car ? 'car' : 'community', score: e.car ? 80 : e.free ? 60 : 40,
    reason: [e.car ? 'Car meet or show' : 'Community', e.free ? 'Free' : null, e.site === 'eventbrite' ? 'Eventbrite' : 'AllEvents'].filter(Boolean).join(' · '),
    image: e.image, last_seen: new Date().toISOString(),
  }))
  if (dry) return { ok: true, dry: true, errors, read, kept: rows.length, rows: rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }
  if (rows.length) { const { error } = await admin.from('radar_items').upsert(rows, { onConflict: 'source,ext_id' }); if (error) return { ok: false, error: error.message } }
  return { ok: true, read, kept: rows.length, errors }
}

// ── digests: 8:00 New York daily (new events), Friday 16:00 (this weekend) ─
const evLine = (r: any) => {
  const d = new Date(r.starts_at)
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })
  const time = r.all_day ? '' : ' ' + d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).replace(':00', '')
  return `${clip(r.title, 48)} (${day}${time}, ${r.town})`
}
async function digest(which: string, force: boolean) {
  const P = await prefs(), now = ny()
  const want = which === 'weekend' ? now.wd === 'Fri' && now.hour === 16 : now.hour === 8
  if (!force && !want) return { skipped: `not ${which} time in New York (${now.wd} ${now.hour}:00)` }
  if (!force && P.sent?.[which] === now.date) return { skipped: `${which} already sent today` }
  if (!P.events_push) return { skipped: 'event pushes off' }
  let q = admin.from('radar_items').select('id, title, starts_at, all_day, town, category, free').eq('kind', 'event').is('dismissed_at', null)
  if (which === 'weekend') {
    // the coming Saturday and Sunday (on a Sunday: today), whatever day it runs on
    const toSat = now.wd === 'Sun' ? -1 : (6 - ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(now.wd))
    const sat = new Date(nyAt(now.date, 12).getTime() + toSat * 864e5), sun = new Date(sat.getTime() + 864e5)
    q = q.gte('starts_at', nyAt(ny(sat).date, 0).toISOString()).lte('starts_at', nyAt(ny(sun).date, 23, 59).toISOString())
  } else {
    q = q.is('pushed_at', null).gte('first_seen', new Date(Date.now() - 26 * 3600e3).toISOString()).gte('starts_at', new Date().toISOString())
  }
  const { data } = await q.order('category', { ascending: true }).order('starts_at', { ascending: true }).limit(12)
  const list = (data ?? []).sort((a, b) => (a.category === 'car' ? 0 : 1) - (b.category === 'car' ? 0 : 1) || a.starts_at.localeCompare(b.starts_at))
  await admin.from('radar_prefs').update({ sent: { ...(P.sent ?? {}), [which]: now.date } }).eq('id', 1)
  if (!list.length) return { sent: 0 }
  const top = list.slice(0, 3)
  const title = which === 'weekend' ? `This weekend near you: ${list.length} ${list.length === 1 ? 'event' : 'events'}` : `${list.length} new near you`
  const body = top.map(evLine).join(' · ') + (list.length > 3 ? ` · +${list.length - 3} more` : '')
  const r = await push(title, body, '/echelon/admin/?view=events')
  if (which === 'morning' && !(r as any).error) await admin.from('radar_items').update({ pushed_at: new Date().toISOString() }).in('id', list.map((x) => x.id))
  return { sent: list.length, title, body, result: r }
}

// ── who may call ───────────────────────────────────────────────────────────
async function isOwner(req: Request) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const { data } = await admin.auth.getUser(jwt)
  return data?.user?.id === OWNER
}

Deno.serve(async (req) => {
  const CORS = corsFor(req)
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', ...CORS } })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const bySecret = !!SECRET && req.headers.get('x-webhook-secret') === SECRET
  if (!bySecret && !(await isOwner(req))) return json({ error: 'unauthorized' }, 401)
  let body: { scan?: string; digest?: string; dry?: boolean; force?: boolean; test_push?: boolean } = {}
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  try {
    if (body.test_push) return json(await push('Radar is on', 'Deals and events near Joppa and Bel Air will land here. Admin > Radar has the full list.', '/echelon/admin/?view=deals'))
    if (body.scan === 'deals') return json(await scanDeals(!!body.dry))
    if (body.scan === 'events') return json(await scanEvents(!!body.dry))
    if (body.digest === 'morning' || body.digest === 'weekend') return json(await digest(body.digest, !!body.force && bySecret))
    return json({ error: 'scan (deals | events), digest (morning | weekend) or test_push required' }, 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
