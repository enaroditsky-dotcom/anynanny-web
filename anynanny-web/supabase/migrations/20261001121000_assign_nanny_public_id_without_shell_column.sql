-- Canonical sitter assignment writes profiles.nanny_serial only.
-- A new sitter receives the next RAN-* value. A stored AN / RAN / CONS id stays.
-- The legacy shell generator is left installed and is not called.

create or replace function public.assign_nanny_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
begin
  if tg_op = 'UPDATE' then
    v_existing := public.normalize_sitter_public_id(old.nanny_serial);
  else
    -- Inserts ignore a client-supplied serial.
    v_existing := null;
  end if;

  if v_existing is not null then
    new.nanny_serial := v_existing;
  elsif new.role = 'sitter' then
    new.nanny_serial := public.generate_nanny_serial();
  end if;

  return new;
end;
$$;

comment on function public.assign_nanny_public_id() is
  'Assigns profiles.nanny_serial for a new sitter and keeps a stored id on update.';
