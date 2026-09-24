/* ─────────────────────────────────────────────────────────────────────────────
   DESK ACCESS
   The one door into this desk. Both pages import SB from here and await
   requireDesk() before they read anything.

   Why this exists: until 2026-09-24 the desk read the Kalshi tables as anon,
   so anyone holding the publishable key in the page source could pull D1's
   order history, fills, P&L and risk settings. The tables are now readable
   only by the user ids in kalshi_desk_access, so an unauthenticated page
   renders nothing but empty tables. This module makes that state legible: it
   asks for the login, checks membership through the kalshi_desk_member()
   function the policies themselves call, and refuses anything else.

   Two failure modes it keeps apart, because they need different answers:
     wrong password       -> the credentials are wrong, try again
     signed in, not listed -> the account is real but has no desk access
   ───────────────────────────────────────────────────────────────────────────── */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://cqdignbleethroyxxvzr.supabase.co';
const PUBLISHABLE = 'sb_publishable_bUU5exrU1uS4FKw_Dxnp-w_-dNjAo8x';

// No storageKey: the default is what every other Echelon admin page uses, so signing in to
// Echelon signs you in here and the desk needs no login of its own. Setting a private key
// here would mean a second login on the same browser for the same account.
export const SB = createClient(SUPABASE_URL, PUBLISHABLE, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const CSS = `
.dsk-gate{position:fixed;inset:0;z-index:9999;background:#000;display:grid;place-items:center;
  font-family:ui-monospace,'Cascadia Mono','SF Mono',Menlo,Consolas,monospace;color:#e8e8e8}
.dsk-gate::before{content:'';position:absolute;inset:0;opacity:.5;pointer-events:none;
  background:
    repeating-linear-gradient(to bottom,rgba(255,160,0,.045) 0 1px,transparent 1px 3px),
    radial-gradient(90% 60% at 50% 42%,rgba(255,160,0,.16),transparent 62%),
    radial-gradient(120% 80% at 50% 0%,rgba(255,160,0,.08),transparent 60%)}
.dsk-gate::after{content:'';position:absolute;inset:0;pointer-events:none;
  box-shadow:inset 0 2px 0 #ffa000, inset 0 0 160px rgba(0,0,0,.9)}
.dsk-card{position:relative;width:min(92vw,392px);background:#070707;border:1px solid #2a2a2a;
  box-shadow:0 0 0 1px #000,0 30px 80px -20px rgba(0,0,0,.95);animation:dsk-in .32s cubic-bezier(.2,.8,.2,1) both}
@keyframes dsk-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
.dsk-hd{display:flex;align-items:center;gap:8px;background:#ffa000;color:#000;padding:3px 9px;
  font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.dsk-hd .dsk-lock{font-size:11px;line-height:1}
.dsk-hd .dsk-sub{margin-left:auto;font-weight:400;letter-spacing:.04em;text-transform:none;color:#3a2600;font-size:10px}
.dsk-bd{padding:18px 18px 16px}
.dsk-ttl{font-size:12.5px;letter-spacing:.02em;color:#e8e8e8;margin-bottom:3px}
.dsk-say{font-size:10.5px;color:#6f6f6f;line-height:1.5;margin-bottom:15px}
.dsk-f{display:block;margin-bottom:10px}
.dsk-l{display:block;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#585858;margin-bottom:4px}
.dsk-i{width:100%;background:#000;border:1px solid #242424;color:#ffa000;caret-color:#ffa000;
  font:inherit;font-size:12px;padding:7px 9px;outline:0;transition:border-color .14s,box-shadow .14s}
.dsk-i:hover{border-color:#333}
.dsk-i:focus{border-color:#ffa000;box-shadow:0 0 0 1px #ffa000,0 0 22px -6px rgba(255,160,0,.7)}
.dsk-i::placeholder{color:#3a3a3a}
.dsk-go{width:100%;margin-top:6px;background:#ffa000;color:#000;border:0;font:inherit;font-size:11px;
  font-weight:700;letter-spacing:.13em;text-transform:uppercase;padding:8px;cursor:pointer;
  transition:filter .14s,transform .06s}
.dsk-go:hover{filter:brightness(1.12)}
.dsk-go:active{transform:translateY(1px)}
.dsk-go:disabled{background:#2a2a2a;color:#6f6f6f;cursor:default;filter:none}
.dsk-err{margin-top:9px;font-size:10.5px;color:#ff4d4d;line-height:1.45;white-space:pre-line}
.dsk-err:empty{margin:0}
.dsk-ft{border-top:1px solid #171717;padding:8px 18px 11px;font-size:9.5px;color:#454545;line-height:1.55}
.dsk-ft b{color:#6f6f6f;font-weight:400}
.dsk-shake{animation:dsk-sh .28s}
@keyframes dsk-sh{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.dsk-cur{display:inline-block;width:6px;height:11px;background:#ffa000;vertical-align:-1px;
  animation:dsk-bl 1.05s steps(2,start) infinite}
@keyframes dsk-bl{50%{opacity:0}}
.dsk-out{position:fixed;right:9px;bottom:32px;z-index:60;background:#0a0a0a;border:1px solid #2a2a2a;
  color:#8a8a8a;font:inherit;font-size:11px;letter-spacing:.07em;text-transform:uppercase;
  padding:5px 10px;cursor:pointer;transition:color .14s,border-color .14s}
@media (pointer:coarse){.dsk-out{font-size:11.5px;padding:9px 12px}}
.dsk-out:hover{color:#ffa000;border-color:#ffa000}
.dsk-out-inline{position:static;background:transparent;border-color:#2a2a2a}
`;

function injectCss() {
  if (document.getElementById('dsk-auth-css')) return;
  const s = document.createElement('style');
  s.id = 'dsk-auth-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** True when the signed-in user is one the desk policies will actually serve. */
async function isMember() {
  const { data, error } = await SB.rpc('kalshi_desk_member');
  if (error) return false;
  return data === true;
}

/** The login card. Resolves only once a listed member is signed in. */
function askForLogin(reason) {
  return new Promise((resolve) => {
    injectCss();
    const g = document.createElement('div');
    g.className = 'dsk-gate';
    g.innerHTML = `
      <form class="dsk-card" autocomplete="on">
        <div class="dsk-hd"><span class="dsk-lock">&#9632;</span>Kalshi desk<span class="dsk-sub">private</span></div>
        <div class="dsk-bd">
          <div class="dsk-ttl">Sign in<span class="dsk-cur"></span></div>
          <div class="dsk-say">This desk shows a live brokerage account. It is readable only by the
            logins on its access list.</div>
          <label class="dsk-f"><span class="dsk-l">Email</span>
            <input class="dsk-i" type="email" name="email" autocomplete="username" required placeholder="you@example.com"></label>
          <label class="dsk-f"><span class="dsk-l">Password</span>
            <input class="dsk-i" type="password" name="password" autocomplete="current-password" required placeholder="••••••••"></label>
          <button class="dsk-go" type="submit">Unlock desk</button>
          <div class="dsk-err" role="alert">${reason ? esc(reason) : ''}</div>
        </div>
        <div class="dsk-ft"><b>Served from this machine only.</b> Not published, not on the network,
          and nothing on this desk places an order.</div>
      </form>`;
    document.body.appendChild(g);
    const form = g.querySelector('form');
    const err = g.querySelector('.dsk-err');
    const btn = g.querySelector('.dsk-go');
    const email = g.querySelector('input[name=email]');
    setTimeout(() => email.focus(), 60);

    const fail = (msg) => {
      err.textContent = msg;
      form.classList.remove('dsk-shake');
      void form.offsetWidth;
      form.classList.add('dsk-shake');
      btn.disabled = false;
      btn.textContent = 'Unlock desk';
    };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Checking';
      err.textContent = '';
      const fd = new FormData(form);
      const { error } = await SB.auth.signInWithPassword({
        email: String(fd.get('email')).trim(),
        password: String(fd.get('password')),
      });
      if (error) return fail(error.message || 'Sign-in failed.');
      if (!(await isMember())) {
        await SB.auth.signOut();
        return fail('That login is valid but it is not on this desk\'s access list.');
      }
      g.remove();
      resolve();
    });
  });
}

