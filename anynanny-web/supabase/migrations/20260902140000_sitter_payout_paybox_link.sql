-- Optional private PayBox personal payment link.
-- Additive. Does not change report_manual_payment or payment_status transitions.
-- Same private-column model as payout_bit_phone / payout_paybox_phone.

alter table public.sitter_profiles
  add column if not exists payout_paybox_link text;

comment on column public.sitter_profiles.payout_paybox_link is
  'Optional HTTPS PayBox personal payment link. Private destination; never public.';

revoke select (payout_paybox_link)
  on public.sitter_profiles
  from public;

revoke select (payout_paybox_link)
  on public.sitter_profiles
  from anon;

revoke select (payout_paybox_link)
  on public.sitter_profiles
  from authenticated;

grant update (payout_paybox_link)
  on public.sitter_profiles
  to authenticated;

-- Keep column-level SELECT aligned: every column except private destinations.
do $$
declare
  cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sitter_profiles'
    and c.column_name not in ('payout_bit_phone', 'payout_paybox_phone', 'payout_paybox_link');

  if cols is null or cols = '' then
    raise exception 'sitter_profiles has no grantable columns';
  end if;

  execute 'revoke select on public.sitter_profiles from public';
  execute 'revoke select on public.sitter_profiles from anon';
  execute 'revoke select on public.sitter_profiles from authenticated';

  execute format('grant select (%s) on public.sitter_profiles to anon', cols);
  execute format('grant select (%s) on public.sitter_profiles to authenticated', cols);
end
$$;

revoke select (payout_bit_phone, payout_paybox_phone, payout_paybox_link)
  on public.sitter_profiles
  from public, anon, authenticated;

create or replace function public.sitter_own_manual_payout_destinations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bit text;
  v_paybox text;
  v_paybox_link text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select sp.payout_bit_phone, sp.payout_paybox_phone, sp.payout_paybox_link
    into v_bit, v_paybox, v_paybox_link
    from public.sitter_profiles sp
   where sp.id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'bit_phone', v_bit,
    'paybox_phone', v_paybox,
    'paybox_link', v_paybox_link
  );
end;
$$;

comment on function public.sitter_own_manual_payout_destinations() is
  'Returns the authenticated sitter''s own Bit/PayBox receiving numbers and optional PayBox payment link. Never another user''s.';

create or replace function public.parent_manual_payment_destinations(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_bit text;
  v_paybox text;
  v_paybox_link text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.parent_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(v_booking.status, ''))) is distinct from 'completed' then
    raise exception 'shift is not completed' using errcode = 'P0001';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));
  if v_status is distinct from 'unpaid' and v_status is distinct from 'pending_checkout' then
    raise exception 'not eligible for payment' using errcode = 'P0001';
  end if;

  if not public.manual_payment_booking_has_parent_rating(v_booking) then
    raise exception 'parent rating required' using errcode = 'P0001';
  end if;

  select
    regexp_replace(coalesce(sp.payout_bit_phone, ''), '[^0-9]', '', 'g'),
    regexp_replace(coalesce(sp.payout_paybox_phone, ''), '[^0-9]', '', 'g'),
    btrim(coalesce(sp.payout_paybox_link, ''))
    into v_bit, v_paybox, v_paybox_link
    from public.sitter_profiles sp
   where sp.id = v_booking.sitter_id;

  if v_bit like '972%' and length(v_bit) = 12 then
    v_bit := '0' || substring(v_bit from 4);
  end if;
  if v_paybox like '972%' and length(v_paybox) = 12 then
    v_paybox := '0' || substring(v_paybox from 4);
  end if;

  if v_bit is distinct from '' and v_bit !~ '^05[0-9]{8}$' then
    v_bit := null;
  end if;
  if v_paybox is distinct from '' and v_paybox !~ '^05[0-9]{8}$' then
    v_paybox := null;
  end if;

  v_paybox_link := regexp_replace(coalesce(v_paybox_link, ''), E'[\\n\\r\\t]', '', 'g');
  v_paybox_link := btrim(v_paybox_link);
  if v_paybox_link is distinct from '' then
    if v_paybox_link ~* '^https://[^/]*@'
       or length(v_paybox_link) > 2048
       or (
         v_paybox_link !~* '^https://(www\.|links\.|app\.)?payboxapp\.com(/[-A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%]*)?$'
         and v_paybox_link !~* '^https://payboxapp\.page\.link(/[-A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%]*)?$'
         and v_paybox_link !~* '^https://[a-z0-9-]+\.payboxapp\.com(/[-A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%]*)?$'
       )
    then
      v_paybox_link := null;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'bit_phone', nullif(v_bit, ''),
    'paybox_phone', nullif(v_paybox, ''),
    'paybox_link', nullif(v_paybox_link, '')
  );
end;
$$;

comment on function public.parent_manual_payment_destinations(uuid) is
  'Returns Bit/PayBox receiving numbers and optional PayBox payment link to the booking parent after completed shift + parent rating. Never public.';

revoke all on function public.sitter_own_manual_payout_destinations() from public;
revoke all on function public.sitter_own_manual_payout_destinations() from anon;
grant execute on function public.sitter_own_manual_payout_destinations() to authenticated;
grant execute on function public.sitter_own_manual_payout_destinations() to service_role;

revoke all on function public.parent_manual_payment_destinations(uuid) from public;
revoke all on function public.parent_manual_payment_destinations(uuid) from anon;
grant execute on function public.parent_manual_payment_destinations(uuid) to authenticated;
grant execute on function public.parent_manual_payment_destinations(uuid) to service_role;

notify pgrst, 'reload schema';
