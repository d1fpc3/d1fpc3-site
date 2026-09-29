// Echelon | send-push
//
// One delivery function, three triggers, all authenticated by the
// x-webhook-secret header (verify_jwt = false):
//
//   { message_id }       push_on_message trigger — a new chat message. Works
//                        out the recipients (DM partner / everyone in the
//                        room minus the sender), honors notify_prefs.
//   { notification_id }  notify(): a like, comment, reply, mention, follow,
//                        new post from someone followed, or a reaction on a
//                        chat message landed in the inbox; ping the one
//                        recipient by their notify_prefs.activity rule for
//                        that kind (off / people they follow / everyone).
//   Pause all: notify_prefs.paused_until ahead of now keeps every push away.
//   { gex_sheet: true }  pg_cron at 08:30 New York — the day's GEX sheet to
//                        every active D1 GEX holder with `gex` on.
//   { gex_refresh }      the tos-gex TV refresh just published a slot
//                        ('open' | 'mid' | 'close') — tell every active D1
//                        GEX holder with `gex_refresh` on which gamma regime
//                        printed. Once per slot per day.
//   { news_check: true } pg_cron every 15 min on weekdays — red-folder USD
//                        news ~30 minutes out, honors notify_prefs.news.
//   { sweep_check }      pg_cron every 5 min in futures hours — NQ (TradingView
//                        scanner, Yahoo fallback) vs the
//                        LIT levels (Asia 18:00–01:00 ET, prev day/week/
//                        month H/L); pushes holders of notify_prefs.sweeps
//                        when one is first traded through, once per level
//                        per 18:00-ET session. { seed: true }
//                        records without pushing.
//   { gex_alerts: true } pg_cron every minute on weekdays: each member's custom
//                        GEX alerts (gex_alerts rows), pushed on the edge.
//                        { test_user } evaluates one member off-hours.
//
// Delivery: APNs for the iOS shell (push_tokens) and Web Push for browsers /
// the PWA (push_subscriptions, VAPID). Dead endpoints are pruned.
//
// Secrets: PUSH_WEBHOOK_SECRET, APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY,
// APNS_BUNDLE_ID, APNS_PRODUCTION, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY')
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'com.d1fpc3.trading'
const APNS_HOST = Deno.env.get('APNS_PRODUCTION') === 'true'
  ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@d1fpc3.com'
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const APP_PATH = '/echelon/app/'

// ── APNs provider token, cached for the isolate's life (Apple wants ≤1/20min)
let _jwt: string | null = null
let _jwtExp = 0
let _jwtInFlight: Promise<string | null> | null = null
async function mintJwt(): Promise<string | null> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) return null
  const pem = APNS_PRIVATE_KEY.replace(/\\n/g, '\n')
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  _jwt = await create({ alg: 'ES256', kid: APNS_KEY_ID }, { iss: APNS_TEAM_ID, iat: getNumericDate(0) }, key)
  _jwtExp = Date.now() / 1000 + 3600
  return _jwt
}
async function apnsJwt(): Promise<string | null> {
  if (_jwt && Date.now() / 1000 < _jwtExp - 60) return _jwt
  if (_jwtInFlight) return _jwtInFlight
  _jwtInFlight = mintJwt().finally(() => { _jwtInFlight = null })
  return _jwtInFlight
}
const ERRORS: string[] = []

async function sendApns(token: string, title: string, body: string, path: string): Promise<'ok' | 'dead' | 'fail'> {
  const jwt = await apnsJwt()
  if (!jwt) return 'fail'
  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, path }),
  })
  if (res.ok) return 'ok'
  const text = await res.text()
  ERRORS.push(`apns ${res.status} ${text.slice(0, 120)}`)
  return res.status === 410 ? 'dead' : 'fail'
}

async function sendWeb(sub: { endpoint: string; p256dh: string; auth: string }, title: string, body: string, path: string): Promise<'ok' | 'dead' | 'fail'> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 'fail'
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body, path }),
      { TTL: 3600 },
    )
    return 'ok'
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    ERRORS.push(`web ${code ?? ''} ${String((e as Error).message ?? e).slice(0, 120)}`)
    return code === 404 || code === 410 ? 'dead' : 'fail'
  }
}

// Fan out one notification to a set of users over both transports. Anyone on Pause all
// (notify_prefs.paused_until still ahead) is left out, whatever sent it.
async function deliver(userIds: string[], title: string, body: string, path: string) {
  if (userIds.length) {
    const { data: paused } = await admin.from('notify_prefs').select('user_id').in('user_id', userIds).gt('paused_until', new Date().toISOString())
    if (paused?.length) { const off = new Set(paused.map((p) => p.user_id)); userIds = userIds.filter((id) => !off.has(id)) }
  }
  if (!userIds.length) return { sent: 0, devices: 0 }
  const [{ data: tokens }, { data: subs }] = await Promise.all([
    admin.from('push_tokens').select('user_id, token').eq('platform', 'apns').in('user_id', userIds),
    admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', userIds),
  ])
  let sent = 0
  const deadTokens: string[] = [], deadSubs: string[] = []
  await Promise.all([
    ...(tokens ?? []).map(async ({ token }) => {
      const r = await sendApns(token, title, body, path)
      if (r === 'ok') sent++; else if (r === 'dead') deadTokens.push(token)
    }),
    ...(subs ?? []).map(async (s) => {
      const r = await sendWeb(s, title, body, path)
      if (r === 'ok') sent++; else if (r === 'dead') deadSubs.push(s.endpoint)
    }),
  ])
  if (deadTokens.length) await admin.from('push_tokens').delete().in('token', deadTokens)
  if (deadSubs.length) await admin.from('push_subscriptions').delete().in('endpoint', deadSubs)
  return { sent, devices: (tokens?.length ?? 0) + (subs?.length ?? 0) }
}

