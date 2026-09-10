> Superseded the same day: D1 parked the Desk for a charting workspace (the Chart view, `tests/app-chart-visual.mjs`) and the NQ archive (`nq_bars`). Kept for the record.

# Intention Desk

The session instrument. One screen a member opens before the bell and keeps open through the close: the day's read, the live NQ tape with the levels that matter drawn on it, the news that can move it, and at the close a scorecard of what the read got right.

Echelon sells "read NQ context and intention". Until now the app showed the gamma board (a snapshot) and the calendar (a list). Neither shows the tape. The Desk puts price, levels and time on one canvas and narrates it.

## What it is

Members app view `desk`, sidebar entry "Desk" right under Overview. Overview gets a one-line "Today's read" strip up top that opens it.

Desktop layout, flat like the rest of the app (hairlines, no boxes):

1. **Session strip.** State pill (Pre-market, Open, Closed, Weekend), the ET clock, NQ last with change against the prior settle in points and percent, today's range, minutes to the open or close.
2. **The tape.** A canvas chart of NQ, 1-minute bars from Yahoo Finance through a new `tape` edge function. Window: 08:00 to 16:15 ET, pre-market dimmed. 1m / 5m / 15m aggregation toggle (`.seg`). Overlays, drawn as labelled horizontal lines:
   - structure, for everyone: prior settle (dashed), overnight high and low (Globex 18:00 to 09:30), opening range (first 15 minutes, shaded), session high and low tags, last price tag.
   - gamma, for D1 GEX holders and staff: 0DTE call wall, put wall, gamma flip, GTBR band (shaded), major wall, swing walls (dotted). Non-holders see the structure layer only and a locked "Gamma layer" row in the ladder that opens the indicators page.
   - crosshair with time and OHLC readout on hover or touch.
   - live: the tape re-fetches every 20 seconds while the session is open, every 5 minutes otherwise. The last bar grows in place.
3. **The read.** Deterministic prose, no AI, composed from the tape, the worker and the calendar:
   - where price is against yesterday's settle and the overnight range;
   - (GEX) the regime line, confirmed or not by today's flow, the GTBR band, the walls with their health tags, the flip, the major wall;
   - the calendar: high and medium impact USD releases today with times, or "nothing on the calendar";
   - an intention line: what the regime says to expect (expansion or compression) and the one condition that changes it (an edge of the band breaking, the flip being reclaimed).
4. **Levels ladder.** Every drawn level sorted by price with the distance from last in points, the nearest above and below in ink, the rest muted.
5. **Today's news.** High and medium impact rows with a countdown, reusing the News tab's rows.
6. **Proximity alerts.** While the session is open, when last comes within 12 points of a wall, the flip or an overnight extreme, a quiet in-app toast names the level. Once per level per 30 minutes.
7. **Scorecard.** After the close (and as "so far" during the session): open, high, low, close; range against the GTBR band (stayed inside, broke the upper edge, broke the lower edge); put wall and call wall held or failed (a 1-minute close beyond by more than 10 points counts as failed); flip crossed how many times; the day's range against the band width as a read on expansion versus compression; and the sentence: what the read expected, what the day did.
8. **Past days.** The last five sessions as chips. Picking one replays that day's tape with the 09:30 print's levels (`gex.json?day=&t=0930`) and its scorecard.

Phone: the session strip, then the tape full width (tap for crosshair), then the read, ladder, news, scorecard stacked.

## Backend

One new edge function, `tape`, source committed at `supabase/functions/tape/index.ts` (the first Echelon function source in this repo). GET, JWT required (members only), `range=1d|5d`. Fetches `query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=<r>&includePrePost=true` and returns `{ symbol, last, prevClose, gmtoffset, fetchedAt, bars: [[t, o, h, l, c, v], ...] }` with null bars dropped. In-isolate cache: 15 seconds for 1d, 5 minutes for 5d. `Cache-Control: public, max-age=15`. Errors from Yahoo come back as 502 with a message; the app keeps the last good tape on screen.

No tables, no crons. The read and the scorecard are computed in the browser from the tape, the worker's live and archived prints, and the calendar, so any day in the worker's archive can be replayed without server state. A morning push ("today's read is up") belongs in `send-push`, whose source lives on the other machine; it is out of scope here.

## Not in scope

AI prose. Order flow. Anything that needs a paid data key. Editing `send-push`.

## Testing

`tests/app-desk-visual.mjs`: signs in as the review account, opens the Desk in dark and light, desk and phone, checks the canvas painted (non-blank pixels), the ladder has rows, the read has sentences, the scorecard renders after a forced "closed" state, and a past day replays. Screenshots for the eye.
