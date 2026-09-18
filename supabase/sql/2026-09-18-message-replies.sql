-- Chat: a message can quote the one it answers (2026-09-18). Idempotent.
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
