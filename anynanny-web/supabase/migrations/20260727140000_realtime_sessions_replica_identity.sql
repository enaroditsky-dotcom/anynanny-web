-- Stabilize Realtime for sitter/parent dashboards.
-- CHANNEL_ERROR (WebSocket 1006) is often worsened when filtered UPDATE/DELETE
-- events lack old-row columns (needs REPLICA IDENTITY FULL) or when sessions
-- are missing from supabase_realtime.

alter table if exists public.bookings replica identity full;
alter table if exists public.sessions replica identity full;
alter table if exists public.shift_requests replica identity full;
alter table if exists public.notifications replica identity full;

do $$
begin
  if to_regclass('public.bookings') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'bookings'
     ) then
    execute 'alter publication supabase_realtime add table public.bookings';
  end if;

  if to_regclass('public.sessions') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sessions'
     ) then
    execute 'alter publication supabase_realtime add table public.sessions';
  end if;

  if to_regclass('public.shift_requests') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'shift_requests'
     ) then
    execute 'alter publication supabase_realtime add table public.shift_requests';
  end if;

  if to_regclass('public.notifications') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