function esc(s) {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/**
 * A sign-out control. A page that has somewhere sensible to put it marks that spot with
 * data-desk-signout; otherwise the button floats bottom right. The floating fallback sits
 * over whatever is behind it, which is why both pages here provide a host.
 */
function addSignOut(user) {
  if (document.querySelector('.dsk-out')) return;
  injectCss();
  const host = document.querySelector('[data-desk-signout]');
  const b = document.createElement('button');
  b.className = host ? 'dsk-out dsk-out-inline' : 'dsk-out';
  b.type = 'button';
  b.textContent = user?.email ? `${user.email.split('@')[0]} · sign out` : 'sign out';
  // the session is Echelon's, so say so: this button logs you out of the whole admin, not
  // just this page, and that is a surprise worth spending a tooltip on
  b.title = user?.email
    ? `Signed in as ${user.email}. This signs you out of Echelon too.`
    : 'Sign out';
  b.addEventListener('click', async () => {
    await SB.auth.signOut();
    location.reload();
  });
  (host ?? document.body).appendChild(b);
}

/**
 * Block until a listed member is signed in. Call this and await it before the
 * first read, so no panel ever renders a misleading empty table.
 */
export async function requireDesk() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) {
    await askForLogin('');
  } else if (!(await isMember())) {
    await SB.auth.signOut();
    await askForLogin('The signed-in account is not on this desk\'s access list.');
  }
  const { data: { user } } = await SB.auth.getUser();
  addSignOut(user);
  SB.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.reload(); });
  return user ?? null;
}
