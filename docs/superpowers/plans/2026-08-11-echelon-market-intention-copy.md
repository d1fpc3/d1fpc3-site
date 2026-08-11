# Echelon Market-Intention Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the existing Echelon landing page as a discretionary, concept-driven course for understanding NQ's context and intention without changing its design or functionality.

**Architecture:** Keep the current single-file static page and replace only its metadata and visible product copy. Add a dependency-free Node test that treats the approved language, preserved commercial terms, working anchors, and absence of obsolete plan-centered language as the content contract.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, GitHub Actions FTP deployment

---

## File Structure

- Modify: `index.html` — update metadata, header, hero, concepts, audience, D1 Engine, and FAQ copy while preserving CSS, checkout behavior, Discord integration, sign-in route, risk disclosure, and pricing.
- Create: `tests/landing-copy.test.mjs` — assert the approved copy contract and protect the page's existing functional links and terms.
- Reference: `docs/superpowers/specs/2026-08-11-echelon-market-intention-copy-design.md` — approved source of truth for the positioning.

### Task 1: Lock the Approved Messaging into a Failing Test

**Files:**
- Create: `tests/landing-copy.test.mjs`
- Test: `tests/landing-copy.test.mjs`

- [ ] **Step 1: Write the landing-page content contract**

Create `tests/landing-copy.test.mjs` with:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('uses the approved Echelon by D1 market-intention positioning', () => {
  assert.match(html, /<title>Echelon by D1 · Understand NQ's intention<\/title>/);
  assert.match(html, /<span class="name">Echelon by D1<\/span>/);
  assert.match(html, /href="#concepts">The concepts<\/a>/);
  assert.match(html, /<section id="concepts">/);
  assert.match(html, /Understand what NQ[\s\S]*is trying to do\./);
  assert.match(html, /Echelon teaches the concepts behind price movement—how to read context, recognize intention, and understand why NQ is moving where it is\. Once you see the market this way, you cannot unsee it\./);
});

test('presents the four approved concepts', () => {
  const entries = [
    ['Context', 'Understand the conditions that give a move meaning instead of judging candles in isolation.'],
    ['Intention', 'Recognize what price is seeking, what it is reacting to, and when its behavior changes.'],
    ['Confirmation', 'Separate meaningful price behavior from noise before committing to an idea.'],
    ["Application", "Study the concepts through D1's session breakdowns and the private member room."],
  ];

  for (const [title, description] of entries) {
    assert.ok(html.includes(`<span class="t">${title}</span>`));
    assert.ok(html.includes(`<span class="d">${description}</span>`));
  }
});

test('states the discretionary teaching philosophy in the lead FAQ', () => {
  assert.match(html, /<summary>What model will you teach me\?<span class="mk">\+<\/span><\/summary>/);
  assert.ok(html.includes("I don't teach a mechanical model. I teach discretionary concepts that help you see NQ clearly. I don't believe price can be reduced to rigid rules; context and judgment matter, and discretionary interpretation is the better way to read the market."));
});

test('removes obsolete plan-centered positioning', () => {
  assert.doesNotMatch(html, /written standard|written plan|the plan|named setups|fixed windows|follow rules|plan's windows|plan's levels|plan I trade|you get a plan/i);
});

test('keeps the existing price, access, integrations, and risk terms', () => {
  assert.match(html, /<b>\$200 once<\/b>/);
  assert.match(html, /Lifetime access\. Updates included\./);
  assert.match(html, /href="\/echelon\/app\/"/);
  assert.match(html, /checkoutUrl: ''/);
  assert.match(html, /discordUrl: 'https:\/\/discord\.gg\/FAQD5Cr5p7'/);
  assert.match(html, /No refunds\. The product is information\./);
  assert.match(html, /Trading futures involves substantial risk of loss/);
  assert.match(html, /\$25\/mo when it ships\. Separate, never required\./);
});

test('has unique IDs and resolvable local anchors', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');

  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  for (const anchor of anchors) {
    assert.ok(ids.includes(anchor), `missing target for #${anchor}`);
  }
});
```

- [ ] **Step 2: Run the test and verify the restored page fails the new contract**

Run:

```powershell
node --test tests/landing-copy.test.mjs
```

Expected: FAIL for the new title/header/hero/concepts/FAQ assertions and obsolete plan-centered language; the preservation assertions should pass.

- [ ] **Step 3: Commit the contract test**

Run:

```powershell
git add tests/landing-copy.test.mjs
git commit -m "test: define Echelon landing copy contract"
```

Expected: one commit containing only `tests/landing-copy.test.mjs`.

### Task 2: Replace Plan-Centered Copy with Market-Intention Copy

**Files:**
- Modify: `index.html:6-25`
- Modify: `index.html:165-225`
- Test: `tests/landing-copy.test.mjs`

- [ ] **Step 1: Update metadata and Product structured data**

Use these exact values in `index.html`:

```html
<title>Echelon by D1 · Understand NQ's intention</title>
<meta name="description" content="Echelon teaches the concepts behind NQ price movement—how to read context, recognize intention, and understand what the market is communicating.">
<meta property="og:site_name" content="Echelon by D1">
<meta property="og:title" content="Echelon by D1 · Understand NQ's intention">
<meta property="og:description" content="Echelon teaches the concepts behind NQ price movement—how to read context, recognize intention, and understand what the market is communicating.">
```

Set the Product JSON-LD fields to:

```json
"name": "Echelon by D1",
"description": "Echelon teaches the concepts behind NQ price movement—how to read context, recognize intention, and understand what the market is communicating."
```

- [ ] **Step 2: Update the header, hero, and concepts section**

Replace the existing header and the section currently identified as `plan` with:

```html
<header class="top"><div class="col">
  <span class="name">Echelon by D1</span>
  <nav>
    <a class="tlink" href="#concepts">The concepts</a>
    <a class="tlink" href="#access">Access</a>
    <a class="tlink" href="/echelon/app/">Sign in</a>
  </nav>
