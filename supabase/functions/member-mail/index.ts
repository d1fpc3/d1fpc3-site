// Echelon | member-mail
//
// The email side of the engagement loop (D1, 2026-10-01: "implement all of that"). Email is the one channel that
// reaches every member with no opt-in: on 2026-09-30, 0 of 15 members had pushes on.
//
//   { digest: true }        Sunday 6 PM New York (cron member-mail-digest): the week ahead. NQ gamma going in, d1's
//                           announcements, the member's next lesson and pace, the next live session.
//                           notify_prefs.alerts.email_digest (absent = on).
//   { nudge: true }         weekdays 11 AM New York (cron member-mail-nudge): a member who has finished no lesson
//                           in 7 days and is not done with the course gets their next lesson, at most once every 14
//                           days. alerts.email_nudge (absent = on).
//   { preview, email }      preview = 'digest' | 'nudge': the HTML that member would get, sent nowhere (harness).
//   { test, email, to }     sends one to `to`, which must be an admin's address; logged as kind 'test'.
//   GET|POST ?u=<token>     unsubscribe, answered in JSON: the footer links to d1fpc3.com/echelon/email/, which
//                           calls this (Supabase serves no HTML from functions), and List-Unsubscribe (RFC 8058
//                           one-click POST) calls it directly.
//
// Sender: Gmail SMTP (denomailer) as ECHELON_SMTP_USER with ECHELON_SMTP_PASS (a Google app password). Until both
// exist every send returns { skipped: 'no SMTP' }; previews still work. Test and staff accounts never get mail.
// Auth: x-webhook-secret = PUSH_WEBHOOK_SECRET (verify_jwt = false); the unsubscribe carries its own signed token.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const SMTP_USER = Deno.env.get('ECHELON_SMTP_USER') ?? ''
const SMTP_PASS = (Deno.env.get('ECHELON_SMTP_PASS') ?? '').replace(/\s+/g, '')
const FROM = Deno.env.get('ECHELON_MAIL_FROM') || SMTP_USER
const SITE = 'https://d1fpc3.com'
const APP = `${SITE}/echelon/app/`
const FN = `${Deno.env.get('SUPABASE_URL')}/functions/v1/member-mail`
const GEX = 'https://gex-worker.d1fpc3.workers.dev'
const TEST_EMAIL = /@d1fpc3\.test$|^appreview/i

type Kind = 'digest' | 'nudge'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,3}\s+/gm, '').replace(/^[-*]\s+/gm, '• ').replace(/\n{2,}/g, '\n').trim()
const int = (n: unknown) => (typeof n === 'number' && isFinite(n) ? Math.round(n).toLocaleString('en-US') : '')

// ── the unsubscribe token: uid.kind.sig, HMAC-SHA256 under the webhook secret (it never leaves the server) ──
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function sign(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))).slice(0, 32)
}
const unsubToken = async (uid: string, kind: Kind) => `${uid}.${kind}.${await sign(`${uid}.${kind}`)}`
async function unsubscribe(token: string) {
  const [uid, kind, sig] = token.split('.')
  if (!uid || !['digest', 'nudge'].includes(kind) || !sig || sig !== await sign(`${uid}.${kind}`)) return false
  const { data: cur } = await admin.from('notify_prefs').select('alerts').eq('user_id', uid).maybeSingle()
  const alerts = { ...((cur?.alerts as Record<string, boolean>) ?? {}), [`email_${kind}`]: false }
  const { error } = cur
    ? await admin.from('notify_prefs').update({ alerts, updated_at: new Date().toISOString() }).eq('user_id', uid)
    : await admin.from('notify_prefs').insert({ user_id: uid, alerts })
  return !error
}
// ── who gets mail: active course members, not staff, not test accounts ──
type Member = { uid: string; email: string; name: string }
async function members(): Promise<Member[]> {
  const [{ data: ents }, { data: mods }, { data: admins }] = await Promise.all([
    admin.from('entitlements').select('user_id, email').eq('product', 'course').eq('status', 'active').not('user_id', 'is', null),
    admin.from('mods').select('user_id'), admin.from('admins').select('user_id'),
  ])
  const staff = new Set([...(mods ?? []), ...(admins ?? [])].map((r) => r.user_id as string))
  const byUid = new Map<string, string>()
  for (const e of ents ?? []) if (!staff.has(e.user_id) && e.email && !TEST_EMAIL.test(e.email)) byUid.set(e.user_id as string, String(e.email).toLowerCase())
  const ids = [...byUid.keys()]
  const { data: profs } = ids.length ? await admin.from('profiles').select('user_id, username').in('user_id', ids) : { data: [] }
  const names = new Map((profs ?? []).map((p) => [p.user_id as string, p.username as string]))
  return ids.map((uid) => ({ uid, email: byUid.get(uid)!, name: names.get(uid) || '' }))
}

