-- Stream status fields for chat_messages.
-- Run this SQL in Supabase SQL Editor.

alter table public.chat_messages
  add column if not exists status text,
  add column if not exists error_message text;

update public.chat_messages
set status = 'done'
where status is null
   or status not in ('streaming', 'done', 'error');

alter table public.chat_messages
  alter column status set default 'done',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_status_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_status_check
      check (status in ('streaming', 'done', 'error'));
  end if;
end;
$$;

notify pgrst, 'reload schema';