</div></header>

<main>
  <div class="hero"><div class="col">
    <h1>Understand what NQ<br><span class="q">is trying to do.</span></h1>
    <p class="sub">Echelon teaches the concepts behind price movement—how to read context, recognize intention, and understand why NQ is moving where it is. Once you see the market this way, you cannot unsee it.</p>
    <p class="fine"><b>$200 once</b> · lifetime access · no subscription · <span data-members>members only</span></p>
  </div></div>

  <section id="concepts"><div class="col">
    <div class="shead"><span class="cap">The concepts</span><span class="cap">Specifics stay inside</span></div>
    <div class="entry"><span class="n">01</span><span class="t">Context</span><span class="d">Understand the conditions that give a move meaning instead of judging candles in isolation.</span></div>
    <div class="entry"><span class="n">02</span><span class="t">Intention</span><span class="d">Recognize what price is seeking, what it is reacting to, and when its behavior changes.</span></div>
    <div class="entry"><span class="n">03</span><span class="t">Confirmation</span><span class="d">Separate meaningful price behavior from noise before committing to an idea.</span></div>
    <div class="entry"><span class="n">04</span><span class="t">Application</span><span class="d">Study the concepts through D1's session breakdowns and the private member room.</span></div>
  </div></section>
```

- [ ] **Step 3: Update the audience and D1 Engine copy**

Use this exact section content:

```html
<section><div class="col">
  <div class="shead"><span class="cap">Who it's for</span></div>
  <div class="flt"><p class="s">You already trade NQ.</p><p class="w">Echelon assumes you understand futures mechanics and have real screen time.</p></div>
  <div class="flt"><p class="s">You want to understand price, not collect setups.</p><p class="w">The work is learning how context changes the meaning of what NQ is doing.</p></div>
  <div class="flt"><p class="s">You study instead of chase.</p><p class="w">No calls and no signals. The goal is to build your own read of the market.</p></div>
  <p class="flt-close">If you only want entries, Echelon is not for you.</p>
</div></section>

<section><div class="col">
  <p class="engine-line"><span class="cap">In development</span><b>The D1 Engine.</b> A chart indicator built around Echelon's concepts to help visualize context on NQ. $25/mo when it ships. Separate, never required.</p>
