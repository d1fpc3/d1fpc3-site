-- A member can turn off "Show when I'm online". The app then never announces them on the
-- presence channel; nothing else about the account changes. Default is on.
alter table public.profiles add column if not exists show_online boolean not null default true;