// alerts: per-alert off switches, absent = on (gex_open/mid/close, sweep_*)
// activity: one rule per social kind, absent = ACTIVITY_DEFAULT ('off' | 'following' | 'everyone', or 'off' | 'on')
type Prefs = { ann: boolean; dm: boolean; chat: boolean; gex: boolean; social: boolean; news: boolean; sweeps: boolean; alerts: Record<string, boolean>; channels: Record<string, string>; activity: Record<string, string> }
const DEFAULT_PREFS: Prefs = { ann: true, dm: true, chat: false, gex: true, social: true, news: true, sweeps: true, alerts: {}, channels: {}, activity: {} }
const ACTIVITY_DEFAULT: Record<string, string> = { like: 'everyone', comment: 'everyone', reply: 'everyone', mention: 'everyone', follow: 'on', post: 'on', reaction: 'on' }
async function prefsFor(ids: string[]) {
  const { data } = await admin.from('notify_prefs').select('user_id, ann, dm, chat, gex, social, news, sweeps, alerts, channels, activity').in('user_id', ids)
  const map = new Map<string, Prefs>()
  for (const p of data ?? []) map.set(p.user_id, { ...DEFAULT_PREFS, ...p })
  return (uid: string) => map.get(uid) ?? DEFAULT_PREFS
}

