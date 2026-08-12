# Echelon | Discord connect, login, and membership sync

Date: 2026-08-11
Status: approved by D1 (chat), pending Discord Portal values

## Goal

Members can sign in to the Echelon members area with Discord, connect Discord to an
existing email account, and (when entitled) get placed into the Echelon Discord server
with the paid role applied automatically. Refunds pull the role. This activates the
already-deployed `discord-sync` edge function and the dormant "Continue with Discord"
button.

## Current state

- Frontend `echelon/app/index.html` has `discordButton()` calling
  `signInWithOAuth({ provider: 'discord', scopes: 'identify email guilds.join' })`
  with a graceful "not switched on yet" fallback. Nothing handles the OAuth return.
- Edge function `discord-sync` (deployed, v4) upserts `discord_links`
  (user_id, discord_user_id, discord_username, access_token) and does the
  Whop-style PUT /guilds/{guild}/members/{user} join-with-role, plus role
  grant/remove based on `entitlements.status = 'active'`. Callable with a user JWT
  (self) or the service key (+ user_id, any user).
- Tables/views: `discord_links`, `my_discord`; admin app already renders
  discord_username / discord_role per buyer.
- NOT configured: Supabase Discord provider (off), manual identity linking (off),
  secrets `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` / `DISCORD_PAID_ROLE_ID` (absent).
- `stripe-webhook` grants/revokes entitlements but never calls `discord-sync`.

## Design

### 1. Config (Management API, project cqdignbleethroyxxvzr)

- PATCH `/config/auth`: `external_discord_enabled: true`, client id + secret,
  `security_manual_linking_enabled: true`.
- Edge Function secrets: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PAID_ROLE_ID`.
- Discord app redirect URL: `https://cqdignbleethroyxxvzr.supabase.co/auth/v1/callback`.
- Bot requirements: in the Echelon guild, permissions Manage Roles + Create Instant
  Invite, bot role positioned above the paid role. Public Bot off.

### 2. Sign-in path (app/index.html)

On `onAuthStateChange` SIGNED_IN where the session carries a `provider_token` and the
user has a discord identity: POST to `discord-sync` with
`{ discord_user_id, discord_username, access_token: session.provider_token }` using the
user JWT. Fire once per OAuth return (guard flag), non-blocking for app boot.

Email-match note: Supabase auto-links a Discord identity to an existing account when
the verified emails match. When they do not match, Discord sign-in creates a new
free-tier account; sign-in gate copy points course owners to email sign-in and the
account-section Connect button instead.

### 3. Connect path (account section)

A Discord card in the account section, matching existing account/gate styling:

- Not connected: short line + "Connect Discord" button, calls
  `linkIdentity({ provider: 'discord', options: { redirectTo, scopes } })`.
- Connected: discord username, in-server / role status from `my_discord`, and a
  "Disconnect" action.
- Disconnect: `unlinkIdentity(discordIdentity)` when the user has 2+ identities,
  then `discord-sync` with `action: 'disconnect'` (new branch: delete `discord_links`
  row, remove the paid role, leave them in the server). When Discord is the only
  identity, hide Disconnect and show a hint to add email sign-in first.

### 4. Sync triggers

- `stripe-webhook`: after entitlement grant (checkout.session.completed) and revoke
  (charge.refunded, charge.dispute.created), fire-and-forget service-key POST to
  `discord-sync` with the affected user_id.
- App-load self-heal: when entitled + connected and `my_discord` shows
  `role_granted = false`, call `discord-sync` once (covers redeem-code, claim-access,
  and admin grants without modifying those functions).

### 5. Edge function change (discord-sync)

Single addition: `action: 'disconnect'` branch (JWT caller only). Delete the caller's
`discord_links` row and best-effort remove the paid role. Everything else unchanged.

### 6. Testing

- Playwright harness against the live app: Discord button reaches Discord's authorize
  page (proves provider + redirect config), account-card states render, gate fallback
  gone.
- Service-key `discord-sync` calls verified directly (link row, role grant/remove
  responses).
- Full OAuth consent + join-with-role hop requires a real Discord login: verified with
  D1's account after ship; not claimable as tested before that.

## Out of scope

- Free-member auto-join (anyone can use the existing invite link; only paid role sync
  is automated).
- Discord-side activity features (posting recaps to Discord, presence, etc).
- Changes to redeem-code / claim-access / admin-api.

## Inputs required from D1

Discord Developer Portal: client ID, client secret, bot token; plus guild ID and paid
role ID from the server.
