-- Multi-select sitter receiving methods.
-- payout_preferred_method stays in place. Supported explicit values are copied once.
-- NULL, blank, bank, and card stay NULL and resolve to cash at read time.
-- Before applying in production, count legacy rows that stay NULL and do not infer Bit or PayBox:
-- select count(*) from public.sitter_profiles
-- where lower(btrim(coalesce(payout_preferred_method, ''))) in ('bank', 'card');

alter table public.sitter_profiles
  add column if not exists payout_enabled_methods text[];

comment on column public.sitter_profiles.payout_enabled_methods is
  'Enabled parent receiving methods: any combination of cash, bit, and paybox. NULL or empty is cash at read time. Saved Bit/PayBox phones are not membership in this set.';

create or replace function public.payout_enabled_methods_valid(p_methods text[])
returns boolean
language sql
immutable
as $$
  select p_methods is null
    or (
      p_methods <@ array['cash', 'bit', 'paybox']::text[]
      and cardinality(p_methods) = (
        select count(distinct method)
        from unnest(p_methods) as method
      )
    );
$$;

comment on function public.payout_enabled_methods_valid(text[]) is
  'True when payout_enabled_methods is null or a duplicate-free subset of cash, bit, and paybox.';

alter table public.sitter_profiles
  drop constraint if exists sitter_profiles_payout_enabled_methods_check;

alter table public.sitter_profiles
  add constraint sitter_profiles_payout_enabled_methods_check
  check (public.payout_enabled_methods_valid(payout_enabled_methods));

update public.sitter_profiles
set payout_enabled_methods = array[lower(btrim(payout_preferred_method))]::text[]
where payout_enabled_methods is null
  and lower(btrim(coalesce(payout_preferred_method, ''))) in ('cash', 'bit', 'paybox');

grant select (payout_enabled_methods)
  on public.sitter_profiles
  to authenticated;

grant update (payout_enabled_methods)
  on public.sitter_profiles
  to authenticated;

grant execute on function public.payout_enabled_methods_valid(text[]) to authenticated;

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
  v_enabled text[];
  v_show_cash boolean;
  v_show_bit boolean;
  v_show_paybox boolean;
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
    btrim(coalesce(sp.payout_paybox_link, '')),
    sp.payout_enabled_methods
    into v_bit, v_paybox, v_paybox_link, v_enabled
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

  v_show_cash :=
    v_enabled is null
    or cardinality(v_enabled) = 0
    or 'cash' = any (v_enabled);
  v_show_bit :=
    v_enabled is not null
    and cardinality(v_enabled) > 0
    and 'bit' = any (v_enabled)
    and coalesce(v_bit, '') ~ '^05[0-9]{8}$';
  v_show_paybox :=
    v_enabled is not null
    and cardinality(v_enabled) > 0
    and 'paybox' = any (v_enabled)
    and coalesce(v_paybox, '') ~ '^05[0-9]{8}$';

  if not v_show_bit then
    v_bit := null;
  end if;
  if not v_show_paybox then
    v_paybox := null;
    v_paybox_link := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'accepts_cash', v_show_cash,
    'enabled_methods', to_jsonb(v_enabled),
    'bit_phone', nullif(v_bit, ''),
    'paybox_phone', nullif(v_paybox, ''),
    'paybox_link', nullif(v_paybox_link, '')
  );
end;
$$;

comment on function public.parent_manual_payment_destinations(uuid) is
  'Returns enabled and valid manual methods to the booking parent after a completed shift and parent rating. NULL or an empty enabled set is cash. An enabled Bit or PayBox without a valid phone is omitted and is not replaced.';

notify pgrst, 'reload schema';

revoke all on function public.parent_manual_payment_destinations(uuid) from public;
revoke all on function public.parent_manual_payment_destinations(uuid) from anon;
grant execute on function public.parent_manual_payment_destinations(uuid) to authenticated;
