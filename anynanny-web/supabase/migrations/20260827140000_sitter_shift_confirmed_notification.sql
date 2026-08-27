-- Sitter-side persisted confirmation when a pending booking becomes approved.
-- Does not change booking status transitions. Clients cannot INSERT notifications (RLS).

create or replace function public.notify_booking_status_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(btrim(coalesce(old.status::text, '')));
  v_new text := lower(btrim(coalesce(new.status::text, '')));
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.parent_id is null then
    return new;
  end if;

  if v_old is not distinct from v_new then
    return new;
  end if;

  if v_old is distinct from 'pending' then
    return new;
  end if;

  if v_new = 'approved' then
    v_kind := 'booking_approved';
    v_title := 'המשמרת אושרה';
    v_body := 'הבייביסיטר אישר/ה את בקשת המשמרת';
  elsif v_new = 'rejected' then
    v_kind := 'booking_rejected';
    v_body := 'הבייביסיטר דחה/תה את בקשת המשמרת';
    v_title := 'הבקשה נדחתה';
  else
    return new;
  end if;

  perform public.create_canonical_notification(
    new.parent_id,
    v_kind,
    v_title,
    v_body,
    jsonb_build_object(
      'booking_id', new.id,
      'sitter_id', new.sitter_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status
    ),
    new.id::text
  );

  if v_new = 'approved' and new.sitter_id is not null then
    perform public.create_canonical_notification(
      new.sitter_id,
      'shift_confirmed',
      'המשמרת אושרה בהצלחה',
      'המשמרת אושרה בהצלחה',
      jsonb_build_object(
        'booking_id', new.id,
        'parent_id', new.parent_id,
        'booking_date', new.booking_date,
        'start_time', new.start_time,
        'end_time', new.end_time,
        'status', new.status
      ),
      new.id::text
    );
  end if;

  -- Acting on the request is the meaningful read for the sitter's booking_request row.
  update public.notifications
     set read_at = coalesce(read_at, now())
   where user_id = new.sitter_id
     and kind = 'booking_request'
     and read_at is null
     and (
       dedupe_key = new.id::text
       or payload->>'booking_id' = new.id::text
     );

  return new;
end;
$$;
