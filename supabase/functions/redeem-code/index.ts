// Echelon | redeem-code
//
// A person holding a free access code has no account and no JWT — the code
// is the credential, so this runs with verify_jwt off (the claim-access
// pattern). One use is burned atomically, the comped entitlement is
// granted, and the auth user is created so the sign-in link the client
// sends next has something to land on.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const ALLOWED_ORIGINS = new Set([
  'https://d1fpc3.com',
  'https://www.d1fpc3.com',
  'http://localhost:5173',
  'http://localhost:8080',
])

function cors(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://d1fpc3.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Throttle: 6 misses per address per 15 minutes, 60 misses site-wide per 15 minutes.
// The address is stored as a salted hash; the code itself is never stored.
const MISS_PER_IP = 6, MISS_GLOBAL = 60, WINDOW_MIN = 15
async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || (req.headers.get('cf-connecting-ip') ?? 'unknown')
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.slice(-16)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip))
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function throttled(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  const [mine, all] = await Promise.all([
    admin.from('redeem_attempts').select('id', { count: 'exact', head: true }).eq('ip_hash', ip).eq('ok', false).gte('at', since),
    admin.from('redeem_attempts').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', since),
  ])
  return (mine.count ?? 0) >= MISS_PER_IP || (all.count ?? 0) >= MISS_GLOBAL
}
const logAttempt = (ip: string, ok: boolean) => admin.from('redeem_attempts').insert({ ip_hash: ip, ok }).then(() => {}, () => {})

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'content-type': 'application/json' }
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { code?: string; email?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }

  const code = body.code?.trim().toUpperCase() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  if (!code || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'a code and a real email, both' }, 400)
  }

  const ip = await ipHash(req)
  if (await throttled(ip)) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429)

  try {
    // Already in? Don't burn a use on someone who owns the course. One row is enough:
    // members usually hold several entitlements, and maybeSingle() errors on more than one.
    const { data: owned } = await admin
      .from('entitlements').select('id')
      .eq('status', 'active').ilike('email', email).limit(1)
    if (owned && owned.length) return json({ ok: true, already: true })

    // Burn one use, atomically — the function's WHERE clause is the whole
    // validity check (active, free, unexpired, uses left).
    const { data: claim, error: claimErr } = await admin.rpc('claim_access_code', { p_code: code })
    if (claimErr) throw claimErr

    if (!claim || claim.length === 0) {
      // Was it a discount code, or just wrong? Answer honestly but vaguely.
      const { data: row } = await admin
        .from('access_codes').select('kind, percent_off, is_active')
        .eq('code', code).maybeSingle()
      if (row?.kind === 'discount' && row.is_active) {
        await logAttempt(ip, false)
        return json({ error: `That code is a ${row.percent_off}% discount for checkout, not free access.` }, 400)
      }
      await logAttempt(ip, false)
      console.warn('invalid code attempt')
      return json({ error: 'That code is not valid.' }, 400)
    }

    const { error: grantErr } = await admin.rpc('grant_entitlement', {
      p_email: email,
      p_source: 'comp',
    })
    if (grantErr) throw grantErr

    await logAttempt(ip, true)
    // Give them an account so the sign-in link has something to hit.
    await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {})

    return json({ ok: true })
  } catch (err) {
    console.error('redeem failed:', (err as Error).message)
    return json({ error: 'Could not redeem the code. Try again in a moment.' }, 500)
  }
})
