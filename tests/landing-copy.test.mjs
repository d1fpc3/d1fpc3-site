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

test('concepts and curriculum stay OFF the landing (D1 rule, 8/24)', () => {
  assert.doesNotMatch(html, /rest\/v1\/curriculum/, 'never fetch the course outline publicly');
  assert.doesNotMatch(html, /id="curriculum"|id="concepts"/, 'no concepts or curriculum sections');
  assert.doesNotMatch(html, /What Echelon teaches/, 'the teaching stays inside Echelon');
  assert.doesNotMatch(html, /\d+ lessons/i, 'lesson count stays off the landing');
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
