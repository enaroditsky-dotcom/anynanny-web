-- Parent shift booking requests (pending → approved locks sitter calendar in app layer).

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  sitter_id uuid not null references auth.users (id) on delete cascade,
  booking_date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_parent_sitter_distinct check (parent_id <> sitter_id),
  constraint bookings_end_after_start check (end_time > start_time)
);

create index if not exists bookings_parent_id_idx on public.bookings (parent_id, created_at desc);
create index if not exists bookings_sitter_status_idx on public.bookings (sitter_id, status);

alter table public.bookings enable row level security;

drop policy if exists bookings_select_participant on public.bookings;
create policy bookings_select_participant on public.bookings
  for select to authenticated
  using (parent_id = auth.uid() or sitter_id = auth.uid());

drop policy if exists bookings_insert_parent on public.bookings;
create policy bookings_insert_parent on public.bookings
  for insert to authenticated
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'parent'
    )
    and exists (
      select 1 from public.sitter_profiles sp
      where sp.id = sitter_id and coalesce(sp.is_public, false) = true
    )
  );

drop policy if exists bookings_update_sitter on public.bookings;
create policy bookings_update_sitter on public.bookings
  for update to authenticated
  using (sitter_id = auth.uid())
  with check (sitter_id = auth.uid());

-- Notify sitter when a parent submits a booking request.
create or replace function public.notify_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    new.sitter_id,
    'booking_request',
    'בקשת תיאום משמרת',
    'הורה שלח בקשה לתיאום משמרת',
    jsonb_build_object(
      'booking_id', new.id,
      'parent_id', new.parent_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists bookings_notify_sitter on public.bookings;
create trigger bookings_notify_sitter
  after insert on public.bookings
  for each row
  execute function public.notify_booking_insert();
