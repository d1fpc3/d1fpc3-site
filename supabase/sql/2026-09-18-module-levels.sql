-- Study runs basics to advanced: every chapter (module) carries the level it belongs to.
-- The app groups the chapter list under these headings, in this order.
alter table public.modules add column if not exists level text not null default 'Basics'
  check (level in ('Basics', 'Intermediate', 'Advanced'));

update public.modules set level = 'Basics'       where position in (1, 2);      -- The trap, The cycle
update public.modules set level = 'Intermediate' where position in (3, 4);      -- Inducement in depth, Sessions and timing
update public.modules set level = 'Advanced'     where position >= 5;           -- Entries, The daily playbook, Managing the trade
