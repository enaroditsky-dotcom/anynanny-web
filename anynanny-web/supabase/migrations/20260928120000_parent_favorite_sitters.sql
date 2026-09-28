-- Parent favorite sitters.
-- parent_id / sitter_id are the same auth user UUIDs as profiles.id,
-- sitter_profiles.id, and bookings.parent_id / bookings.sitter_id.
-- A new row notifies the sitter once via create_canonical_notification.
-- Re-inserts hit the unique constraint and do not fire the insert trigger.
-- Deletes do not notify. Clients cannot INSERT into notifications.

create table if not exists public.parent_favorite_sitters (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  sitter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_favorite_sitters_parent_sitter_distinct check (parent_id <> sitter_id),
  constraint parent_favorite_sitters_parent_sitter_key unique (parent_id, sitter_id)
);

comment on table public.parent_favorite_sitters is
  'Parent-owned favorite sitters. Parents manage their own rows. Sitters cannot read or write this table. A new insert notifies the sitter.';

create index if not exists parent_favorite_sitters_parent_created_idx
  on public.parent_favorite_sitters (parent_id, created_at desc);

create index if not exists parent_favorite_sitters_sitter_idx
  on public.parent_favorite_sitters (sitter_id);

alter table public.parent_favorite_sitters enable row level security;

drop policy if exists parent_favorite_sitters_select_own on public.parent_favorite_sitters;
create policy parent_favorite_sitters_select_own
  on public.parent_favorite_sitters
  for select
  to authenticated
  using (
    parent_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'parent'
    )
  );

drop policy if exists parent_favorite_sitters_insert_own on public.parent_favorite_sitters;
create policy parent_favorite_sitters_insert_own
  on public.parent_favorite_sitters
  for insert
  to authenticated
  with check (
    parent_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'parent'
    )
    and exists (
      select 1
      from public.sitter_profiles sp
      where sp.id = sitter_id
    )
  );

drop policy if exists parent_favorite_sitters_delete_own on public.parent_favorite_sitters;
create policy parent_favorite_sitters_delete_own
  on public.parent_favorite_sitters
  for delete
  to authenticated
  using (
    parent_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'parent'
    )
  );

revoke all on table public.parent_favorite_sitters from public;
revoke all on table public.parent_favorite_sitters from anon;
revoke all on table public.parent_favorite_sitters from authenticated;
grant select, insert, delete on table public.parent_favorite_sitters to authenticated;

create or replace function public.notify_sitter_added_to_favorites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last text;
  v_family text;
  v_body text;
begin
  select nullif(btrim(p.last_name), '')
    into v_last
  from public.profiles p
  where p.id = new.parent_id;

  v_family := case
    when v_last is null then 'משפחה'
    else 'משפחת ' || v_last
  end;

  v_body := 'איזה כיף! 🎉 ' || v_family || ' הוסיפה אותך לרשימת הבייביסיטריות המועדפות שלה ב-AnyNanny ❤️';

  perform public.create_canonical_notification(
    new.sitter_id,
    'favorite_sitter_added',
    'נוספת למועדפות',
    v_body,
    jsonb_build_object(
      'favorite_id', new.id,
      'parent_id', new.parent_id,
      'sitter_id', new.sitter_id,
      'family_last_name', v_last
    ),
    new.id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_sitter_added_to_favorites() from public;
revoke all on function public.notify_sitter_added_to_favorites() from anon;
revoke all on function public.notify_sitter_added_to_favorites() from authenticated;

drop trigger if exists parent_favorite_sitters_notify_sitter on public.parent_favorite_sitters;
create trigger parent_favorite_sitters_notify_sitter
  after insert on public.parent_favorite_sitters
  for each row
  execute function public.notify_sitter_added_to_favorites();
