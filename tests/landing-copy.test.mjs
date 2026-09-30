import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// the page as read: tags out, whitespace folded (the 9/27 hero wraps each word in its own span)
const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

test('uses the software-first Echelon positioning', () => {
  assert.match(html, /<title>Echelon by d1 · The NQ trading software<\/title>/);
  assert.ok(text.includes('Trade with clarity.'), 'the hero line');
  assert.ok(html.includes('one piece of software'), 'meta description sells the software');
});

test('the landing stays stripped (D1 rules, 8/24)', () => {
  assert.doesNotMatch(html, /hero-chart/, 'candle chart must stay off the landing');
  assert.doesNotMatch(html, /class="demo"/, 'dashboard replica must stay off the landing');
  assert.doesNotMatch(html, /soft-band|class="inside"|how-wrap|data-recap/,
    'panels, software band, steps and recap tease stay deleted');
});

test('the feature index and phone screens stay OFF the landing (D1, 9/6)', () => {
  assert.doesNotMatch(html, /class="in-row"|id="inside"|id="screens"|screen-(overview|lesson|gex|news)\.webp/,
    'the numbered tab list and the app screenshots were cut; the who-is-d1 block and hero fine line stay');
  assert.doesNotMatch(html, /class="what"|one app for NQ/, 'the hero "one app" line stays deleted');
  assert.match(text, /lifetime access\s*no subscription\s*members in the Discord/, 'the hero fine line: lifetime, no subscription, the Discord count');
});

test('the landing sells again, no application (D1, 9/29: "not application based", "old pricing")', () => {
  assert.ok((html.match(/data-buy/g) || []).length >= 3, 'the nav, the hero and the card all say Join');
  assert.doesNotMatch(html, /data-apply|apply-form|submit_application|ap-modal/, 'the application is gone');
  assert.match(html, /location\.href = '\/pricing\/'/, 'Join goes to the pricing page, where the checkout lives');
  assert.ok((html.match(/href="\/pricing\/"/g) || []).length >= 3, 'Pricing is linked from the nav, the card and the footer');
  assert.match(text, /\$500\s*once/, 'the price is on the card');
  assert.match(text, /Code D1 takes 20% off at checkout: \$400\./);
  assert.match(html, /"price": "500"/, 'the structured data carries the offer');
  assert.doesNotMatch(html, /D1 GEX/, 'it is just GEX on the landing');
  assert.doesNotMatch(html, /\u2014|&mdash;/, 'no long dashes');
});

test('concepts and curriculum stay OFF the landing (D1 rule, 8/24)', () => {
  assert.doesNotMatch(html, /rest\/v1\/curriculum/, 'never fetch the course outline publicly');
  assert.doesNotMatch(html, /id="curriculum"|id="concepts"/, 'no concepts or curriculum sections');
  assert.doesNotMatch(html, /What Echelon teaches/, 'the teaching stays inside Echelon');
  assert.doesNotMatch(html, /\d+ lessons/i, 'lesson count stays off the landing');
});

test('states the discretionary teaching philosophy in the lead FAQ', () => {
  assert.match(html, /<summary>What model will you teach me\?<i class="pm" aria-hidden="true"><\/i><\/summary>/);
  assert.ok(html.includes("I don't teach a mechanical model. I teach discretionary concepts that help you see NQ clearly. I don't believe price can be reduced to rigid rules; context and judgment matter, and discretionary interpretation is the better way to read the market."));
});

test('does not promise GEX inside the course purchase', () => {
  assert.match(html, /The GEX board sits in there too, for its subscribers\./);
});

test('one price on the landing, the rest on /pricing/, and the terms intact', () => {
  assert.equal((text.match(/\$\d[\d,]*/g) || []).filter((p) => p !== '$500' && p !== '$400').length, 0, 'only Echelon and its code price on the landing');
  assert.doesNotMatch(text, /\/mo\b/, 'no subscriptions on the landing');
  assert.match(html, /href="\/echelon\/app\/"/);
  assert.match(html, /discordUrl: 'https:\/\/discord\.gg\/FAQD5Cr5p7'/);
  assert.match(html, /No refunds\. The product is information;/);
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