</div></section>
```

- [ ] **Step 4: Replace the FAQ with concept-led answers**

Keep the existing FAQ markup and use these entries in this order:

```html
<div class="faq">
  <details><summary>What model will you teach me?<span class="mk">+</span></summary><p class="a">I don't teach a mechanical model. I teach discretionary concepts that help you see NQ clearly. I don't believe price can be reduced to rigid rules; context and judgment matter, and discretionary interpretation is the better way to read the market.</p></details>
  <details><summary>What exactly do I get?<span class="mk">+</span></summary><p class="a">A course on reading NQ's context and intention, D1's session breakdowns, access to the members area, and the private member room in Discord. The detailed concepts stay inside Echelon.</p></details>
  <details><summary>Why isn't the curriculum listed?<span class="mk">+</span></summary><p class="a">Because the detailed concepts are the product. The thesis is on this page. If it doesn't earn the $200, a list of module names wouldn't either.</p></details>
  <details><summary>Who is behind it?<span class="mk">+</span></summary><p class="a">D1. I teach the concepts I use to interpret NQ, and the session breakdowns show how I apply them to real price action.</p></details>
  <details><summary>Is this for beginners?<span class="mk">+</span></summary><p class="a">No. You should already understand futures mechanics and have screen time on NQ, or be actively getting it.</p></details>
  <details><summary>Is this signals?<span class="mk">+</span></summary><p class="a">No. Nobody calls trades. Echelon teaches you how to interpret the market for yourself. The room is for study and discussion, not a signal feed.</p></details>
  <details><summary>Do I need the D1 Engine indicator?<span class="mk">+</span></summary><p class="a">No. Echelon stands alone. The indicator will help visualize its concepts when it ships. It's separate, $25/mo, and never required.</p></details>
  <details><summary>How do I get in after I buy?<span class="mk">+</span></summary><p class="a">You land in the members area the moment you pay. Coming back later, you sign in with your email or with Discord.</p></details>
  <details><summary>Refunds?<span class="mk">+</span></summary><p class="a">No refunds. The product is information; once read, it can't be returned. $200 is the whole price: one payment, access for good, updates included.</p></details>
</div>
```

- [ ] **Step 5: Run the content contract and verify it passes**

Run:

```powershell
node --test tests/landing-copy.test.mjs
```

Expected: 6 tests pass, 0 fail.

- [ ] **Step 6: Confirm only the landing page and its contract changed**

Run:

```powershell
git diff --check
git status --short
git diff -- index.html tests/landing-copy.test.mjs
```

Expected: no whitespace errors; only the intended copy changes in `index.html` plus the new test. Do not stage or alter `echelon/admin/index.html` or `echelon/app/index.html` if they appear as user changes.

- [ ] **Step 7: Commit the landing-page copy**

Run:

```powershell
git add index.html
git commit -m "Update Echelon market-intention messaging"
```

Expected: one commit containing only `index.html`.

### Task 3: Verify the Page Visually and Deploy It

**Files:**
- Verify: `index.html`
- Verify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Start a local static server**

Run:

```powershell
python -m http.server 53133
```

Expected: the landing page is available at `http://localhost:53133/`.

- [ ] **Step 2: Inspect desktop and mobile layouts in the browser**

At desktop width, confirm the header, two-line hero, four ledger entries, audience copy, access section, and FAQ remain aligned with the existing ledger design. At a 390-pixel mobile viewport, confirm there is no horizontal scrolling, the header remains readable, the hero wraps naturally, and all FAQ summaries fit.

Expected: the design is unchanged apart from natural copy wrapping, and the browser console contains no new errors.

- [ ] **Step 3: Run final local verification**

Run:

```powershell
node --test tests/landing-copy.test.mjs
git diff --check
git status --short
```

Expected: 6 tests pass, no whitespace errors, and no uncommitted changes from this implementation.

- [ ] **Step 4: Push the approved commits to `main`**

Run:

```powershell
git push origin main
```

Expected: the documentation, contract test, and copy commits are pushed without including unrelated user work.

- [ ] **Step 5: Monitor the Hostinger deployment**

Run:

```powershell
gh run list --workflow "Deploy to Hostinger" --limit 1
gh run watch --exit-status <run-id>
```

Expected: the newest `Deploy to Hostinger` workflow completes successfully.

- [ ] **Step 6: Verify the live page serves the approved positioning**

Run:

```powershell
$live = (Invoke-WebRequest -UseBasicParsing 'https://d1fpc3.com/?verify=echelon-intention').Content
$live | Select-String -SimpleMatch 'Echelon by D1', 'Understand what NQ', 'What model will you teach me?'
```

Expected: all three phrases are present in the live HTML returned from `d1fpc3.com`.

