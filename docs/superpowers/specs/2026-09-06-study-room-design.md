# Study room upgrade (Echelon members app)

Date: 2026-09-06. Approved by D1 in chat ("build it all"). Scope: `/echelon/app/`
Study view (`#v-course`), admin Content tab, Echelon Supabase project.

D1 picked three of four proposed directions: reader upgrades, notes and
highlights, recall and review. Interactive diagrams were NOT picked.

Design rules that hold throughout: flat and typographic in the existing dark
and gold shell, no cards, no pills, no new bottom-nav tab, never the word
"course" in visible copy, no em dashes in copy, no invented LIT definitions.

## Phase 1: reader upgrades (client only)

- Search field at the top of the lesson index (`#index`) and inside the phone
  index sheet. Instant filter over title, summary and full text (body_md or
  block text). Result rows show the lesson title and a snippet around the
  match with the match bolded. Enter opens the first result. Empty query
  restores the normal index.
- Module caps in the index show "n of m" done. A 2px gold progress line at the
  top of `#lesson-block` fills with scroll position through the lesson.
- Arrow keys Left/Right move to prev/next lesson on desktop when focus is not
  in an input, textarea or the video player. Horizontal swipe (>60px, mostly
  horizontal) inside `.lesson-pane` on touch devices does the same.
- Scroll position per lesson remembered in localStorage (`echelon-lesson-pos`)
  and restored on open.
- Lesson toolbar under the title: read time (words/200), Listen, Focus, A- A+.
  Listen uses `speechSynthesis`, one utterance per block in order, lights the
  current block; pause/resume/stop; stops on lesson change. Focus adds
  `.focus` to `#v-course` (hides `.toc`, widens `.lesson-pane`, hides the
  topbar); Esc exits. Text size cycles 15/16/17/18px, remembered.
- Glossary: a map of LIT terms to the lesson slug that teaches them. The first
  occurrence of each term in a lesson's prose becomes `<span class="gl">`
  with a dotted underline; tap opens a popover with that lesson's `summary`
  and an "Open lesson" link. Terms are only decorated outside the lesson that
  teaches them.

## Phase 2: notes and highlights

- Table `lesson_notes` (migration 0063): id, user_id, lesson_id, kind
  ('highlight' | 'note'), block_index int, quote text, note text, created_at,
  updated_at. Own-row RLS for select/insert/update/delete.
- Selecting text inside `.lesson-pane .prose` shows a floating bar with
  Highlight and Note. Highlight wraps the range's text in `<mark class="hl">`.
  Note = highlight plus a text prompt (askConfirm with note field).
- On lesson open, saved rows re-apply by finding `quote` inside the block at
  `block_index` (fallback: anywhere in the lesson). Unmatched rows show in the
  drawer flagged "text changed".
- Notes drawer: right drawer on desktop, bottom sheet on phone. Tabs "This
  lesson" and "All". Rows: quote, note, lesson title, delete. "Copy all" copies
  plain text.

## Phase 3: recall and review

- Tables (migration 0064): `lesson_checks` (id, lesson_id, position, prompt,
  options jsonb text[4], answer int, explain text, approved bool default
  false) and `check_results` (user_id, check_id, correct bool, answered_at,
  due_at, step int). RLS: members select approved checks and own results;
  admin-api handles check writes (actions check_save, check_delete,
  check_approve).
- Quick check section after the lesson body, before homework: each approved
  question, tap an option, reveal correct + explanation, save result. Does not
  gate Mark complete.
- Review queue: `due` = results with due_at <= now for completed lessons.
  Shown as a line at the top of the index and on Overview. Session UI shows
  one question at a time; Again/Good/Easy set step 0 / +1 / +2 over the
  ladder 1, 3, 7, 14, 30, 60 days.
- Content: `Projects/echelon/content/lit-checks.mjs` keyed by lesson slug,
  loaded by `scripts/load-checks.mjs` (upsert by slug+position). All rows
  start unapproved. Admin Content tab gains a Checks list per lesson.

## Testing

Playwright harnesses under `tests/`: `study-reader-visual.mjs` (search,
progress, toolbar, glossary, focus), `study-notes-visual.mjs` (highlight,
note, drawer, reload persistence), `study-review-visual.mjs` (quick check,
review session). Existing `lesson-render-visual.mjs` must still pass.
