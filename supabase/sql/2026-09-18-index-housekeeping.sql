-- Index housekeeping from the Supabase performance advisor (2026-09-18).
-- Foreign keys without an index make deletes on the parent scan the child table, and three
-- of these were added by my own migrations this week (reply_to, pinned_by, parent_id).
create index if not exists check_results_check_id_idx on public.check_results (check_id);
create index if not exists lesson_notes_lesson_id_idx on public.lesson_notes (lesson_id);
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;
create index if not exists messages_pinned_by_idx on public.messages (pinned_by) where pinned_by is not null;
create index if not exists post_comments_parent_id_idx on public.post_comments (parent_id) where parent_id is not null;
-- two identical indexes on post_comments (recap_id, created_at): keep one
drop index if exists public.post_comments_recap_idx;
