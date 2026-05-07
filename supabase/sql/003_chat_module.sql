-- Chat module schema for QA conversations.
-- Run this SQL in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_bases(id) on delete set null,
  title text not null default '新会话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Compatibility patch for existing tables created by older versions.
alter table public.chats
  add column if not exists knowledge_base_id uuid references public.knowledge_bases(id) on delete set null,
  add column if not exists title text default '新会话',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.chats
set title = coalesce(nullif(title, ''), '新会话')
where title is null
   or title = '';

alter table public.chats
  alter column title set default '新会话',
  alter column title set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.chat_messages
  add column if not exists role text,
  add column if not exists content text,
  add column if not exists sources jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default now();

update public.chat_messages
set sources = '[]'::jsonb
where sources is null;

alter table public.chat_messages
  alter column sources set default '[]'::jsonb,
  alter column sources set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_role_check'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_role_check
      check (role in ('user', 'assistant', 'system'));
  end if;
end;
$$;

create index if not exists idx_chats_owner_updated
  on public.chats (owner_id, updated_at desc);

create index if not exists idx_chats_kb
  on public.chats (knowledge_base_id, updated_at desc);

create index if not exists idx_chat_messages_chat_created
  on public.chat_messages (chat_id, created_at asc);

create index if not exists idx_chat_messages_owner_created
  on public.chat_messages (owner_id, created_at desc);

-- Ensure updated_at helper exists.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chats_set_updated_at on public.chats;
create trigger trg_chats_set_updated_at
before update on public.chats
for each row
execute function public.set_updated_at();

-- Touch parent chat updated_at when messages are inserted.
create or replace function public.touch_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set updated_at = now()
  where id = new.chat_id;

  return new;
end;
$$;

drop trigger if exists trg_touch_chat_updated_at on public.chat_messages;
create trigger trg_touch_chat_updated_at
after insert on public.chat_messages
for each row
execute function public.touch_chat_updated_at();

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chats_select_own" on public.chats;
create policy "chats_select_own"
on public.chats
for select
using (auth.uid() = owner_id);

drop policy if exists "chats_insert_own" on public.chats;
create policy "chats_insert_own"
on public.chats
for insert
with check (auth.uid() = owner_id);

drop policy if exists "chats_update_own" on public.chats;
create policy "chats_update_own"
on public.chats
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "chats_delete_own" on public.chats;
create policy "chats_delete_own"
on public.chats
for delete
using (auth.uid() = owner_id);

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
on public.chat_messages
for select
using (auth.uid() = owner_id);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
on public.chat_messages
for insert
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
on public.chat_messages
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
on public.chat_messages
for delete
using (auth.uid() = owner_id);

notify pgrst, 'reload schema';
