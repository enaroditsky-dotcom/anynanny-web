-- Parent ↔ sitter messaging and shift booking requests.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  sitter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_rooms_parent_sitter_distinct check (parent_id <> sitter_id),
  constraint chat_rooms_parent_sitter_unique unique (parent_id, sitter_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_nonempty check (char_length(trim(body)) > 0)
);

create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  sitter_id uuid not null references auth.users (id) on delete cascade,
  shift_date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_requests_end_after_start check (end_time > start_time)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists chat_rooms_parent_id_idx on public.chat_rooms (parent_id);
create index if not exists chat_rooms_sitter_id_idx on public.chat_rooms (sitter_id);
create index if not exists chat_messages_room_id_created_idx on public.chat_messages (room_id, created_at);
create index if not exists shift_requests_sitter_status_idx on public.shift_requests (sitter_id, status);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RPC: get or create a parent↔sitter chat room
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_chat_room(p_sitter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
  v_room uuid;
begin
  if v_parent is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_parent and p.role = 'parent'
  ) then
    raise exception 'parent_only';
  end if;

  if p_sitter_id is null or p_sitter_id = v_parent then
    raise exception 'invalid_sitter';
  end if;

  if not exists (
    select 1
    from public.sitter_profiles sp
    where sp.id = p_sitter_id
      and coalesce(sp.is_public, false) = true
  ) then
    raise exception 'sitter_not_found';
  end if;

  select cr.id into v_room
  from public.chat_rooms cr
  where cr.parent_id = v_parent
    and cr.sitter_id = p_sitter_id;

  if v_room is null then
    insert into public.chat_rooms (parent_id, sitter_id)
    values (v_parent, p_sitter_id)
    returning id into v_room;

    insert into public.notifications (user_id, kind, title, body, payload)
    values (
      p_sitter_id,
      'chat_room',
      'שיחה חדשה',
      'הורה פתח איתך שיחה',
      jsonb_build_object('room_id', v_room, 'parent_id', v_parent)
    );
  else
    update public.chat_rooms
    set updated_at = now()
    where id = v_room;
  end if;

  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: parent creates a pending shift request + sitter notification
-- ---------------------------------------------------------------------------
create or replace function public.create_shift_request(
  p_sitter_id uuid,
  p_shift_date date,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
  v_id uuid;
begin
  if v_parent is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_parent and p.role = 'parent'
  ) then
    raise exception 'parent_only';
  end if;

  if p_sitter_id is null or p_sitter_id = v_parent then
    raise exception 'invalid_sitter';
  end if;

  if p_shift_date is null or p_start_time is null or p_end_time is null then
    raise exception 'missing_fields';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'invalid_time_range';
  end if;

  if not exists (
    select 1
    from public.sitter_profiles sp
    where sp.id = p_sitter_id
      and coalesce(sp.is_public, false) = true
  ) then
    raise exception 'sitter_not_found';
  end if;

  insert into public.shift_requests (
    parent_id,
    sitter_id,
    shift_date,
    start_time,
    end_time,
    status
  )
  values (
    v_parent,
    p_sitter_id,
    p_shift_date,
    p_start_time,
    p_end_time,
    'pending'
  )
  returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    p_sitter_id,
    'shift_request',
    'בקשת משמרת חדשה',
    'הורה שלח בקשה לתיאום משמרת',
    jsonb_build_object(
      'shift_request_id', v_id,
      'parent_id', v_parent,
      'shift_date', p_shift_date,
      'start_time', p_start_time,
      'end_time', p_end_time
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: sitter approves / rejects (calendar lock hooks in app layer later)
-- ---------------------------------------------------------------------------
create or replace function public.respond_shift_request(
  p_request_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.shift_requests%rowtype;
  v_new_status text;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if p_action not in ('approve', 'reject') then
    raise exception 'invalid_action';
  end if;

  select * into v_row
  from public.shift_requests sr
  where sr.id = p_request_id;

  if not found then
    raise exception 'not_found';
  end if;

  if v_row.sitter_id <> v_user then
    raise exception 'forbidden';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'already_responded';
  end if;

  v_new_status := case when p_action = 'approve' then 'approved' else 'rejected' end;

  update public.shift_requests
  set status = v_new_status,
      updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    v_row.parent_id,
    'shift_request_' || v_new_status,
    case when v_new_status = 'approved' then 'המשמרת אושרה' else 'המשמרת נדחתה' end,
    case
      when v_new_status = 'approved' then 'הבייביסיטר אישר את בקשת המשמרת'
      else 'הבייביסיטר דחה את בקשת המשמרת'
    end,
    jsonb_build_object('shift_request_id', p_request_id, 'status', v_new_status)
  );
end;
$$;

grant execute on function public.get_or_create_chat_room(uuid) to authenticated;
grant execute on function public.create_shift_request(uuid, date, timestamptz, timestamptz) to authenticated;
grant execute on function public.respond_shift_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.shift_requests enable row level security;
alter table public.notifications enable row level security;

drop policy if exists chat_rooms_select_participant on public.chat_rooms;
create policy chat_rooms_select_participant on public.chat_rooms
  for select to authenticated
  using (parent_id = auth.uid() or sitter_id = auth.uid());

drop policy if exists chat_messages_select_participant on public.chat_messages;
create policy chat_messages_select_participant on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_rooms cr
      where cr.id = room_id
        and (cr.parent_id = auth.uid() or cr.sitter_id = auth.uid())
    )
  );

drop policy if exists chat_messages_insert_participant on public.chat_messages;
create policy chat_messages_insert_participant on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms cr
      where cr.id = room_id
        and (cr.parent_id = auth.uid() or cr.sitter_id = auth.uid())
    )
  );

drop policy if exists shift_requests_select_participant on public.shift_requests;
create policy shift_requests_select_participant on public.shift_requests
  for select to authenticated
  using (parent_id = auth.uid() or sitter_id = auth.uid());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
