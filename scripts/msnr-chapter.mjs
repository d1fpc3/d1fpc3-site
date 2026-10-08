// Chapter 08 (MSNR): the lesson content, kept here as the source of truth.
//   node scripts/msnr-chapter.mjs          prints the SQL
//   node scripts/msnr-chapter.mjs --apply  runs it on the Echelon project (Management API), new lesson rows
//   node scripts/msnr-chapter.mjs --update rewrites the existing lessons in place (keeps member progress)
// Replaces every lesson in the msnr module. Images live in lesson-files under
// image/course/msnr-*.png (drawn by scripts/msnr-diagrams.mjs).
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const MODULE = "013d6c95-15dc-494b-9487-8ecc50a87763";
const MODULE_SUMMARY = "Malaysian support and resistance, built on the close: five basic levels, key levels, and reading direction.";

const text = (md) => ({ type: "text", md: md.trim() });
const img = (name, alt, caption) => ({ type: "image", path: `image/course/${name}.png`, alt, caption });

const LESSONS = [
  {
    slug: "msnr-read-the-close",
    title: "Read the close",
    summary: "MSNR is built on the close. The body is the decision, the wick is the footprint.",
    blocks: [
      text(`
> This chapter follows the MSNR framework Ariff T teaches in his free series on YouTube, rewritten for how we trade NQ.

## How MSNR is built

Four layers. Each one sits on the one before it:

1. **Basic levels.** Five shapes that show up on every chart, every day.
2. **Key levels.** The few basic levels actually worth trading.
3. **Direction.** Which way the timeframe you trade is pointing.
4. **Confirmation.** What price does at the level before you commit.

No indicators, no order blocks, no five minute explanations. It is pattern recognition, and every pattern is read off one thing: the close.

## Body and wick

Every candle has four prices: open, high, low, close.

- The **body** runs from the open to the close. It is the **decision**: where price settled when the candle's time ran out.
- The **wick** is everything outside the body. It is the **footprint**: price went there and got sent back. Worth noticing, but it is not a decision.`),
      img("msnr-candle-anatomy", "An up candle and a down candle with open, high, low and close labelled. The body is marked as the decision and the wick as the footprint.", "The body is where price settled. The wick is where it visited and got refused. Every level in this chapter comes off a body."),
      text(`
## The close is the price that matters

- Every MSNR level is drawn off the **bodies**: an open or a close. Never the tip of a wick.
- A **wick** through a level is a test. A **body close** through a level is a decision.
- So whether a level held or broke comes down to one question: where did the candle close?

## The line chart

A line chart is only the closes, joined up. Nothing else. It strips the wicks away and shows you the real turns, which is why the A and V shapes in the next lesson are easy to see on it. When a candle chart looks noisy, flip to a line chart and look again.`),
      img("msnr-line-chart", "Candles with a white line joining each close. The line forms a peak marked A and a valley marked V.", "The white line is the line chart. Same candles, wicks gone. The peak is an A, the valley is a V."),
    ],
  },
  {
    slug: "msnr-classic-and-miss",
    title: "Classic levels and the miss",
    summary: "Where a move turned, and the empty space price has to leave before you trade the return.",
    blocks: [
      text(`
## The five basic levels

Everything in MSNR starts with five levels. You will see every one of them every day.`),
      img("msnr-five-levels", "Five small sketches side by side: classic, gap, breakout, HNS and broken HNS, each with its line and a ring on the return that gets traded.", "The five basic levels. The ring on each one is the return you trade, and every one of them needs a miss first."),
      text(`
- **Classic**: where a move turned.
- **Gap**: the seam between two candles of the same colour.
- **Breakout**: a classic that a body closed through.
- **HNS**: a break that failed.
- **Broken HNS**: a failed break that failed too.

This lesson covers the classic, and the one rule every level runs on: the miss.

## Classic A and classic V

- A **classic A** is resistance. An up candle closes and the next candle opens down from the same price. The line goes on that seam between the bodies at the top of the turn. On a line chart it is a peak.
- A **classic V** is support. The same thing flipped: a down candle closes and the next one opens up from the same price at the bottom of the turn. On a line chart it is a valley.
- The wicks poke past the line. Ignore them. The level is the body.`),
      img("msnr-classic", "Left: a classic A drawn on the seam between an up candle and a down candle, a miss, then the first return to the line sells off. Right: the same thing flipped as a classic V.", "The line sits on the body seam, not the wick. Price leaves, misses the line on its first pullback, then the first real return is the trade."),
      text(`
## The miss

Before price comes back to a level, it has to **leave empty space first**. Price moves away from the line, then makes a pullback that does **not** reach it. That untouched pocket between the line and the failed pullback is the **miss**.

- A miss means price left something behind. The later return to the line is a clean first touch.
- No miss means price is still sitting on the level and chopping around it. There is nothing to come back to. Skip it.
- You will hear other people call this delivery. Here it is just the miss.`),
      img("msnr-miss", "Left: price leaves a line, pulls back without touching it, then returns for a clean first touch. Right: price keeps tagging the line with no space, marked with a cross.", "Left, a miss: space left behind, then a clean return. Right, no miss: price never left the line, so there is nothing to trade."),
      text(`
## How to trade a classic

1. Mark the classic on the body seam.
2. Wait for the miss.
3. The first return to the line is the trade. Sell a classic A, buy a classic V.`),
    ],
  },
  {
    slug: "msnr-gap-and-breakout",
    title: "Gap and breakout",
    summary: "The seam between two candles of one colour, and a classic that a body closed through.",
    blocks: [
      text(`
## Gap

A gap is the seam **between two candles of the same colour**. Two up candles in a row: the line goes where the first one closes and the second one opens. Same for two down candles.

- It works like any other level. Price moves on, leaves a miss, and comes back to the seam. That return is the trade, in the direction of the two candles.
- It also works as a **breakout** level. If a body closes through the seam the other way, wait for a miss on the far side and trade the return to it.`),
      img("msnr-gap", "Left: two up candles with a line on their seam, a miss, a return to the seam, and a continuation up. Right: a body closes down through the seam, a miss below, then a retest from below that sells off.", "Left, the gap holds: miss, return, continue. Right, the same seam used as a breakout: a body closes through it, misses, and the retest from the other side is the trade."),
      text(`
## Breakout

A breakout is a **classic that got closed through**.

1. A classic forms. Say a classic A, resistance.
2. A candle **body closes above it**. A wick above it does not count.
3. Price keeps going and leaves a **miss** above the line.
4. Price comes back down to the line. The old resistance is now where you buy.

Flip it for a classic V that gets closed through to the downside: the old support is where you sell.`),
      img("msnr-breakout", "Candles form a classic A, a later candle body closes above the line, the next candles leave a miss, then price returns to the line and moves higher.", "The body close through the classic is the break. The miss above it is the space. The return to the line is the buy."),
      text(`
## The two checks that never change

Every level in this chapter runs on the same two checks:

- A **body close** decides it.
- A **miss** has to happen before the return.`),
    ],
  },
  {
    slug: "msnr-hns-and-broken-hns",
    title: "HNS and broken HNS",
    summary: "A break that fails, and a failure that fails. Both trade the retest.",
    blocks: [
      text(`
## HNS

HNS is head and shoulders, read the MSNR way. It is a **break that fails**.

1. A classic gives you a line. That is the left shoulder.
2. Price pushes through the line. That push is the head. Everyone who bought the break is now trapped.
3. A body **closes back below** the line. The break has failed.
4. Price leaves a miss below the line.
5. Price comes back up to the line, the right shoulder. That return is the sell.

The bullish version is the same thing upside down: price breaks below a line, a body closes back above it, price misses, and the return down to the line is the buy.`),
      img("msnr-hns", "Left: a line from a classic, a head that spikes above it, a close back below, a miss, and a retest of the line that sells off. Right: the bullish version upside down.", "The head is the trap. The close back inside is the failure. The retest of the line, after a miss, is the trade."),
      text(`
## Broken HNS

A broken HNS is an **HNS that fails too**.

1. The HNS forms: the head, then a close back inside the line.
2. Instead of rolling over, price **closes back through the line** the other way.
3. The line has now been broken twice. Wait for the miss.
4. The retest of the line is the trade, in the direction of the second break.

It is the hardest of the five to see at first, and one of the strongest once you can.`),
      img("msnr-bhns", "Left: an HNS forms below a line, then price closes back above it, leaves a miss, and the retest from above moves higher. Right: the same thing flipped for a sell.", "The HNS forms, then fails. The second break through the line is what you follow, on the retest after a miss."),
      text(`
## Homework: level marking

Pull up NQ on the 30 minute chart and go swing by swing. Almost every swing high and swing low on it was made at one of the five levels. For each one, find the reason: classic, gap, breakout, HNS or broken HNS.

If you cannot find a reason on the 30 minute, look one timeframe down. It was probably a 15 minute level. Do this every day until you see the levels before you go looking for them.`),
    ],
  },
  {
    slug: "msnr-key-levels",
    title: "Key levels",
    summary: "The open of the candle that closed past an opposite candle's open. The levels worth trading.",
    blocks: [
      text(`
## Too many levels

Mark all five basic levels and your chart fills up with lines. They are not all worth the same. **Key levels** are the ones you prioritise, because they are where price made a real decision.

## The engulfing open

A key level comes from a candle **closing past the open of an earlier candle of the opposite colour**. It ate that candle, so call it the eater. Its open is the key level. Most of the time the candle it ate is the one right before it, so start there.

- **Bearish key level.** An up candle, then a down candle that **closes below the up candle's open**. Mark the down candle's **open**. When price comes back up to that line, expect sellers.
- **Bullish key level.** A down candle, then an up candle that **closes above the down candle's open**. Mark the up candle's **open**. When price comes back down to it, expect buyers.`),
      img("msnr-key-level", "Left: an up candle, then a down candle that closes below the up candle's open, with a line at the down candle's open that price returns to and sells off. Right: the bullish mirror.", "The candle that closes past the previous open is the engulfing candle. Its open is the key level, and the return to it is the trade."),
      text(`
## Only the close eats

A wick that pokes past the open does not count. The candle has to **close** past it. If the body does not finish beyond the open, there is no key level.

## When two candles share the work

Sometimes one candle is not enough. Picture an up candle, then two down candles, A and B.

- A closes **above** the up candle's open. A did not eat it.
- B closes **below** the up candle's open. **B is the eater.**
- So the key level is **B's open**, which is also the seam between A and B.

Always ask the same question: whose close actually went past the open?

## The candle it ate can sit further back

Every opposite candle gets eaten once, by the **first** candle whose close gets past its open. That does not have to be the next candle.

- Price sells off from a classic A, grinds lower for a few hours, then turns up. The first strong up candle eats the small down candles near the bottom, so its open is a key level.
- A few candles later, another up candle closes above the open of the **down candle that started the sell-off**, the one at the classic A on top. Nobody had eaten it yet, so this candle is an eater too, and **its open is a key level as well**.
- That second one is often the best of the lot. It is the candle that broke out the classic, and the pullback to its open is exactly the retest Ariff trades.

So for every candle, ask: did its close get past the open of **any** opposite candle that nobody has eaten yet? If it did, its open is a key level.`),
      img("msnr-key-level-far", "A sell-off from a classic A, then two up candles. Candle 1 closes above the small down candles at the bottom and its open is key level 1. Candle 2 closes above the open of the down candle that started the drop and its open is key level 2, which price retests and then rallies from.", "Both are eaters. Candle 2 is the one that broke out the classic, and the pullback to its open is the trade. This is how Ariff marked gold on December 16, 2025."),
      img("msnr-key-level-gap", "An up candle followed by two down candles, A and B. A closes above the up candle's open, B closes below it. The key level is drawn at B's open and price returns to it and sells off.", "A did not close past the open, B did. So B is the engulfing candle and its open, the seam between A and B, is the key level."),
      text(`
## What to expect from them

We measured it. On NQ from 2019 to 2026, 1.8 million first touches: an MSNR level holds its first touch about one point more often than a random price right next to it (48.7% against 47.6% on the 15 minute to 1 hour), and a key level holds about as often as any other MSNR level.

So the level only gives you the **place**. What makes it a trade is the other two pillars: the direction, and the confirmation on the small timeframe when price gets there. Mark every key level you find on the NQ 1 hour chart for a week and watch what price does each time it comes back.`),
    ],
  },
  {
    slug: "msnr-direction",
    title: "Direction",
    summary: "Which way to trade, read off a timeframe: a body close through a classic, or a held HNS.",
    blocks: [
      text(`
## Three pillars

Every MSNR trade stands on three things, in this order:

1. **Direction.** Are you buying or selling?
2. **Key level.** Where, in that direction?
3. **Confirmation.** Is the level holding right now?

This lesson is the first pillar. Get it wrong and the other two do not matter.

## Direction is a timeframe question

Direction only means something on a timeframe. Group the timeframes by the job they do:

- **Monthly, weekly, daily.** Swing direction, for trades you hold for days or longer.
- **4 hour, 1 hour, 30 minute.** Intraday direction. This is where NQ day trades get their side.
- **15, 5 and 1 minute.** Confirmation only. Never use them to decide direction.`),
      img("msnr-timeframes", "Three columns of timeframes: swing (monthly, weekly, daily), intraday (4 hour, 1 hour, 30 minute) and confirmation (15, 5 and 1 minute).", "The bigger the trade you want to hold, the bigger the timeframe you read direction on. The small timeframes are for entries only."),
      text(`
## How a trend really moves

An uptrend makes higher highs and higher lows. Everyone knows that part. What gets left out is how it moves between them. There are only two modes:

- **Continuation**, the push to a new high.
- **Pullback**, the drop that sets up the next push.

Every pullback ends **on a key level** before the next continuation starts. A downtrend is the same thing flipped: every pullback up ends on a key level before the next leg down.`),
      img("msnr-trend", "Left: an uptrend zigzag with HH and HL labels, each pullback ending on a short key level line. Right: the downtrend mirror with LL and LH.", "Continuation, pullback, continuation. Each pullback stops on a key level. That is the piece most explanations of trend leave out."),
      text(`
## Sign 1: a body close through a classic

Direction changes when a candle **body closes through a classic level**.

- On the 1 hour, that flips 1 hour direction. On the daily, it flips daily direction.
- A wick through the classic changes nothing. It has to be the body.

Some people call this a break of structure. Here it is simply a breakout of a classic.

## Sign 2: price respects an HNS

When price comes back to an HNS line and holds it, expect a **big move**. If price then also closes through the classic on the other side, that is the strongest setup in the whole method, and it is the one you hold.`),
      img("msnr-direction-signs", "Left: candles with a body closing above a classic level. Right: price holds an HNS line, then breaks the classic high above it and runs.", "Sign 1 flips direction on the timeframe it happens on. Sign 2, a held HNS followed by a close through the classic, is the big one."),
      text(`
## Then find a key level

Once direction has changed, look for the **nearest key level in the new direction** and wait for price to come back to it. Break, pull back to a key level, go. That is the whole idea.`),
    ],
  },
  {
    slug: "msnr-process",
    title: "The process",
    summary: "Direction, key level, confirmation, in order. Then the reps that make it stick.",
    blocks: [
      text(`
## The whole thing, in order

1. **Pick your timeframe family.** For NQ day trades that is the 4 hour, 1 hour and 30 minute.
2. **Read direction.** What was the last classic a body closed through on that timeframe? That is your side. No break, no side, no trade.
3. **Mark key levels in that direction.** Engulfing opens below price if you are buying, above price if you are selling.
4. **Wait for the first return.** The level needs a miss before price comes back. First touch only.
5. **Confirm on the small timeframes.** Drop to the 15, 5 or 1 minute at the level and use the entry from chapter 05. If the level does not hold there, there is no trade.`),
      img("msnr-process", "A line chart where price closes through a classic, pulls back to a key level, and moves up. A zoomed box shows small timeframe candles holding the key level.", "One: a body closes through the classic. Two: price pulls back to a key level in the new direction. Three: the level holds on the small timeframe, and that is the entry."),
      text(`
## Do the reps

Nobody gets this from reading. Mark levels every day. Note which were classics, gaps, breakouts, HNS and broken HNS, which were key levels, and what price did on the return. Backtest it until the shapes jump out at you.

## The phases every trader goes through

- **The loop.** Grab a strategy from a video, fail, switch strategy, grab another. Most people never leave it. You are better than that.
- **Learning.** One teacher, one method. Do what it says, take real notes, and trust it even when a step does not make sense yet.
- **Experience.** The hard part, and the longest. Journal every trade precisely, collect a lot of data, adjust the method a little when the data tells you to, and stay brave through the losses.
- **Mastery.** One exact process, repeated. Trading feels light, and the account grows steadily.`),
      img("msnr-phases", "A loop of three boxes, grab partial info, fail, switch strategy, with an arrow leading out to three stages: learning, experience and mastery.", "The loop keeps most people stuck. The way out is one method, learned properly, then proven with your own data."),
    ],
  },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = LESSONS.map((l, i) => `(${q(MODULE)}, ${q(l.slug)}, ${q(l.title)}, ${q(l.summary)}, ${i + 1}, 'written', ${q(JSON.stringify(l.blocks))}::jsonb, true, false)`);
const SQL = `begin;
update public.modules set summary = ${q(MODULE_SUMMARY)} where id = ${q(MODULE)};
delete from public.lessons where module_id = ${q(MODULE)};
insert into public.lessons (module_id, slug, title, summary, position, kind, blocks, is_published, is_preview) values
${rows.join(",\n")};
commit;`;

// --update: rewrite the existing lessons in place, matched by slug, so lesson ids and member progress survive.
const UPDATE = `begin;
update public.modules set summary = ${q(MODULE_SUMMARY)} where id = ${q(MODULE)};
${LESSONS.map((l, i) => `update public.lessons set title = ${q(l.title)}, summary = ${q(l.summary)}, position = ${i + 1}, blocks = ${q(JSON.stringify(l.blocks))}::jsonb where module_id = ${q(MODULE)} and slug = ${q(l.slug)};`).join("\n")}
commit;`;

for (const l of LESSONS) for (const b of l.blocks) if ((b.md && /—/.test(b.md)) || /—/.test(b.caption || "") || /—/.test(b.alt || "")) throw new Error("em dash in " + l.slug);

if (process.argv.includes("--apply") || process.argv.includes("--update")) {
  const tok = readFileSync(join(homedir(), ".supabase", "access-token"), "utf8").trim();
  const query = process.argv.includes("--update") ? UPDATE : SQL;
  const r = await fetch("https://api.supabase.com/v1/projects/cqdignbleethroyxxvzr/database/query", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  console.log(r.status, await r.text());
  if (!r.ok) process.exit(1);
} else console.log(SQL);
