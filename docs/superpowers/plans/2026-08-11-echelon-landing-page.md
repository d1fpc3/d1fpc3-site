# Echelon Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root `d1fpc3.com` page with a premium, responsive Dossier-style landing page that clearly sells Echelon to warm Instagram and Discord visitors.

**Architecture:** Keep the page static and Hostinger-compatible while separating concerns into semantic HTML, a landing-specific stylesheet, and a small progressive-enhancement script. Use Node's built-in test runner for the content and integration contract, then verify layout and interaction in a real browser at desktop and mobile sizes.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Node.js built-in `node:test`, local static HTTP server, browser visual QA

---

## File Structure

- Modify `index.html`: metadata, semantic page content, section hierarchy, product preview, FAQ, and disclosure
- Create `landing.css`: visual tokens, responsive layout, focus treatment, session-spine signature, product-surface styling, and reduced-motion rules
- Create `landing.js`: checkout state, Discord member count, FAQ marker state, and progressive entrance behavior
- Create `tests/landing-page.test.cjs`: dependency-free structural and behavior tests
- Preserve `styles.css`: retired personal-profile stylesheet; no longer loaded by the root page

### Task 1: Lock the Landing-Page Contract

**Files:**
- Create: `tests/landing-page.test.cjs`
- Test: `tests/landing-page.test.cjs`

- [ ] **Step 1: Write failing structural tests**

Create tests using `node:test`, `node:assert/strict`, `fs`, `path`, and `vm`. The tests must assert:

```js
test('root page presents the complete Echelon purchase journey', () => {
  assert.match(html, /Trade NQ with a written standard\./)
  assert.match(html, /id="standard"/)
  assert.match(html, /id="inside"/)
  assert.match(html, /id="compare"/)
  assert.match(html, /id="access"/)
  assert.match(html, /Get Echelon <span aria-hidden="true">—<\/span> \$200/)
  assert.match(html, /href="\/echelon\/app\/"/)
})

test('root page keeps required metadata and integrations', () => {
  assert.match(html, /rel="canonical" href="https:\/\/d1fpc3\.com\/"/)
  assert.match(html, /data-sr-site="d19bf048-ec87-453a-aa7f-b264637a7360"/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /landing\.css/)
  assert.match(html, /landing\.js/)
})

test('landing script formats and parses progressive data safely', () => {
  assert.equal(Landing.parseDiscordInvite('https://discord.gg/FAQD5Cr5p7'), 'FAQD5Cr5p7')
  assert.equal(Landing.parseDiscordInvite(''), '')
  assert.equal(Landing.formatMemberCount(1), '1 member')
  assert.equal(Landing.formatMemberCount(1284), '1,284 members')
  assert.equal(Landing.formatMemberCount(undefined), '')
})
```

Load `landing.js` into an isolated `vm` context with `module.exports` support so tests can call exported pure helpers without a browser.

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run:

```powershell
node --test tests/landing-page.test.cjs
```

Expected: FAIL because the new page structure and `landing.js` do not exist yet.

- [ ] **Step 3: Commit the contract tests**

```powershell
git add tests/landing-page.test.cjs
git commit -m "test: define Echelon landing page contract"
```

### Task 2: Build the Semantic Landing Page

**Files:**
- Modify: `index.html`
- Test: `tests/landing-page.test.cjs`

- [ ] **Step 1: Replace the old ledger markup**

Keep the canonical URL, Open Graph metadata, SeenRank pixel, product schema, favicon, and theme color. Load `/landing.css` and `/landing.js`, then build these sections in order:

```html
<header class="site-header">
  <a class="wordmark" href="#top" aria-label="Echelon home">Echelon <span>by D1</span></a>
  <nav aria-label="Primary navigation">
    <a href="#standard">The standard</a>
    <a href="#inside">Inside</a>
    <a href="#access">Access</a>
  </nav>
  <a class="member-link" href="/echelon/app/">Members sign in</a>
</header>
```

The hero must contain the exact thesis `Trade NQ with a written standard.`, a `Get Echelon — $200` checkout button using `data-buy`, a `See what's inside` anchor, purchase facts, and an operating-brief surface with Market, Format, Access, and Community fields.

Add a session spine with four true stages—Prepare, Wait, Execute, Stop—followed by:

- `#standard`: four connected behavioral stages with concrete explanatory copy
- `#inside`: an HTML/CSS members-area preview showing lessons, progress, published trade recaps, and private Discord access without exposing paid setup details
- `#compare`: a concise Free Discord versus Echelon comparison
- credibility rail: live member-count target, TradingView profile, and education-only positioning
- `#access`: complete $200 offer, one-payment/lifetime/update facts, primary purchase CTA, and member sign-in
- FAQ: six purchase-focused `details` elements
- footer: futures risk disclosure, TradingView link, optional Discord link, and copyright

- [ ] **Step 2: Run the structural tests**

```powershell
node --test tests/landing-page.test.cjs
```

Expected: structural tests pass; JavaScript-helper tests still fail because `landing.js` has not been created.

- [ ] **Step 3: Validate HTML anchors and duplicate IDs**

Run a short read-only Node command that extracts every `id` and every local `href="#..."`, fails on duplicate IDs, and fails when a referenced anchor is absent.

Expected: exit code 0 with `anchors ok`.

- [ ] **Step 4: Commit the page structure**

```powershell
git add index.html
git commit -m "feat: rebuild Echelon landing page structure"
```

### Task 3: Implement the Dossier Visual System

