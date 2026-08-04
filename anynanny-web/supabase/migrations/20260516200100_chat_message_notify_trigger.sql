-- Notify the other participant when a chat message is sent.

create or replace function public.notify_chat_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_sitter uuid;
  v_recipient uuid;
  v_preview text;
begin
  select cr.parent_id, cr.sitter_id
  into v_parent, v_sitter
  from public.chat_rooms cr
  where cr.id = new.room_id;

  if not found then
    return new;
  end if;

  if new.sender_id = v_parent then
    v_recipient := v_sitter;
  else
    v_recipient := v_parent;
  end if;

  if v_recipient is null or v_recipient = new.sender_id then
    return new;
  end if;

  v_preview := left(trim(new.body), 80);
  if length(trim(new.body)) > 80 then
    v_preview := v_preview || '…';
  end if;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    v_recipient,
    'chat_message',
    'הודעה חדשה',
    v_preview,
    jsonb_build_object('room_id', new.room_id, 'sender_id', new.sender_id)
  );

  return new;
end;
$$;

drop trigger if exists chat_messages_notify_recipient on public.chat_messages;
create trigger chat_messages_notify_recipient
  after insert on public.chat_messages
  for each row
  execute function public.notify_chat_message_recipient();
