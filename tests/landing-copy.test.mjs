import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('uses the software-first Echelon positioning', () => {
  assert.match(html, /<title>Echelon by d1 · The NQ trading software<\/title>/);
  assert.match(html, /Trade with <em>clarity\.<\/em>/);
  assert.ok(html.includes('one piece of software'), 'meta description sells the software');
  assert.match(html, /<span class="label">The software<\/span>/);
  assert.match(html, /Web and Windows desktop, one account\./);
});

test('no candle charts and no dashboard mockups on the landing (D1 rule, 8/24)', () => {
  assert.doesNotMatch(html, /hero-chart/, 'candle chart must stay off the landing');
  assert.doesNotMatch(html, /class="demo"/, 'dashboard replica must stay off the landing');
  assert.match(html, /class="soft-band"/, 'the software is a flat hairline band');
});

test('presents the four approved concepts, d1 lowercase', () => {
  const entries = [
    ['Context', 'Understand the conditions that give a move meaning instead of judging candles in isolation.'],
    ['Intention', 'Recognize what price is seeking, what it is reacting to, and when its behavior changes.'],
    ['Confirmation', 'Separate meaningful price behavior from noise before committing to an idea.'],
    ['Application', "Study the concepts through d1's session breakdowns and the private member room."],
  ];
  for (const [title, description] of entries) {
    assert.ok(html.includes(`<span class="t">${title}</span>`), `missing concept ${title}`);
    assert.ok(html.includes(`<span class="d">${description}</span>`), `missing description for ${title}`);
  }
});

test('renders the real curriculum, without stating a lesson count', () => {
  assert.match(html, /id="curriculum" hidden/, 'curriculum section hides until rows arrive');
  assert.match(html, /rest\/v1\/curriculum\?select/, 'outline reads the live curriculum view');
  assert.doesNotMatch(html, /\d+ lessons/i, 'lesson count stays off the landing (D1 rule)');
});

test('states the discretionary teaching philosophy in the lead FAQ', () => {
  assert.match(html, /<summary>What model will you teach me\?<span class="mk">\+<\/span><\/summary>/);
  assert.ok(html.includes("I don't teach a mechanical model. I teach discretionary concepts that help you see NQ clearly. I don't believe price can be reduced to rigid rules; context and judgment matter, and discretionary interpretation is the better way to read the market."));
});

test('does not promise GEX inside the course purchase', () => {
  assert.match(html, /The D1 GEX board sits in there too, for its subscribers\./);
});

test('keeps the numbers off the landing and the terms intact', () => {
  assert.doesNotMatch(html, /\$\d+ ?(once|\/mo)/, 'prices belong on /pricing/');
  assert.match(html, /href="\/pricing\/"/);
  assert.match(html, /href="\/echelon\/app\/"/);
  assert.match(html, /checkoutUrl: 'https:\/\/buy\.stripe\.com\//);
  assert.match(html, /discordUrl: 'https:\/\/discord\.gg\/FAQD5Cr5p7'/);
  assert.match(html, /No refunds\. The product is information\./);
  assert.match(html, /Trading futures involves substantial risk of loss/);
});

test('has unique IDs and resolvable local anchors', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id found');

  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  for (const anchor of anchors) {
    if (anchor === '') continue; // placeholder hrefs filled by CONFIG at runtime
    assert.ok(ids.includes(anchor), `missing target for #${anchor}`);
  }
});
