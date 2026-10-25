-- Recipient-scoped soft removal for Broadcast questions.
-- The answer, recipient history, and admin results stay. This does not delete rows.

alter table public.broadcast_question_recipients
  add column if not exists removed_at timestamptz;

comment on column public.broadcast_question_recipients.removed_at is
  'When this recipient explicitly removed the question from their own interface. Null means it is still visible to them.';

create or replace function public.remove_own_broadcast_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_updated integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.broadcast_question_recipients
     set removed_at = coalesce(removed_at, now())
   where question_id = p_question_id
     and user_id = v_user
     and first_responded_at is not null;

  get diagnostics v_updated = row_count;
  if v_updated is distinct from 1 then
    raise exception 'question is not removable for this recipient' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.remove_own_broadcast_question(uuid) from public;
revoke all on function public.remove_own_broadcast_question(uuid) from anon;
revoke all on function public.remove_own_broadcast_question(uuid) from authenticated;
grant execute on function public.remove_own_broadcast_question(uuid) to authenticated;
