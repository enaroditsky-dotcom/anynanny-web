-- Enable Supabase Realtime broadcast for sitter dashboard tables.
-- Without these, postgres_changes listeners on the client fire only on refresh
-- because rows aren't part of the supabase_realtime publication.

-- REPLICA IDENTITY FULL is required so Realtime filters like `sitter_id=eq.<uuid>`
-- still match on UPDATE / DELETE (PG needs the old row's columns to evaluate the filter).
alter table public.bookings replica identity full;
alter table public.shift_requests replica identity full;
alter table public.notifications replica identity full;
alter table public.chat_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    execute 'alter publication supabase_realtime add table public.bookings';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shift_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.shift_requests';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end $$;

notify pgrst, 'reload schema';