// ── the week's shared parts, read once per run ──
type Shared = Awaited<ReturnType<typeof shared>>
async function shared() {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [{ data: mods }, { data: lessons }, { data: annCh }, gexRes, { data: lives }] = await Promise.all([
    admin.from('modules').select('id, title, position').eq('is_published', true).order('position'),
    admin.from('lessons').select('id, module_id, title, summary, position').eq('is_published', true).order('position'),
    admin.from('channels').select('id').eq('kind', 'announcement').eq('is_active', true).order('position').limit(1),
    fetch(`${GEX}/gex.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    admin.from('live_sessions').select('title, starts_at, duration_min, repeat_weekly').is('canceled_at', null),
  ])
  const modList = mods ?? []
  const order = modList.flatMap((m, i) => (lessons ?? []).filter((l) => l.module_id === m.id).map((l, k, arr) => ({ ...l, chapter: i + 1, chapterTitle: m.title, k: k + 1, of: arr.length })))
  let ann: { body: string; at: string }[] = []
  if (annCh?.[0]) {
    const { data } = await admin.from('messages').select('body, created_at').eq('channel_id', annCh[0].id).is('deleted_at', null).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(3)
    ann = (data ?? []).filter((m) => m.body).map((m) => ({ body: plain(m.body as string), at: m.created_at as string }))
  }
  const now = Date.now()
  const next = (lives ?? []).map((s) => {
    const t = Date.parse(s.starts_at), end = t + s.duration_min * 60000
    const at = !s.repeat_weekly || end > now ? t : t + 7 * 86400000 * Math.ceil((now - end) / (7 * 86400000))
    return { title: s.title as string, at }
  }).filter((s) => s.at > now).sort((a, b) => a.at - b.at)[0] ?? null
  return { order, ann, gex: gexRes as Record<string, any> | null, live: next }
}

// ── one member's part ──
async function personal(m: Member, S: Shared) {
  const [{ data: prog }, { data: onb }, { data: days }] = await Promise.all([
    admin.from('progress').select('lesson_id, completed_at').eq('user_id', m.uid).not('completed_at', 'is', null),
    admin.from('member_onboarding').select('flags').eq('user_id', m.uid).maybeSingle(),
    admin.from('member_days').select('day').eq('user_id', m.uid).gte('day', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ])
  const done = new Set((prog ?? []).map((p) => p.lesson_id as string))
  const last = Math.max(0, ...(prog ?? []).map((p) => Date.parse(p.completed_at as string)))
  const next = S.order.find((l) => !done.has(l.id)) ?? null
  const pace = Number(((onb?.flags ?? {}) as { study?: { pace?: number } }).study?.pace) || 0
  return { done: S.order.filter((l) => done.has(l.id)).length, total: S.order.length, next, pace, last, opened: (days ?? []).length }
}

// ── the email, in the app's colours: warm black, gold, Inter-ish system type. Tables and inline styles only ──
const nyFmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', ...o })
function frame(pre: string, inner: string, unsub: string, why: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>Echelon</title></head>
<body style="margin:0;padding:0;background:#0b0a08;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a08;"><tr><td align="center" style="padding:28px 14px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f2ede3;">
<tr><td style="padding:0 6px 22px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${SITE}/echelon/assets/logo-mark.png" width="36" height="36" alt="" style="display:block;border-radius:9px;"></td>
<td style="vertical-align:middle;padding-left:11px;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#f2ede3;">Echelon <span style="font-weight:500;color:#8f8676;">by d1</span></td></tr></table></td></tr>
${inner}
<tr><td style="padding:26px 6px 0;font-size:12.5px;line-height:1.6;color:#7d7566;">${esc(why)} <a href="${unsub}" style="color:#a49c8c;">Turn this email off</a> · <a href="${APP}?start=notifs" style="color:#a49c8c;">Email settings</a></td></tr>
</table></td></tr></table></body></html>`
}
const card = (label: string, body: string) => `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16130e;border:1px solid #2a251c;border-radius:16px;"><tr><td style="padding:18px 20px;">
<div style="font-size:12.5px;font-weight:600;color:#c9a24a;margin:0 0 8px;">${esc(label)}</div>${body}</td></tr></table></td></tr>`
// one gold button per email (the lesson); everything else is a quiet gold link
const link = (href: string, text: string) => `<div style="margin-top:14px;"><a href="${href}" style="font-size:14.5px;font-weight:650;color:#e5c679;text-decoration:none;">${esc(text)} &rarr;</a></div>`
const cut = (t: string, n: number) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n) > n * 0.6 ? t.lastIndexOf(' ', n) : n).replace(/[\s,.;:]+$/, '') + '…'
const button = (href: string, text: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr><td style="border-radius:999px;background:#c9a24a;"><a href="${href}" style="display:inline-block;padding:11px 20px;font-size:14.5px;font-weight:650;color:#141109;text-decoration:none;border-radius:999px;">${esc(text)} &rarr;</a></td></tr></table>`

function lessonBlock(p: Awaited<ReturnType<typeof personal>>) {
  if (!p.next) return `<div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">You finished the course.</div><div style="margin-top:6px;font-size:14.5px;line-height:1.55;color:#a49c8c;">All ${p.total} lessons done. The session breakdowns in the Library are where it keeps going.</div>${link(`${APP}?start=recaps`, 'Open the Library')}`
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
  return `<div style="font-size:13px;color:#8f8676;">Chapter ${String(p.next.chapter).padStart(2, '0')} · lesson ${p.next.k} of ${p.next.of}</div>
<div style="margin-top:4px;font-size:19px;font-weight:700;letter-spacing:-0.02em;line-height:1.3;">${esc(p.next.title)}</div>
${p.next.summary ? `<div style="margin-top:6px;font-size:14.5px;line-height:1.55;color:#a49c8c;">${esc(cut(String(p.next.summary), 220))}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr><td style="height:5px;background:#2a251c;border-radius:5px;"><div style="width:${Math.max(pct, 3)}%;height:5px;background:#c9a24a;border-radius:5px;"></div></td></tr></table>
<div style="margin-top:7px;font-size:12.5px;color:#8f8676;">${p.done} of ${p.total} lessons done${p.pace ? ` · your plan: ${p.pace} a week` : ''}</div>
${button(`${APP}?start=study`, p.done ? 'Continue' : 'Start lesson one')}`
}

function gexBlock(g: Record<string, any> | null) {
  const z = g?.zdte ?? {}
  const lv = [['Flip', z.flip?.nq, '#7b9cff'], ['Call wall', z.callWall?.nq, '#ef6b64'], ['Put wall', z.putWall?.nq, '#34b39a']].filter((x) => typeof x[1] === 'number')
  if (!g || !lv.length) return ''
  const neg = /neg/i.test(String(g.regime ?? ''))
  const cells = lv.map(([k, v, c]) => `<td width="${Math.floor(100 / lv.length)}%" style="padding:0 4px;"><div style="background:#1d1912;border-radius:12px;padding:10px 12px;"><div style="font-size:12px;color:#8f8676;">${k}</div><div style="margin-top:2px;font-size:17px;font-weight:700;color:${c};">${int(v)}</div></div></td>`).join('')
  const when = g.generatedAt ? nyFmt(Date.parse(g.generatedAt), { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET' : ''
  return card('NQ gamma going into the week', `<div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${neg ? '#ef6b64' : '#7fc08a'};">${neg ? 'Negative' : 'Positive'} gamma</div>
<div style="margin-top:4px;font-size:14px;line-height:1.55;color:#a49c8c;">${neg ? 'Dealers chase price, so moves tend to run.' : 'Dealers lean against price, so moves tend to stall into the walls.'} The last print${when ? `, ${when}` : ''}:</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px -4px 0;"><tr>${cells}</tr></table>
<div style="margin-top:10px;font-size:12.5px;color:#8f8676;">Same levels for MNQ. The board reprints every minute from 9:15 on Monday.</div>${link(`${APP}?start=gex`, 'Open the GEX board')}`)
}

async function compose(kind: Kind, m: Member, S: Shared) {
  const p = await personal(m, S)
  const hi = m.name ? `Hey ${esc(m.name)},` : 'Hey,'
  const tok = encodeURIComponent(await unsubToken(m.uid, kind))
  const unsub = `${SITE}/echelon/email/?u=${tok}`, oneClick = `${FN}?u=${tok}`
  if (kind === 'nudge') {
    if (!p.next) return null
    const subject = p.done ? `Your next lesson: ${p.next.title}` : `Lesson one is waiting: ${p.next.title}`
    const inner = `<tr><td style="padding:0 6px 18px;font-size:16px;line-height:1.6;color:#d9d2c3;">${hi} ${p.done ? `you are ${p.done} lessons in. Here is where you left off, about ten minutes of reading.` : 'your training starts with one short lesson. Here it is.'}</td></tr>
${card(p.done ? 'Pick up where you left off' : 'Start here', lessonBlock(p))}
<tr><td style="padding:4px 6px 0;font-size:14px;line-height:1.6;color:#a49c8c;">Want a rhythm? On Today, set 2, 3 or 5 lessons a week and Echelon keeps you on it.</td></tr>`
    const text = `${hi.replace(/&#39;/g, "'")}\n\n${p.done ? `You are ${p.done} lessons in.` : 'Your training starts with one short lesson.'} Next: ${p.next.title}\n${APP}?start=study\n\nTurn this email off: ${unsub}`
    return { subject, html: frame(`Next: ${p.next.title}`, inner, unsub, 'You get this when a week goes by without a lesson, at most every two weeks.'), text, unsub, oneClick }
  }
  const monday = nyFmt(Date.now() + 86400000, { month: 'short', day: 'numeric' })
  const neg = /neg/i.test(String(S.gex?.regime ?? ''))
  const subject = `Week of ${monday}: NQ in ${neg ? 'negative' : 'positive'} gamma${p.next ? ', your next lesson inside' : ''}`
  const annBlock = S.ann.length ? card('From d1 this week', S.ann.map((a, i) => `<div style="${i ? 'margin-top:12px;padding-top:12px;border-top:1px solid #2a251c;' : ''}font-size:14.5px;line-height:1.6;color:#d9d2c3;white-space:pre-line;">${esc(cut(a.body, 320))}</div>`).join('') + link(`${APP}?start=chat`, 'Read it in Echelon')) : ''
  const liveBlock = S.live ? card('Next live session', `<div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">${esc(S.live.title)}</div><div style="margin-top:4px;font-size:14.5px;color:#a49c8c;">${nyFmt(S.live.at, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET. The link opens in the app 15 minutes before.</div>`) : ''
  const you = `<tr><td style="padding:0 6px 18px;font-size:16px;line-height:1.6;color:#d9d2c3;">${hi} here is the week ahead.${p.opened ? ` You opened Echelon on ${p.opened} day${p.opened === 1 ? '' : 's'} last week.` : ''}</td></tr>`
  const inner = you + gexBlock(S.gex) + card(p.next ? 'Your next lesson' : 'Your study', lessonBlock(p)) + liveBlock + annBlock
  const text = `${hi.replace(/&#39;/g, "'")}\n\nThe week ahead in Echelon.\n${S.gex ? `NQ gamma going in: ${neg ? 'negative' : 'positive'}.\n` : ''}${p.next ? `Your next lesson: ${p.next.title}\n${APP}?start=study\n` : ''}${S.live ? `Next live: ${S.live.title}, ${nyFmt(S.live.at, { weekday: 'long', hour: 'numeric', minute: '2-digit' })} ET\n` : ''}\nOpen Echelon: ${APP}\n\nTurn this email off: ${unsub}`
  return { subject, html: frame(subject, inner, unsub, 'You get this every Sunday as an Echelon member.'), text, unsub, oneClick }
}

async function sendAll(kind: Kind, list: Member[], S: Shared, logKind: Kind | 'test' = kind, to?: string) {
  if (!SMTP_USER || !SMTP_PASS) return { skipped: 'no SMTP', would: list.length }
  const smtp = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } })
  let sent = 0
  const errors: string[] = []
  try {
    for (const m of list) {
      const mail = await compose(kind, m, S)
      if (!mail) continue
      const dest = to || m.email
      try {
        await smtp.send({ from: `Echelon by d1 <${FROM}>`, to: dest, subject: mail.subject, content: mail.text, html: mail.html,
          headers: { 'List-Unsubscribe': `<${mail.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
        sent++
        await admin.from('mail_log').insert({ user_id: m.uid, email: dest, kind: logKind, ok: true })
      } catch (e) {
        const msg = String((e as Error).message ?? e).slice(0, 300)
        errors.push(`${dest}: ${msg}`)
        await admin.from('mail_log').insert({ user_id: m.uid, email: dest, kind: logKind, ok: false, error: msg })
      }
    }
  } finally { try { await smtp.close() } catch { /* closed */ } }
  return { sent, errors: errors.slice(0, 5) }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const u = url.searchParams.get('u')
  if (u) return new Response(JSON.stringify({ ok: await unsubscribe(u), kind: u.split('.')[1] ?? null }), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)
  let body: { digest?: boolean; nudge?: boolean; preview?: Kind; test?: Kind; email?: string; to?: string; dry?: boolean } = {}
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  // one member's email, rendered and not sent (any member: test accounts included, so harnesses can look)
  if (body.preview || body.test) {
    const kind = (body.preview || body.test) as Kind
    if (!['digest', 'nudge'].includes(kind) || !body.email) return json({ error: 'kind and email required' }, 400)
    const { data: ent } = await admin.from('entitlements').select('user_id, email').ilike('email', body.email).not('user_id', 'is', null).limit(1).maybeSingle()
    if (!ent) return json({ error: 'no such member' }, 404)
    const { data: prof } = await admin.from('profiles').select('username').eq('user_id', ent.user_id).maybeSingle()
    const m: Member = { uid: ent.user_id as string, email: String(ent.email).toLowerCase(), name: (prof?.username as string) || '' }
    const S = await shared()
    if (body.preview) {
      const mail = await compose(kind, m, S)
      if (!mail) return json({ ok: true, skipped: 'nothing to send this member' })
      return new Response(mail.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-subject': encodeURIComponent(mail.subject) } })
    }
    // a test goes only to an admin's own inbox
    const { data: admins } = await admin.from('admins').select('user_id')
    const adminEmails = new Set<string>()
    for (const a of admins ?? []) { const { data } = await admin.auth.admin.getUserById(a.user_id as string); if (data?.user?.email) adminEmails.add(data.user.email.toLowerCase()) }
    if (!body.to || !adminEmails.has(body.to.toLowerCase())) return json({ error: 'a test goes to an admin address only' }, 403)
    return json({ ok: true, kind: 'test', ...(await sendAll(kind, [m], S, 'test', body.to)) })
  }

  if (body.digest || body.nudge) {
    const kind: Kind = body.digest ? 'digest' : 'nudge'
    const all = await members()
    const { data: prefs } = all.length ? await admin.from('notify_prefs').select('user_id, alerts').in('user_id', all.map((m) => m.uid)) : { data: [] }
    const off = new Set((prefs ?? []).filter((p) => (p.alerts as Record<string, boolean> | null)?.[`email_${kind}`] === false).map((p) => p.user_id as string))
    let list = all.filter((m) => !off.has(m.uid))
    const S = await shared()
    if (kind === 'nudge') {
      // stalled a week, not finished, and not nudged in the last 14 days
      const since = new Date(Date.now() - 14 * 86400000).toISOString()
      const { data: recent } = await admin.from('mail_log').select('user_id').eq('kind', 'nudge').eq('ok', true).gte('sent_at', since)
      const nudged = new Set((recent ?? []).map((r) => r.user_id as string))
      const keep: Member[] = []
      for (const m of list) {
        if (nudged.has(m.uid)) continue
        const p = await personal(m, S)
        if (p.next && Date.now() - p.last > 7 * 86400000) keep.push(m)
      }
      list = keep
    } else {
      // one digest a week, whatever re-fires
      const since = new Date(Date.now() - 5 * 86400000).toISOString()
      const { data: recent } = await admin.from('mail_log').select('user_id').eq('kind', 'digest').eq('ok', true).gte('sent_at', since)
      const had = new Set((recent ?? []).map((r) => r.user_id as string))
      list = list.filter((m) => !had.has(m.uid))
    }
    if (body.dry) return json({ ok: true, kind, dry: true, members: all.length, opted_out: off.size, recipients: list.length, smtp: !!(SMTP_USER && SMTP_PASS) })
    return json({ ok: true, kind, recipients: list.length, ...(await sendAll(kind, list, S)) })
  }
  return json({ error: 'digest, nudge, preview or test required' }, 400)
})