// ── the vol side of the GEX read: gex-worker /vol.json (VXN, the VIX curve, VXN against its year)
type Vol = { vxn?: { last?: number; chg?: number; chgPct?: number }; vix?: { last?: number; chgPct?: number }; vix3m?: { last?: number }; trend?: string; level?: { label?: string; pct?: number } | null; term?: { state?: string } | null; dailySd?: number }
async function getVol(): Promise<Vol | null> {
  try { const r = await fetch('https://gex-worker.d1fpc3.workers.dev/vol.json', { headers: { 'cache-control': 'no-store' } }); return r.ok ? await r.json() as Vol : null } catch { return null }
}
// "HIGH" / "EXTREME" shout on purpose: that is the part a member needs at a glance
const ord = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
const volWord = (v: Vol | null) => { const l = v?.level?.label; return !l ? '' : l === 'high' || l === 'extreme' ? l.toUpperCase() : l }
function volLine(v: Vol | null, nq?: number): string {
  if (!v?.vxn?.last) return ''
  const lv = v.level?.label ? ` ${volWord(v)} for its year (${ord(v.level.pct!)} pct)` : ''
  const dir = v.trend === 'rising' ? ', rising' : v.trend === 'falling' ? ', falling' : ', steady'
  const sd = v.dailySd && nq ? ` · 1σ ±${Math.round(nq * v.dailySd).toLocaleString('en-US')} pts` : ''
  const curve = v.term?.state === 'stressed' ? ' · VIX curve inverted' : ''
  return `Vol: VXN ${v.vxn.last.toFixed(1)}${lv}${dir}${sd}${curve}`
}
// live NQ from TradingView's futures scanner (the same read sweep_check trusts)
async function futLive(ticker = 'CME_MINI:NQ1!'): Promise<number | null> {
  try {
    const r = await fetch('https://scanner.tradingview.com/futures/scan', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
      body: JSON.stringify({ symbols: { tickers: [ticker] }, columns: ['close'] }),
    })
    const c = r.ok ? (await r.json())?.data?.[0]?.d?.[0] : null
    return typeof c === 'number' ? c : null
  } catch { return null }
}
const nqLive = () => futLive('CME_MINI:NQ1!')
// the two gamma books (D1, 09-29: "customizable notifications for gamma for ES and NQ"): the same board shape,
// futures prices in the `nq` fields for both (gex.json?book=es), ES read against the VIX where NQ reads the VXN
const BOOKS = { nq: { fut: 'NQ', q: '', live: 'CME_MINI:NQ1!', vix: 'VXN' }, es: { fut: 'ES', q: '?book=es', live: 'CME_MINI:ES1!', vix: 'VIX' } } as const
type Book = keyof typeof BOOKS
const gexBoard = (b: Book) => fetch(`https://gex-worker.d1fpc3.workers.dev/gex.json${BOOKS[b].q}`, { headers: { 'cache-control': 'no-store' } })

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)

  let body: { kalshi?: { title?: string; body?: string; path?: string }; message_id?: string; notification_id?: string; gex_sheet?: boolean; gex_refresh?: string | boolean; news_check?: boolean; sweep_check?: boolean; seed?: boolean; gex_alerts?: boolean; test_user?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  // ── a like / comment / follow ────────────────────────────────────
  if (body.notification_id) {
    const { data: n } = await admin.from('notifications')
      .select('id, user_id, kind, actor_id, recap_id, body').eq('id', body.notification_id).maybeSingle()
    if (!n) return json({ ok: true, skipped: 'no such notification' })
    const pref = await prefsFor([n.user_id])
    const p = pref(n.user_id)
    if (!p.social) return json({ ok: true, muted: 1 })
    // replies and mentions ride on the comment and system kinds; their body says which
    const body0 = n.body || ''
    const act = n.kind === 'comment' && body0.startsWith('replied: ') ? 'reply'
      : n.kind === 'system' && body0.startsWith('mentioned you') ? 'mention'
      : n.kind
    const rule = p.activity?.[act] ?? ACTIVITY_DEFAULT[act] ?? 'everyone'
    if (rule === 'off') return json({ ok: true, muted: 1, rule: act })
    if (rule === 'following' && n.actor_id) {
      const { data: f } = await admin.from('follows').select('follower_id').eq('follower_id', n.user_id).eq('followee_id', n.actor_id).maybeSingle()
      if (!f) return json({ ok: true, muted: 1, rule: `${act}:following` })
    }
    const { data: actor } = n.actor_id ? await admin.from('profiles').select('username').eq('user_id', n.actor_id).maybeSingle() : { data: null }
    const who = actor?.username ? `@${actor.username}` : 'Someone'
    const emoji = act === 'reaction' ? body0.split(' ')[0] : ''
    const title = act === 'like' ? `${who} liked your post`
      : act === 'comment' ? `${who} commented on your post`
      : act === 'reply' ? `${who} replied to your comment`
      : act === 'mention' ? `${who} mentioned you`
      : act === 'follow' ? `${who} started following you`
      : act === 'post' ? `${who} shared a post`
      : act === 'reaction' ? `${who} reacted ${emoji} to your message`
      : 'Echelon'
    const text = act === 'comment' || act === 'post' ? body0
      : act === 'reply' ? body0.replace(/^replied: /, '')
      : act === 'mention' ? body0.replace(/^mentioned you /, '')
      : act === 'reaction' ? body0.slice(emoji.length).trim()
      : act === 'follow' ? 'Tap to see their profile.'
      : act === 'like' ? 'Tap to open it.'
      : body0 || 'Tap to open it.'
    const path = act === 'reaction' || (act === 'mention' && !n.recap_id) ? `${APP_PATH}?start=chat`
      : n.recap_id ? `${APP_PATH}?p=${n.recap_id}` : n.actor_id ? `${APP_PATH}?u=${encodeURIComponent(actor?.username ?? '')}` : APP_PATH
    const r = await deliver([n.user_id], title, text, path)
    return json({ ok: true, kind: n.kind, ...r, errors: ERRORS.splice(0, 5) })
  }

  // ── red-folder USD news, ~30 minutes out ──────────────────────────
  if (body.news_check) {
    const res = await fetch('https://forex-factory-discord.frankiepc3.workers.dev/calendar.json', { headers: { 'cache-control': 'no-store' } })
    if (!res.ok) return json({ ok: false, error: `calendar ${res.status}` }, 502)
    const rows = await res.json() as { title?: string; country?: string; impact?: string; date?: string }[]
    const now = Date.now()
    const soon = (Array.isArray(rows) ? rows : []).filter((e) => {
      if (e.country !== 'USD' || e.impact !== 'High' || !e.date) return false
      const t = new Date(e.date).getTime()
      return t - now > 14 * 60_000 && t - now <= 31 * 60_000
    })
    if (!soon.length) return json({ ok: true, skipped: 'no red news in the window' })
    // once per event per day: the inbox rows double as the dedupe ledger
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
    const { data: sent } = await admin.from('notifications').select('body').eq('kind', 'news').gte('created_at', dayStart.toISOString()).limit(200)
    const seen = (sent ?? []).map((x) => x.body ?? '')
    const fresh = soon.filter((e) => !seen.some((b) => b.includes(e.title ?? '')))
    if (!fresh.length) return json({ ok: true, skipped: 'already sent' })
    // everyone holding a push destination who hasn't switched news off
    const [{ data: toks }, { data: subs }] = await Promise.all([
      admin.from('push_tokens').select('user_id'),
      admin.from('push_subscriptions').select('user_id'),
    ])
    const ids = [...new Set([...(toks ?? []), ...(subs ?? [])].map((r) => r.user_id as string).filter(Boolean))]
    const pref = await prefsFor(ids)
    const targets = ids.filter((id) => pref(id).news !== false)
    if (!targets.length) return json({ ok: true, skipped: 'nobody to tell' })
    let delivered = 0
    for (const e of fresh) {
      const at = new Date(e.date!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
      const line = `${e.title} · ${at} ET`
      await admin.from('notifications').insert(targets.map((uid) => ({ user_id: uid, kind: 'news', body: line })))
      const r = await deliver(targets, 'Red folder in ~30 minutes', line, `${APP_PATH}?start=news`)
      delivered += (r as { sent?: number }).sent ?? 0
    }
    return json({ ok: true, events: fresh.length, targets: targets.length, delivered, errors: ERRORS.splice(0, 5) })
  }

  // ── NQ liquidity sweeps: Asia / day / week / month levels ─────────
  // D1-LIT conventions: the session day rolls at 18:00 ET, Asia is
  // 18:00–01:00 ET. A level alerts once, when THIS session is the first to
  // trade through it; { seed: true } records today's already-swept levels
  // without pushing (first-run quiet).
  if (body.sweep_check) {
    const etOf = (ms: number) => {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(ms))
      const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
      return { wd: g('weekday'), date: `${g('year')}-${g('month')}-${g('day')}`, hh: Number(g('hour')) % 24 }
    }
    const now = Date.now()
    const cur = etOf(now)
    const closed = cur.wd === 'Sat' || (cur.wd === 'Sun' && cur.hh < 18) || (cur.wd === 'Fri' && cur.hh >= 17) || cur.hh === 17
    if (closed && !body.seed) return json({ ok: true, skipped: 'futures closed' })

    const yahoo = async (params: string) => {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?${params}`, { headers: { 'user-agent': 'Mozilla/5.0' } })
      if (!r.ok) throw new Error(`yahoo ${r.status}`)
      const j = await r.json()
      const res = j?.chart?.result?.[0]
      const q = res?.indicators?.quote?.[0]
      const out: { t: number; h: number; l: number; c: number }[] = []
      for (let i = 0; i < (res?.timestamp?.length ?? 0); i++) {
        if (q.high[i] == null || q.low[i] == null) continue
        out.push({ t: res.timestamp[i] * 1000, h: q.high[i], l: q.low[i], c: q.close[i] ?? q.high[i] })
      }
      return out
    }
    // TradingView's futures scanner is the primary read for the session
    // itself: `high`/`low`/`close` are the CURRENT CME session (it rolls at
    // 18:00 ET, the LIT day), `high[1]`/`low[1]` the previous one, and `time`
    // is the session's start. Yahoo drops holiday sessions entirely (Labor
    // Day eve 2026-09-06: price frozen at Friday's close, zero bars), which
    // left the old Yahoo-only read blind, so Yahoo now only feeds Asia (15m
    // bars) and the week/month levels (daily bars), and is the fallback.
    type TV = { high: number; low: number; close: number; pHigh: number; pLow: number; start: number }
    const tradingview = async (): Promise<TV | null> => {
      try {
        const r = await fetch('https://scanner.tradingview.com/futures/scan', {
          method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
          body: JSON.stringify({ symbols: { tickers: ['CME_MINI:NQ1!'] }, columns: ['high', 'low', 'close', 'high[1]', 'low[1]', 'time'] }),
        })
        if (!r.ok) return null
        const d = (await r.json())?.data?.[0]?.d
        if (!Array.isArray(d) || d.slice(0, 6).some((v) => typeof v !== 'number')) return null
        return { high: d[0], low: d[1], close: d[2], pHigh: d[3], pLow: d[4], start: d[5] * 1000 }
      } catch { return null }
    }
    const [tv, yi, yd] = await Promise.all([
      tradingview(),
      yahoo('interval=15m&range=8d').catch(() => null),
      yahoo('interval=1d&range=4mo').catch(() => null),
    ])
    if (!tv && !yi) return json({ ok: false, error: 'no price source (tradingview + yahoo both failed)' }, 502)
    const intraday = yi ?? [], daily = yd ?? []

    // 15m bars into 18:00-ET-rolled sessions
    type Sess = { high: number; low: number; asiaHigh: number; asiaLow: number; postHigh: number; postLow: number; last: number }
    const sessions = new Map<string, Sess>()
    for (const b of intraday) {
      const p = etOf(b.t + 6 * 3600e3) // shift +6h so 18:00 starts the next day
      const hh = etOf(b.t).hh
      const s = sessions.get(p.date) ?? { high: -Infinity, low: Infinity, asiaHigh: -Infinity, asiaLow: Infinity, postHigh: -Infinity, postLow: Infinity, last: b.c }
      s.high = Math.max(s.high, b.h); s.low = Math.min(s.low, b.l); s.last = b.c
      if (hh >= 18 || hh < 1) { s.asiaHigh = Math.max(s.asiaHigh, b.h); s.asiaLow = Math.min(s.asiaLow, b.l) }
      else { s.postHigh = Math.max(s.postHigh, b.h); s.postLow = Math.min(s.postLow, b.l) }
      sessions.set(p.date, s)
    }
    // THIS session's key comes from the clock, never from "the last bar we
    // got". On 2026-09-06 18:00 ET Yahoo had no bar for the new session yet,
    // so the newest bucket was still Friday, "previous" was Thursday, and
    // Friday's high > Thursday's high fired "Yesterday's high 29,584 ran"
    // with NQ 29,565, then gagged the real PDH for the whole session.
    const HOUR = 3600e3
    let sessStart = now - (now % HOUR) // ET is a whole-hour offset, so this is the ET hour top
    for (let i = 0; i < 30 && etOf(sessStart).hh !== 18; i++) sessStart -= HOUR
    const todayKey = etOf(now + 6 * 3600e3).date
    const keys = [...sessions.keys()].sort()
    const yS = sessions.get(todayKey) ?? null
    const yP = keys.length && keys[keys.length - 1] === todayKey && keys.length >= 2 ? sessions.get(keys[keys.length - 2])! : (keys.length && keys[keys.length - 1] < todayKey ? sessions.get(keys[keys.length - 1])! : null)
    const tvLive = tv && tv.start >= sessStart - HOUR && tv.start <= now
    if (!tvLive && !yS) return json({ ok: true, skipped: 'no bars for this session yet', session: todayKey })
    type Lv = { high: number; low: number; last: number }
    const S: Lv = tvLive ? { high: tv!.high, low: tv!.low, last: tv!.close } : { high: yS!.high, low: yS!.low, last: yS!.last }
    const P: Lv | null = tvLive ? { high: tv!.pHigh, low: tv!.pLow, last: tv!.pHigh } : (yP ? { high: yP.high, low: yP.low, last: yP.last } : null)
    if (!P) return json({ ok: true, skipped: 'no previous session' })
    const asia = yS ?? { asiaHigh: -Infinity, asiaLow: Infinity, postHigh: -Infinity, postLow: Infinity }

    // daily bars into calendar weeks (Mon-anchored) and months
    const dayKey = (ms: number) => etOf(ms + 6 * 3600e3).date
    const today = new Date(`${dayKey(now)}T12:00:00Z`)
    const monday = new Date(today); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
    const wkStart = monday.toISOString().slice(0, 10), wkPrev = new Date(monday.getTime() - 7 * 86400e3).toISOString().slice(0, 10)
    const moStart = dayKey(now).slice(0, 7)
    let pwH = -Infinity, pwL = Infinity, pmH = -Infinity, pmL = Infinity
    for (const b of daily) {
      const d = dayKey(b.t)
      if (d >= wkPrev && d < wkStart) { pwH = Math.max(pwH, b.h); pwL = Math.min(pwL, b.l) }
      const mo = d.slice(0, 7)
      if (mo < moStart && (moStart.slice(0, 4) === mo.slice(0, 4) ? +moStart.slice(5) - +mo.slice(5) === 1 : +moStart.slice(5) === 1 && +mo.slice(5) === 12)) {
        pmH = Math.max(pmH, b.h); pmL = Math.min(pmL, b.l)
      }
    }

    const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
    const asiaDone = cur.hh >= 1 && cur.hh < 17
    const events: { label: string; level: number; key: string }[] = []
    if (asiaDone && asia.asiaHigh > -Infinity && asia.postHigh > asia.asiaHigh) events.push({ label: 'Asia high', level: asia.asiaHigh, key: 'sweep_asia_high' })
    if (asiaDone && asia.asiaLow < Infinity && asia.postLow < asia.asiaLow) events.push({ label: 'Asia low', level: asia.asiaLow, key: 'sweep_asia_low' })
    if (S.high > P.high) events.push({ label: "Yesterday's high", level: P.high, key: 'sweep_pdh' })
    if (S.low < P.low) events.push({ label: "Yesterday's low", level: P.low, key: 'sweep_pdl' })
    if (pwH > -Infinity && S.high > pwH && P.high <= pwH) events.push({ label: "Last week's high", level: pwH, key: 'sweep_pwh' })
    if (pwL < Infinity && S.low < pwL && P.low >= pwL) events.push({ label: "Last week's low", level: pwL, key: 'sweep_pwl' })
    if (pmH > -Infinity && S.high > pmH && P.high <= pmH) events.push({ label: "Last month's high", level: pmH, key: 'sweep_pmh' })
    if (pmL < Infinity && S.low < pmL && P.low >= pmL) events.push({ label: "Last month's low", level: pmL, key: 'sweep_pml' })
    if (!events.length) return json({ ok: true, skipped: 'nothing swept', source: tvLive ? 'tradingview' : 'yahoo', nq: S.last, session: { high: S.high, low: S.low }, prev: { high: P.high, low: P.low } })

    // Once per level per session: the inbox rows are the ledger.
    // The window is THIS SESSION, not a rolling day. A rolling window straddles
    // the 18:00 roll, so yesterday's alert for a label gagged today's genuine
    // sweep of the same label until the window aged out, and the alert then
    // landed on the first tick after expiry instead of when price went through
    // (Asia high traded through 01:00 ET on 2026-09-04, alerted 08:35).
    const since = new Date(sessStart).toISOString()
    const { data: sent } = await admin.from('notifications').select('body').eq('kind', 'sweep').gte('created_at', since).limit(100)
    const seen = (sent ?? []).map((x) => x.body ?? '')
    const fresh = events.filter((e) => !seen.some((b) => b.startsWith(`${e.label} `)))
    if (!fresh.length) return json({ ok: true, skipped: 'already alerted' })

    if (body.seed) {
      // record without pushing, on the owner's inbox
      const { data: adm } = await admin.from('admins').select('user_id').limit(1).maybeSingle()
      if (adm) await admin.from('notifications').insert(fresh.map((e) => ({ user_id: adm.user_id, kind: 'sweep', body: `${e.label} ${fmt(e.level)} ran · NQ ${fmt(S.last)}.` })))
      return json({ ok: true, seeded: fresh.map((e) => e.label) })
    }

    const [{ data: toks }, { data: subs }] = await Promise.all([
      admin.from('push_tokens').select('user_id'),
      admin.from('push_subscriptions').select('user_id'),
    ])
    const ids = [...new Set([...(toks ?? []), ...(subs ?? [])].map((r) => r.user_id as string).filter(Boolean))]
    const pref = await prefsFor(ids)
    let delivered = 0
    for (const e of fresh) {
      const targets = ids.filter((id) => pref(id).sweeps !== false && (pref(id).alerts ?? {})[e.key] !== false)
      if (!targets.length) continue
      const line = `${e.label} ${fmt(e.level)} ran · NQ ${fmt(S.last)}.`
      await admin.from('notifications').insert(targets.map((uid) => ({ user_id: uid, kind: 'sweep', body: line })))
      const r = await deliver(targets, `NQ · ${e.label} swept`, line, APP_PATH)
      delivered += r.sent
    }
    return json({ ok: true, swept: fresh.map((e) => e.label), delivered, source: tvLive ? 'tradingview' : 'yahoo', errors: ERRORS.splice(0, 5) })
  }

  // ── custom GEX alerts (gex_alerts rows, built by each member) ─────
  // pg_cron every minute on weekdays. Each enabled row is evaluated against the live
  // board: it pushes on the EDGE (the condition turning true), never while it stays true,
  // with a 20 minute cooldown per row so price chopping around a line cannot machine-gun
  // a phone. A row's first evaluation only records its state. { test_user } evaluates one
  // member's rows outside the session (the harness); it still needs the webhook secret.
  if (body.gex_alerts) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
    const mins = (Number(g('hour')) % 24) * 60 + Number(g('minute'))
    const open = !['Sat', 'Sun'].includes(g('weekday')) && mins >= 9 * 60 + 30 && mins <= 16 * 60 + 15
    if (!open && !body.test_user) return json({ ok: true, skipped: 'outside the cash session' })

    let q = admin.from('gex_alerts').select('id, user_id, kind, params, last_state, last_fired_at').eq('enabled', true)
    if (body.test_user) q = q.eq('user_id', body.test_user)
    const { data: rows } = await q
    if (!rows?.length) return json({ ok: true, skipped: 'no alerts' })
    // holders only: an alert outlives a lapsed D1 GEX entitlement, the pushes do not
    const [{ data: ents }, { data: adms }] = await Promise.all([
      admin.from('entitlements').select('user_id').eq('product', 'd1-gex').eq('status', 'active').not('user_id', 'is', null),
      admin.from('admins').select('user_id'),
    ])
    const holders = new Set([...(ents ?? []), ...(adms ?? [])].map((e) => e.user_id as string))
    const live = rows.filter((r) => holders.has(r.user_id))
    if (!live.length) return json({ ok: true, skipped: 'no holders with alerts' })

    type Gx = { nq?: number; zdte?: { netGexM?: number; flip?: { nq?: number }; callWall?: { nq?: number }; putWall?: { nq?: number } }; swing?: { flip?: { nq?: number } } }
    // an alert reads its own book (params.book 'es'; absent = NQ); the ES board and price are fetched only when a row asks
    const needEs = live.some((r) => ((r.params ?? {}) as Record<string, unknown>).book === 'es')
    const [gRes, eRes, vol, nqTv, esTv] = await Promise.all([gexBoard('nq'), needEs ? gexBoard('es') : Promise.resolve(null), getVol(), nqLive(), needEs ? futLive(BOOKS.es.live) : Promise.resolve(null)])
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
    const read = (gx: Gx | null, tv: number | null) => {
      const z = gx?.zdte ?? {}, px = tv ?? gx?.nq ?? null
      const flip = z.flip?.nq ?? gx?.swing?.flip?.nq ?? null, cw = z.callWall?.nq ?? null, pw = z.putWall?.nq ?? null, net = z.netGexM ?? null
      // same read as the chart's regime pill
      const regime = px == null || net == null ? null
        : cw != null && pw != null && cw > pw && px > cw ? 'past_call' : cw != null && pw != null && cw > pw && px < pw ? 'past_put'
        : net >= 0 && (flip == null || px >= flip) ? 'damp' : net < 0 && flip != null && px < flip ? 'amp' : 'mixed'
      return { px, flip, cw, pw, regime }
    }
    const RD: Record<Book, ReturnType<typeof read>> = {
      nq: read(gRes.ok ? await gRes.json() as Gx : null, nqTv),
      es: read(eRes && eRes.ok ? await eRes.json() as Gx : null, esTv),
    }
    const vx = vol?.vxn?.last ?? null, vixNow = vol?.vix?.last ?? null

    const COOLDOWN = 20 * 60e3, now = Date.now()
    const fires: { row: typeof live[number]; title: string; line: string }[] = []
    const updates: { id: string; last_state: string; fired: boolean }[] = []
    for (const r of live) {
      const pr = (r.params ?? {}) as Record<string, unknown>
      const bk: Book = pr.book === 'es' ? 'es' : 'nq', F = BOOKS[bk].fut, M = RD[bk]
      const nq = M.px, flip = M.flip, cw = M.cw, pw = M.pw, regime = M.regime
      const LVL: Record<string, [string, number | null]> = { flip: ['the gamma flip', flip], call_wall: ['the call wall', cw], put_wall: ['the put wall', pw] }
      let state: string | null = null, title = '', line = ''
      let edge = (prev: string | null, cur: string) => prev != null && prev !== cur && cur === 'in'
      if (r.kind === 'regime') {
        if (!regime || regime === 'mixed') continue   // "unsettled" never fires and never resets the memory
        state = regime
        edge = (prev, cur) => prev != null && prev !== cur
        const word = { damp: 'Dampening', amp: 'Amplifying', past_call: 'past the call wall', past_put: 'past the put wall' }[regime]
        title = regime === 'damp' || regime === 'amp' ? `${F} · gamma now ${word}` : `${F} · ${word}`
        line = regime === 'damp' ? `${F} ${fmt(nq!)} is above the flip ${flip != null ? fmt(flip) : ''}. Dealer hedging now leans against moves.`
          : regime === 'amp' ? `${F} ${fmt(nq!)} is below the flip ${fmt(flip!)}. Dealer hedging now leans with moves.`
          : regime === 'past_call' ? `${F} ${fmt(nq!)} is above the call wall ${fmt(cw!)}, outside the heaviest call gamma.` : `${F} ${fmt(nq!)} is below the put wall ${fmt(pw!)}, outside the heaviest put gamma.`
      } else if (r.kind === 'level') {
        const [name, lv] = LVL[String(pr.target)] ?? ['', null]
        const pts = Math.max(1, Number(pr.pts) || 20)
        if (nq == null || lv == null) continue
        state = Math.abs(nq - lv) <= pts ? 'in' : 'out'
        title = `${F} · near ${name}`
        line = `${F} ${fmt(nq)} is ${fmt(Math.abs(nq - lv))} pts ${nq >= lv ? 'above' : 'below'} ${name} ${fmt(lv)}.`
      } else if (r.kind === 'vxn_above' || r.kind === 'vxn_below') {
        // NQ reads the VXN, ES the VIX
        const idx = BOOKS[bk].vix, cur = bk === 'es' ? vixNow : vx
        const v = Number(pr.value); if (cur == null || !isFinite(v)) continue
        state = (r.kind === 'vxn_above' ? cur > v : cur < v) ? 'in' : 'out'
        title = r.kind === 'vxn_above' ? `Volatility · ${idx} above ${v}` : `Volatility · ${idx} below ${v}`
        line = bk === 'es'
          ? `The VIX is ${cur.toFixed(2)}${vol?.vix?.chgPct != null ? `, ${vol.vix.chgPct > 0 ? '+' : ''}${vol.vix.chgPct}% on the day` : ''}.`
          : `VXN is ${cur.toFixed(2)}${vol?.level?.label ? `, ${volWord(vol)} for its year (${ord(vol.level.pct!)} pct)` : ''}.${vol?.dailySd && nq ? ` 1σ for a session is ±${fmt(nq * vol.dailySd)} pts.` : ''}`
      } else if (r.kind === 'vol_level') {
        const lab = vol?.level?.label; if (!lab) continue
        const want = pr.to === 'low' ? ['low'] : ['high', 'extreme']
        state = want.includes(lab) ? 'in' : 'out'
        title = pr.to === 'low' ? 'Volatility is LOW' : `Volatility is ${lab.toUpperCase()}`
        line = `VXN ${vx!.toFixed(1)} is in the ${ord(vol!.level!.pct!)} percentile of its last year.${vol!.dailySd && nq ? ` 1σ for a session is now ±${fmt(nq * vol!.dailySd)} pts.` : ''}`
      } else if (r.kind === 'vol_rising') {
        if (!vol?.trend || vx == null) continue
        state = vol.trend === 'rising' ? 'in' : 'out'
        title = 'Volatility · vol turning up'
        line = `VXN ${vx.toFixed(1)}, ${vol.vxn?.chgPct != null ? `${vol.vxn.chgPct > 0 ? '+' : ''}${vol.vxn.chgPct}% on the day` : 'rising'}. Dealers short puts sell futures into rising vol.`
      } else if (r.kind === 'curve') {
        const st = vol?.term?.state; if (!st) continue
        state = st === 'stressed' ? 'in' : 'out'
        title = 'Volatility · VIX curve inverted'
        line = `VIX ${vol!.vix?.last?.toFixed(1)} is above the 3-month VIX ${vol!.vix3m?.last?.toFixed(1)}: the market is paying more for protection now than later.`
      } else continue
      const cooling = r.last_fired_at && now - new Date(r.last_fired_at).getTime() < COOLDOWN
      const fire = edge(r.last_state, state) && !cooling
      if (fire) fires.push({ row: r, title, line })
      if (fire || state !== r.last_state) updates.push({ id: r.id, last_state: state, fired: fire })
    }
    await Promise.all(updates.map((u) => admin.from('gex_alerts').update(u.fired ? { last_state: u.last_state, last_fired_at: new Date().toISOString() } : { last_state: u.last_state }).eq('id', u.id)))
    let delivered = 0
    if (fires.length) {
      await admin.from('notifications').insert(fires.map((f) => ({ user_id: f.row.user_id, kind: 'gex', body: `${f.title.replace(/^(NQ|ES|Volatility) · /, '')}: ${f.line}`.slice(0, 1000) })))
      for (const f of fires) { const r = await deliver([f.row.user_id], f.title, f.line.slice(0, 160), `${APP_PATH}?start=gex`); delivered += r.sent }
    }
    return json({ ok: true, evaluated: live.length, changed: updates.length, fired: fires.map((f) => ({ id: f.row.id, kind: f.row.kind, title: f.title })), delivered, nq: RD.nq.px, regime: RD.nq.regime, es: needEs ? RD.es.px : undefined, esRegime: needEs ? RD.es.regime : undefined, vxn: vx, vix: vixNow, errors: ERRORS.splice(0, 5) })
  }

  // Routine GEX pushes run per BOOK (D1, 09-29: "customizable notifications for gamma for ES and NQ"). NQ keeps its
  // switches (the 8:30 sheet = prefs.gex, a slot = alerts.gex_<slot>, absent = on); ES is opt-in (alerts.gex_es_sheet,
  // alerts.gex_es_<slot>, absent = off), so nobody who never asked for ES gets a second push.
  const gexHolders = async () => {
    const { data: ents } = await admin.from('entitlements').select('user_id').eq('product', 'd1-gex').eq('status', 'active').not('user_id', 'is', null)
    return [...new Set((ents ?? []).map((e) => e.user_id as string))]
  }
  const vixLine = (v: Vol | null) => v?.vix?.last ? `Vol: VIX ${v.vix.last.toFixed(1)}${v.term?.state === 'stressed' ? ' · VIX curve inverted' : ''}` : ''

  // ── a timed GEX refresh landed (tos-gex slot publish) ─────────────
  if (body.gex_refresh) {
    const slot = typeof body.gex_refresh === 'string' ? body.gex_refresh : 'update'
    const base = slot === 'open' ? 'Open update' : slot === 'mid' ? 'Midday update' : slot === 'close' ? 'Close update' : 'GEX update'
    const [nqRes, esRes, vol] = await Promise.all([gexBoard('nq'), gexBoard('es'), getVol()])
    const ids = await gexHolders()
    const pref = await prefsFor(ids)
    const vw = volWord(vol)
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
    const out: Record<string, unknown> = { ok: true, slot }
    for (const bk of ['nq', 'es'] as Book[]) {
      const res = bk === 'nq' ? nqRes : esRes, F = BOOKS[bk].fut
      if (!res.ok) { out[bk] = { error: `gex-worker ${res.status}` }; continue }
      const d = await res.json() as { regime?: string; nq?: number; zdte?: { netGexM?: number } }
      const neg = (d.regime ?? '').startsWith('negative'), net = d.zdte?.netGexM
      // the NQ push reads exactly as before; the ES one names its book up front
      const label = bk === 'nq' ? base : `ES ${base.charAt(0).toLowerCase()}${base.slice(1)}`
      const title = bk === 'nq' ? `GEX refreshed · ${neg ? 'NEGATIVE' : 'POSITIVE'} gamma${vw ? ` · vol ${vw}` : ''}` : `ES GEX refreshed · ${neg ? 'NEGATIVE' : 'POSITIVE'} gamma`
      const vl = bk === 'nq' ? (vol?.vxn?.last ? volLine(vol, d.nq) : '') : vixLine(vol)
      const text = `${label}: ${neg ? 'dealers chase price, moves accelerate' : 'dealers fade price, moves pin'}`
        + (typeof net === 'number' ? ` · 0DTE net ${net > 0 ? '+' : ''}${net}M` : '')
        + (d.nq ? ` · ${F} ${d.nq}` : '')
        + (vl ? `\n${vl}` : '')
      // once per slot per day per book, even if the workflow's backstop cron re-fires
      const { data: had } = await admin.from('notifications').select('id').eq('kind', 'gex')
        .gte('created_at', dayStart.toISOString()).ilike('body', `${label}%`).limit(1)
      if (had?.length) { out[bk] = { skipped: 'already sent for this slot' }; continue }
      const al = (id: string) => pref(id).alerts ?? {}
      const targets = ids.filter((id) => bk === 'nq' ? al(id)[`gex_${slot}`] !== false : al(id)[`gex_es_${slot}`] === true)
      if (targets.length) await admin.from('notifications').insert(targets.map((uid) => ({ user_id: uid, kind: 'gex', body: text.slice(0, 1000) })))
      const r = await deliver(targets, title, text.slice(0, 160), `${APP_PATH}?start=gex`)
      out[bk] = { targets: targets.length, ...r }
    }
    return json({ ...out, errors: ERRORS.splice(0, 5) })
  }

  // ── the morning GEX sheet ─────────────────────────────────────────
  if (body.gex_sheet) {
    const [nqRes, esRes, vol] = await Promise.all([gexBoard('nq'), gexBoard('es'), getVol()])
    // everyone holding D1 GEX right now (mods / owner included via their comped rows)
    const ids = await gexHolders()
    const pref = await prefsFor(ids)
    const vw = volWord(vol)
    const out: Record<string, unknown> = { ok: true }
    for (const bk of ['nq', 'es'] as Book[]) {
      const res = bk === 'nq' ? nqRes : esRes
      if (!res.ok) { out[bk] = { error: `gex-worker ${res.status}` }; continue }
      const d = await res.json() as { levelsText?: string; regime?: string; spot?: number; nq?: number }
      const vl = bk === 'nq' ? volLine(vol, d.nq) : vixLine(vol)
      const sheet = [(d.levelsText || '').trim(), vl].filter(Boolean).join('\n')
      if (!sheet) { out[bk] = { skipped: 'no sheet yet' }; continue }
      const targets = ids.filter((id) => bk === 'nq' ? pref(id).gex : (pref(id).alerts ?? {}).gex_es_sheet === true)
      // the inbox copy, so the sheet is there even if the push never lands
      if (targets.length) await admin.from('notifications').insert(targets.map((uid) => ({ user_id: uid, kind: 'gex', body: sheet.slice(0, 1000) })))
      const title = bk === 'nq' ? `D1 GEX · today's sheet${vw ? ` · vol ${vw}` : ''}` : `D1 GEX · today's ES sheet`
      const r = await deliver(targets, title, [vl, (d.levelsText || '').trim()].filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 160), `${APP_PATH}?start=gex`)
      out[bk] = { targets: targets.length, ...r }
    }
    return json({ ...out, errors: ERRORS.splice(0, 5) })
  }

  // ── a chat message ────────────────────────────────────────────────
  // ── Kalshi bot: a trade on D1 own account, pushed to the admins who own it ──────
  if (body.kalshi) {
    const k = body.kalshi
    if (!k.title || !k.body) return json({ error: 'kalshi needs title and body' }, 400)
    const { data: admins } = await admin.from('admins').select('user_id')
    const ids = (admins ?? []).map((r) => r.user_id)
    if (!ids.length) return json({ ok: true, skipped: 'no admins' })
    const r = await deliver(ids, String(k.title).slice(0, 80), String(k.body).slice(0, 300), k.path ? String(k.path) : APP_PATH)
    return json({ ok: true, kind: 'kalshi', ...r, errors: ERRORS.splice(0, 5) })
  }
  if (!body.message_id) return json({ error: 'message_id, notification_id, gex_sheet or kalshi required' }, 400)
  const { data: m } = await admin.from('messages')
    .select('id, user_id, channel_id, dm_id, body, image_url, deleted_at')
    .eq('id', body.message_id).maybeSingle()
  if (!m || m.deleted_at) return json({ ok: true, skipped: 'no such message' })

  const { data: senderProfile } = await admin.from('profiles').select('username').eq('user_id', m.user_id).maybeSingle()
  const who = senderProfile?.username ?? 'A member'

  let recipients: string[] = []
  let kind: 'ann' | 'dm' | 'chat' = 'chat'
  let title = ''
  if (m.dm_id) {
    const { data: dm } = await admin.from('dm_threads').select('user_lo, user_hi').eq('id', m.dm_id).maybeSingle()
    if (!dm) return json({ ok: true, skipped: 'no thread' })
    recipients = [dm.user_lo === m.user_id ? dm.user_hi : dm.user_lo]
    kind = 'dm'
    title = `${who} · direct message`
  } else if (m.channel_id) {
    const { data: ch } = await admin.from('channels').select('name, kind, staff_only').eq('id', m.channel_id).maybeSingle()
    if (!ch) return json({ ok: true, skipped: 'no channel' })
    kind = ch.kind === 'announcement' ? 'ann' : 'chat'
    title = kind === 'ann' ? 'Echelon · Announcement' : `${who} · #${ch.name}`
    // everyone with any device, minus the sender; staff rooms stay staff
    const [{ data: tokRows }, { data: subRows }] = await Promise.all([
      admin.from('push_tokens').select('user_id').neq('user_id', m.user_id),
      admin.from('push_subscriptions').select('user_id').neq('user_id', m.user_id),
    ])
    let ids = [...new Set([...(tokRows ?? []), ...(subRows ?? [])].map((r) => r.user_id as string))]
    if (ch.staff_only && ids.length) {
      const [{ data: mods }, { data: admins }] = await Promise.all([
        admin.from('mods').select('user_id').in('user_id', ids),
        admin.from('admins').select('user_id').in('user_id', ids),
      ])
      const staff = new Set([...(mods ?? []), ...(admins ?? [])].map((r) => r.user_id))
      ids = ids.filter((id) => staff.has(id))
    }
    recipients = ids
  } else {
    return json({ ok: true, skipped: 'no destination' })
  }
  if (!recipients.length) return json({ ok: true, sent: 0 })

  const pref = await prefsFor(recipients)
  const wants = (uid: string) => {
    const p = pref(uid)
    const rule = m.channel_id ? p.channels?.[m.channel_id] : undefined
    if (rule === 'off') return false
    if (rule === 'on') return true
    return !!p[kind]
  }
  const targets = recipients.filter(wants)
  if (!targets.length) return json({ ok: true, sent: 0, muted: recipients.length })
  const text = (m.body || '').replace(/\s+/g, ' ').trim().slice(0, 110) || (m.image_url ? 'Sent a chart.' : 'Sent a message.')
  const r = await deliver(targets, title, text, `${APP_PATH}?start=chat`)
  return json({ ok: true, kind, ...r, errors: ERRORS.splice(0, 5) })
})