**Files:**
- Create: `landing.css`
- Modify: `index.html`
- Test: `tests/landing-page.test.cjs`

- [ ] **Step 1: Define the design tokens and base rules**

Create tokens matching the approved spec:

```css
:root {
  --night: #081018;
  --gunmetal: #14202a;
  --frost: #f2f5f6;
  --steel: #94a3ad;
  --brass: #b98b46;
  --signal: #c75b4a;
  --line: rgba(242, 245, 246, 0.13);
  --line-strong: rgba(242, 245, 246, 0.24);
  --content: 1200px;
}
```

Add local fallbacks and Google font loading for a condensed display face, readable body sans, and mono utility face. Establish `box-sizing`, dark background, Frost text, selection, focus-visible, button, link, and reduced-motion rules.

- [ ] **Step 2: Build the wide editorial grid**

Implement:

- sticky translucent header with no glass-card appearance
- desktop hero grid near a 7/5 split
- fluid condensed headline using `clamp()`
- rectangular brass primary action and quiet outlined secondary action
- operating brief with hairline divisions, registration marks, and document notation
- full-width session spine with connected stages and a restrained Signal Red stop marker
- connected standard stages rather than independent rounded cards
- large members-product surface with a realistic sidebar/content split
- two-column comparison and pricing layouts
- compact FAQ and low-emphasis disclosure

- [ ] **Step 3: Add responsive behavior**

At approximately 900px, stack the hero and members preview. At approximately 700px, simplify navigation, stack comparisons, keep touch targets at least 44px, and turn the session spine into a vertical sequence. At 420px, tighten outer gutters and type scale without hiding essential offer information.

- [ ] **Step 4: Add restrained coordinated motion**

Use one page-ready class to reveal the hero thesis, brief, and spine in sequence. Keep all transforms subtle and disable them under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Run tests and CSS sanity checks**

```powershell
node --test tests/landing-page.test.cjs
rg -n "#[0-9A-Fa-f]{3,8}|gradient|border-radius" landing.css
```

Expected: page-contract tests have no CSS-related regression; the color/gradient/radius audit contains only intentional Dossier values and restrained uses.

- [ ] **Step 6: Commit the visual system**

```powershell
git add landing.css index.html
git commit -m "style: add premium Echelon dossier design"
```

### Task 4: Add Progressive Checkout and Community Behavior

**Files:**
- Create: `landing.js`
- Test: `tests/landing-page.test.cjs`

- [ ] **Step 1: Implement pure data helpers**

Expose the following browser-safe helpers through `module.exports` when Node is present:

```js
function parseDiscordInvite(url) {
  const match = String(url || '').match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/)
  return match ? match[1] : ''
}

function formatMemberCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count) || count <= 0) return ''
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'member' : 'members'}`
}
```

- [ ] **Step 2: Implement checkout state**

Use a single configuration object:

```js
const CONFIG = {
  checkoutUrl: '',
  discordUrl: 'https://discord.gg/FAQD5Cr5p7',
}
```

When `checkoutUrl` exists, every `[data-buy]` control navigates to it. When it is empty, disable each control with `aria-disabled="true"`, set its label to `Checkout not connected yet`, and reveal a nearby explanatory status. Do not remove member sign-in.

- [ ] **Step 3: Implement Discord progressive enhancement**

Parse the invite code and request:

```text
https://discord.com/api/v10/invites/{code}?with_counts=true
```

On success, replace every `[data-members]` fallback with the formatted public member count and reveal the footer Discord link. On failure, retain the non-numeric fallback copy and do not emit an error into the page.

- [ ] **Step 4: Implement small interaction details**

Add `is-ready` after the first animation frame, synchronize FAQ plus/minus markers with each `details` open state, and avoid any continuous animation.

- [ ] **Step 5: Run the complete automated test file**

```powershell
node --test tests/landing-page.test.cjs
```

Expected: all structural, metadata, link, and helper tests PASS.

- [ ] **Step 6: Commit behavior**

```powershell
git add landing.js tests/landing-page.test.cjs
git commit -m "feat: add Echelon landing interactions"
```

### Task 5: Browser QA and Final Verification

**Files:**
- Modify if defects are found: `index.html`, `landing.css`, `landing.js`
- Test: `tests/landing-page.test.cjs`

- [ ] **Step 1: Start the site locally**

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Expected: server listens on `http://127.0.0.1:4173/`.

- [ ] **Step 2: Inspect desktop layout**

Open the page at 1440×1000. Verify the hero reads above the fold, the operating brief balances the thesis, the session spine is legible, the product preview feels credible, and the primary CTA is visually dominant without resembling generic luxury styling.

- [ ] **Step 3: Inspect mobile layout**

Open at 390×844. Verify no horizontal overflow, readable headline wrapping, 44px controls, sensible section order, vertical session spine, compact navigation, and no clipped product-preview content.

- [ ] **Step 4: Verify interaction and failure states**

Use keyboard navigation through all links, CTAs, and FAQ items. Confirm checkout controls show the unconfigured state, member sign-in remains active, Discord failure leaves useful fallback copy, and reduced-motion emulation suppresses entrance motion.

- [ ] **Step 5: Run final repository checks**

```powershell
node --test tests/landing-page.test.cjs
git diff --check
git status --short
```

Expected: all tests pass, no whitespace errors, and only intentional implementation files are changed.

- [ ] **Step 6: Commit QA fixes if needed**

```powershell
git add index.html landing.css landing.js tests/landing-page.test.cjs
git commit -m "fix: polish Echelon landing responsiveness"
```
