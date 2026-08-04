-- Booking chat uses public.messages (app) in addition to chat_messages.
-- Without publication membership, Realtime subscribe fails with CHANNEL_ERROR
-- and the client reconnect loop floods the console (booking-chat / chat-*).

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_booking_id_created_idx
  on public.messages (booking_id, created_at);

alter table if exists public.messages replica identity full;
alter table if exists public.chat_messages replica identity full;

alter table public.messages enable row level security;

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = messages.booking_id
        and (b.parent_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.parent_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

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

  if to_regclass('public.chat_messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'chat_messages'
     ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
