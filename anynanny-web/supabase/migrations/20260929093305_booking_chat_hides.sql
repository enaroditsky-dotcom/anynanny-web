-- Per-user soft hide for a booking conversation in the messages inbox.
-- Messages, bookings, and the other participant's inbox stay intact.
-- Do not apply this migration to production from the chat UX change; review first.

create table if not exists public.booking_chat_hides (
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, booking_id)
);

comment on table public.booking_chat_hides is
  'Hides one booking conversation from one participant inbox. Does not delete messages. Newer message activity reveals it again.';

comment on column public.booking_chat_hides.hidden_at is
  'When this user hid the conversation. A message newer than this timestamp makes the conversation visible again.';

create index if not exists booking_chat_hides_booking_id_idx
  on public.booking_chat_hides (booking_id);

alter table public.booking_chat_hides enable row level security;

revoke all on table public.booking_chat_hides from public;
revoke all on table public.booking_chat_hides from anon;
revoke all on table public.booking_chat_hides from authenticated;
grant select, insert, update on table public.booking_chat_hides to authenticated;

drop policy if exists booking_chat_hides_select_own on public.booking_chat_hides;
create policy booking_chat_hides_select_own
  on public.booking_chat_hides
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists booking_chat_hides_insert_own on public.booking_chat_hides;
create policy booking_chat_hides_insert_own
  on public.booking_chat_hides
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.parent_id = (select auth.uid())
          or b.sitter_id = (select auth.uid())
        )
    )
  );

drop policy if exists booking_chat_hides_update_own on public.booking_chat_hides;
create policy booking_chat_hides_update_own
  on public.booking_chat_hides
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (
          b.parent_id = (select auth.uid())
          or b.sitter_id = (select auth.uid())
        )
    )
  );

notify pgrst, 'reload schema';
