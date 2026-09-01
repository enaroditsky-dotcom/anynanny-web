-- Live booking chat (public.messages) was fetching over REST but never receiving
-- postgres_changes INSERTs: the table was not in supabase_realtime, and replica
-- identity was DEFAULT so a booking_id filter could not be used.
-- RLS is unchanged — Realtime still delivers only rows the subscriber can SELECT.

alter table if exists public.messages replica identity full;

do $$
begin
  if to_regclass('public.messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;
