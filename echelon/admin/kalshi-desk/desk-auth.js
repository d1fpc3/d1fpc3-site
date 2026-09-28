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
/* Apple, 2026-09-28 (D1: "a whole bunch of Apple UI ... everything"): the door is a glass sheet over a
   gold-lit dark page, in the system type, with filled fields and one gold capsule. Same classes. */
.dsk-gate{position:fixed;inset:0;z-index:9999;background:#000;display:grid;place-items:center;padding:20px;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter var','Inter','Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;
  color:#f5f5f7;letter-spacing:-.006em;-webkit-font-smoothing:antialiased}
.dsk-gate::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(70% 55% at 50% 36%,rgba(201,162,74,.2),transparent 62%),
             radial-gradient(90% 60% at 85% 105%,rgba(10,132,255,.08),transparent 60%)}
.dsk-card{position:relative;width:min(100%,380px);overflow:hidden;border-radius:28px;
  background:rgba(28,28,30,.72);-webkit-backdrop-filter:blur(40px) saturate(1.8);backdrop-filter:blur(40px) saturate(1.8);
  border:1px solid rgba(255,255,255,.08);border-top-color:rgba(255,255,255,.15);
  box-shadow:0 40px 100px -30px rgba(0,0,0,.9);animation:dsk-in .42s cubic-bezier(.32,.72,0,1) both}
@keyframes dsk-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.dsk-hd{display:flex;align-items:center;gap:8px;padding:20px 24px 0;color:#c9a24a;font-size:13px;font-weight:600}
.dsk-hd .dsk-lock{display:inline-flex;width:15px;height:15px}
.dsk-hd .dsk-lock svg{width:15px;height:15px}
.dsk-hd .dsk-sub{margin-left:auto;padding:2px 9px;border-radius:999px;background:rgba(118,118,128,.2);color:#aeaeb2;font-size:11.5px;font-weight:600}
.dsk-bd{padding:12px 24px 22px}
.dsk-ttl{font-size:26px;font-weight:700;letter-spacing:-.028em;color:#f5f5f7;margin-bottom:5px}
.dsk-say{font-size:14px;color:#aeaeb2;line-height:1.45;margin-bottom:18px}
.dsk-f{display:block;margin-bottom:12px}
.dsk-l{display:block;font-size:12.5px;font-weight:600;color:#aeaeb2;margin-bottom:6px}
.dsk-i{width:100%;background:rgba(118,118,128,.2);border:1px solid transparent;border-radius:12px;color:#f5f5f7;caret-color:#c9a24a;
  font:inherit;font-size:16px;padding:11px 14px;outline:0;transition:border-color .18s,box-shadow .18s,background .18s}
.dsk-i:hover{background:rgba(118,118,128,.26)}
.dsk-i:focus{border-color:#c9a24a;box-shadow:0 0 0 4px rgba(201,162,74,.24);background:rgba(118,118,128,.14)}
.dsk-i::placeholder{color:#8e8e93}
.dsk-go{width:100%;margin-top:8px;min-height:48px;background:#c9a24a;color:#17130a;border:0;border-radius:999px;font:inherit;
  font-size:16px;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.28);transition:filter .14s,transform .12s}
.dsk-go:hover{filter:brightness(1.07)}
.dsk-go:active{transform:scale(.97)}
.dsk-go:disabled{background:rgba(118,118,128,.24);color:#8e8e93;cursor:default;filter:none;box-shadow:none}
.dsk-err{margin-top:10px;font-size:13px;color:#ff6961;line-height:1.45;white-space:pre-line}
.dsk-err:empty{margin:0}
.dsk-ft{border-top:1px solid rgba(255,255,255,.07);padding:13px 24px 17px;font-size:12.5px;color:#8e8e93;line-height:1.5}
.dsk-ft b{color:#aeaeb2;font-weight:600}
.dsk-shake{animation:dsk-sh .32s}
@keyframes dsk-sh{0%,100%{transform:none}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.dsk-cur{display:none}
.dsk-out{position:fixed;right:12px;bottom:14px;z-index:60;background:rgba(118,118,128,.24);border:0;border-radius:999px;
  color:#f5f5f7;font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;cursor:pointer;transition:color .14s,background .14s}
@media (pointer:coarse){.dsk-out{padding:10px 15px}}
/* the name is the first thing to go: on a phone the bar needs the width more than the reader
   needs reminding which account they are on, and the tooltip still says it */
@media (max-width:700px){.dsk-out .dsk-who,.dsk-out .dsk-sep{display:none}}
.dsk-out:hover{color:#ff6961}
.dsk-out-inline{position:static}
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
        <div class="dsk-hd"><span class="dsk-lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg></span>Kalshi desk<span class="dsk-sub">private</span></div>
        <div class="dsk-bd">
          <div class="dsk-ttl">Sign in<span class="dsk-cur"></span></div>
          <div class="dsk-say">This desk shows a live brokerage account. It is readable only by the
            logins on its access list.</div>
          <label class="dsk-f"><span class="dsk-l">Email</span>
            <input class="dsk-i" type="email" name="email" autocomplete="username" required></label>
          <label class="dsk-f"><span class="dsk-l">Password</span>
            <input class="dsk-i" type="password" name="password" autocomplete="current-password" required></label>
          <button class="dsk-go" type="submit">Unlock desk</button>
          <div class="dsk-err" role="alert">${reason ? esc(reason) : ''}</div>
        </div>
        <div class="dsk-ft"><b>Your Echelon login.</b> The rows arrive only for accounts on the desk's access list,
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
  if (user?.email) {
    const who = document.createElement('span');
    who.className = 'dsk-who';
    who.textContent = user.email.split('@')[0];
    const sep = document.createElement('span');
    sep.className = 'dsk-sep';
    sep.textContent = ' · ';
    b.append(who, sep);
  }
  b.append(document.createTextNode('sign out'));
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
