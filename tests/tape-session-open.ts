// Run from the repo root:  deno run --allow-net --allow-read --allow-write tests/tape-session-open.ts
// Proves the tape function repairs what Yahoo drops (D1, 2026-09-27: "NWOG isn't correct and the weekly open
// isn't correct"): Sunday's 18:00 to 18:09 ET never reach Yahoo's intraday bars, and after the close a
// settlement "bar" at 17:00 moves Friday's close. Uses the SHIPPED yahoo() against the live Yahoo feed, and
// checks the answer against Yahoo's own daily bar.
const src = await Deno.readTextFile(new URL("../supabase/functions/tape/index.ts", import.meta.url));
const cut = src.indexOf("Deno.serve(");
const tmp = new URL("./tape-engine.tmp.ts", import.meta.url);
// the Supabase client is only for the archive routes; the engine under test never touches it
const engine = src.slice(0, cut).replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, "const createClient = (..._a: unknown[]) => { throw new Error('not in this test'); };");
await Deno.writeTextFile(tmp, engine + "\nexport { yahoo, etMin, tradeDate };\n");
const M = await import(tmp.href);
let fails = 0;
const ok = (c: boolean, w: string) => { console.log(`  ${c ? "ok  " : "FAIL"} ${w}`); if (!c) fails++; };
const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const daily = (await M.yahoo("NQ", "interval=1d&range=3mo", true)).bars as number[][];   // true keeps the live session's daily bar, the week being repaired
const byDate = new Map(daily.map((d) => [M.tradeDate(d[0]), d]));

for (const [params, label] of [["interval=1m&range=8d", "1m"], ["interval=5m&range=60d", "5m"], ["interval=60m&range=3mo", "60m"]]) {
  console.log(`\n${label}`);
  const { bars } = await M.yahoo("NQ", params);
  // every Sunday session in the window
  let sundays = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i][0] - bars[i - 1][0] < 20 * 3600) continue;
    const b = bars[i], d = byDate.get(M.tradeDate(b[0]));
    if (!d) continue;
    // a holiday week can reopen at another hour entirely (Labor Day 2026: the 60m feed resumes Tue 00:00); that is not the 18:00 open this repairs
    if (M.etMin(b[0]) < 18 * 60 || M.etMin(b[0]) >= 19 * 60) { console.log(`  skip ${f.format(new Date(b[0] * 1000))}: not an 18:00 reopen`); continue; }
    sundays++;
    const tail = sundays <= 3 || i > bars.length - 3000;
    if (!tail) continue;
    ok(M.etMin(b[0]) === 18 * 60 && b[1] === d[1], `${f.format(new Date(b[0] * 1000))}: the week opens at 18:00 at ${b[1]} (the daily bar says ${d[1]})`);
    // the week's first minutes reached the daily high or low: some bar of the session now carries it
    let hi = -Infinity, lo = Infinity; for (let j = i; j < bars.length && bars[j][0] < b[0] + 23 * 3600; j++) { hi = Math.max(hi, bars[j][2]); lo = Math.min(lo, bars[j][3]); }
    ok(hi >= d[2] - 0.01 && lo <= d[3] + 0.01, `  the session's high ${hi} and low ${lo} match the daily bar's ${d[2]} / ${d[3]}`);
    // Friday's close: the last bar before the weekend is the last trade, never a volume-1 settlement print at 17:00
    const fri = bars[i - 1];
    ok(!(M.etMin(fri[0]) === 17 * 60 && fri[5] <= 1), `  Friday's last bar is a trade at ${f.format(new Date(fri[0] * 1000))}, close ${fri[4]}`);
  }
  ok(sundays > 0, `found ${sundays} week opens to check`);
}

// a backfill slice that ends mid-session must not hand the day's later high or low to the 18:00 bar
console.log("\na 7-day slice cut mid-session");
{
  const { bars } = await M.yahoo("NQ", "interval=1m&range=8d");
  const opens = bars.filter((b: number[], i: number) => i > 0 && b[0] - bars[i - 1][0] >= 20 * 3600 && M.etMin(b[0]) === 18 * 60);
  const o = opens[0];
  if (!o) console.log("  (no week open in range)");
  else {
    const cut = await M.yahoo("NQ", `interval=1m&period1=${o[0] - 3 * 86400}&period2=${o[0] + 4 * 3600}`);
    const s = cut.bars.find((b: number[]) => b[0] === o[0]);
    ok(!!s && s[2] === Math.max(s[1], s[4]) && s[3] === Math.min(s[1], s[4]), `the cut slice's 18:00 bar keeps to its own open and close: ${JSON.stringify(s)} (whole-session answer ${JSON.stringify(o)})`);
  }
}
await Deno.remove(tmp);
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
Deno.exit(fails ? 1 : 0);
