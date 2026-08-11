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
    ['Application', "Study the concepts through D1's session breakdowns and the private member room."],
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
