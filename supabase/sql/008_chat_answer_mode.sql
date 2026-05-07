-- Add answer mode field for smart QA mode persistence.
-- Run this SQL in Supabase SQL Editor after existing chat module migrations.

alter table public.chat_messages
  add column if not exists answer_mode text;

update public.chat_messages
set answer_mode = null
where answer_mode is not null
  and answer_mode not in ('general-ai', 'knowledge-enhanced', 'strict-knowledge');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_answer_mode_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_answer_mode_check
      check (answer_mode is null or answer_mode in ('general-ai', 'knowledge-enhanced', 'strict-knowledge'));
  end if;
end;
$$;

notify pgrst, 'reload schema';
