# Echelon app: sections navigation

Date: 2026-09-22. Approved in chat by D1 ("yes just clean it up").

## Problem

The members app (`echelon/app/index.html`) put up to 16 flat items in one sidebar: Today, Chart, Feed, Journal, Study, Chat, Video library, Homework, News, Prop firms, Indicators, GEX, Members, Settings, Discord, Admin. On phones a 5-slot dock covered five of them and a hamburger drawer duplicated the whole list. Pages outside the five (News, GEX, Library) lit nothing in the dock.

## Design

Hub and spoke. The rail and the phone dock hold five sections. Each section owns its pages in a segmented control in the topbar.

| Section | Pages (in order) |
|---|---|
| Today | overview |
| Trade | chart, gex, news, propfirms |
| Learn | course, homework, library, indicators |
| Community | feed, chat, members |
| You | journal, set-profile, settings |

Secondary views light a page without being in the segment: the `set-*` pages, `notifs` and `rate` light Settings; `follows` lights Profile. `inbox` (the bell) belongs to no section and shows its own title.

Discord and Admin move to a Tools footer at the bottom of the rail. On phones they are reached from Settings (Discord row exists; an Admin row is added, hidden unless admin).

### Desktop rail

- Resting rail (72px) shows the five sections as icon over label with a sliding gold indicator on the left edge. The You section shows the member's avatar as its icon.
- Hover expands the rail as before, now as a grouped map: each section is a parent row and its pages are indented rows beneath it.
- Every existing `.tab[data-view]` button stays in the DOM (some hidden) because `showView`, the palette, the dock and `popstate` treat them as the routing registry. They are regrouped under `.grp` wrappers, not replaced.
- The `.side-user` block is hidden on desktop. Sign out lives in Settings > Account. The `#signout` and `#u-avatar` nodes stay in the DOM for the code that reads them.

### Topbar

- Title is the section name on a section page, the page's own title on a secondary page (with a "Section / Page" crumb).
- `#tb-seg` is a segmented control with a sliding pill. It carries the same unread badges as the rail (chat count, library dot, GEX dot, homework count).
- Phone: the segment wraps to a second row under the title as a glass capsule that scrolls sideways. On the feed it floats over the posts. In chat the chat height subtracts the segment row (`--segrow`).

### Phone dock

- Five slots, one per section, same order as the rail. Avatar for You. Badges mirror the rail's.
- Tapping a section opens its last visited page, or its first page. Tapping the active section on its page scrolls to the top.
- The hamburger and drawer are retired on phones. The drawer code stays dormant (it only opened from the menu button).

### Behaviour

- `SEC_LAST[section]` remembers the last page per section for the session.
- `showView` computes the section, paints the title, the segment, the rail indicator and the dock in one place.
- Palette gains recents at the top when the query is empty and `g` then a letter jump keys (second commit).

## Testing

`tests/app-sections-nav-visual.mjs`: signs in as the App Review account, runs at 390 (phone), 1440 and 2560 (desktop). Asserts five rail sections and five dock slots, that each section click lands on the expected page, that the segment lists the right pages and switches views, that secondary pages light the right segment, that nothing overflows horizontally, and screenshots every state.
