# Radar: deal and local event alerts for D1 (2026-10-08)

D1, 10/8/26: "i want to create alerts when events happen near me, i want alerts when special deals
happen that i can actually save money with without giving out information, i want amazon deals
walmart deals". Approved in chat the same day ("Approve, build it").

## What D1 chose
- Alerts land as an **Echelon push** (the admins-only path the Kalshi bot uses), and everything sits
  in a new **Admin > Radar** place with two pages, **Deals** and **Events**. Only D1's login reads it.
- **Near me** = Joppa and Bel Air, MD (Harford County: Bel Air, Joppa, Joppatowne, Abingdon, Edgewood,
  Fallston, Forest Hill, Kingsville, Churchville, Belcamp, Jarrettsville, White Marsh, Perry Hall,
  Aberdeen, Havre de Grace, Street, Whiteford, Pylesville, Darlington).
- **Events** = free and community events, and car meets and shows.
- **Deals** = Amazon and Walmart only. A watchlist (seeded: food, Gatorade, Monster, Bloom, Alani Nu,
  bagels) plus hot deals that clear a high bar.
- **No information given out**: public pages and RSS only. No account, no API key, no email, no
  signup, nothing about D1 sent to any source.

## How it runs
- Edge function `radar` in the Echelon project (source `supabase/functions/radar`, `verify_jwt =
  false`). Callers: pg_cron through `public.radar_kick(body)` with the shared `x-webhook-secret`, and
  the admin page with D1's own session (the function checks the JWT is the owner's).
- Calls: `{scan:'deals'}` every 30 min, `{scan:'events'}` twice a day, `{digest:'morning'}` at 8:00 New
  York, `{digest:'weekend'}` Friday 16:00 New York. Two UTC crons each for the digests (EDT/EST), the
  function only acts in the right New York hour, once per day (`radar_prefs.sent`).
- If a source turns cloud IPs away, the same scan can run from D1's PC instead (home IP); not needed
  on day one.

## Sources
- Deals: Slickdeals front page RSS (editor-vetted), popular deals RSS, and one Slickdeals search RSS
  per watchlist term. Store = the "<Store> has ..." line of the post; only Amazon and Walmart are kept.
- Events: allevents.in town pages and Eventbrite free-events pages for the towns above (both carry
  schema.org Event JSON-LD), plus carshowradar.com Maryland for car shows. An event is kept when its
  address is in one of the towns AND it reads as a car meet/show or a free/community event.

## When a deal pushes
- Watchlist hit at Amazon or Walmart (and under the term's max price when one is set), or
- a front page deal at 40%+ off (prefs.min_pct) or marked lowest/all-time low, or
- a food-category front page deal at Amazon or Walmart.
- Ranked watchlist > hot > food; at most 3 deal pushes a day (prefs.deal_cap), none 22:00 to 8:00 New
  York; deals found overnight push in the morning if still under 12 hours old. Several at once go out
  as one push.

## When events push
- One 8:00 digest of events first seen in the last day, and a Friday 16:00 "this weekend" digest.
  Never one push per event.

## Data
- `radar_items` (deal and event rows, unique per source + id, pushed/dismissed/saved stamps),
  `radar_watch` (term, search query, match pattern, max price), `radar_prefs` (one row: push switches,
  cap, min %, digest stamps). Owner-only RLS (D1's uid), the same as `owner_money`.

## Admin > Radar
- Deals: summary cards (today's pushes, live deals, best % off), the list as rows with price, was
  price, % off pill, store, why it matched, Dismiss and Open; a watchlist editor (add a term with an
  optional max price, switch off, remove); push switch.
- Events: rows with the gold calendar tile (the Personal page's), place, Free / Car pills, Open,
  Dismiss; This weekend first. Push switch. "Scan now" on both.

## Testing
- Dry runs of each scan against live sources, counts and samples checked by eye.
- A real scan into the tables, one real push to D1's devices, Playwright through Admin > Radar with
  D1's admin session (open both pages, add and remove a watch term, dismiss a row, Scan now), at
  2560, 1440 and 390 wide.
