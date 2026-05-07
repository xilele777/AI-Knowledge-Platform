-- Knowledge module schema for Supabase
-- Run this SQL in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Keep updated_at fresh on update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_files (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text,
  file_size bigint,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  file_id uuid references public.knowledge_files(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  meta jsonb,
  embedding double precision[],
  created_at timestamptz not null default now()
);

-- Ensure required columns exist for legacy tables created before this script.
alter table public.knowledge_bases
  add column if not exists description text,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.knowledge_bases
set status = 'active'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_bases_status_check'
      and conrelid = 'public.knowledge_bases'::regclass
  ) then
    alter table public.knowledge_bases
      add constraint knowledge_bases_status_check
      check (status in ('active', 'archived'));
  end if;
end;
$$;

alter table public.knowledge_files
  add column if not exists file_path text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists status text default 'pending',
  add column if not exists meta jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.knowledge_files
set status = 'pending'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_files_status_check'
      and conrelid = 'public.knowledge_files'::regclass
  ) then
    alter table public.knowledge_files
      add constraint knowledge_files_status_check
      check (status in ('pending', 'processing', 'done', 'failed'));
  end if;
end;
$$;

alter table public.knowledge_chunks
  add column if not exists token_count integer,
  add column if not exists meta jsonb,
  add column if not exists embedding double precision[],
  add column if not exists created_at timestamptz default now();

-- Compatibility migration for old schema versions.
do $$
begin
  -- If old column knowledge_file_id exists, rename it to file_id.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'knowledge_file_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'file_id'
  ) then
    alter table public.knowledge_chunks
      rename column knowledge_file_id to file_id;
  end if;

  -- Ensure file_id exists even when table was created by older scripts.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name = 'file_id'
  ) then
    alter table public.knowledge_chunks
      add column file_id uuid;
  end if;

  -- Ensure FK exists for file_id.
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_chunks_file_id_fkey'
  ) then
    alter table public.knowledge_chunks
      add constraint knowledge_chunks_file_id_fkey
      foreign key (file_id)
      references public.knowledge_files(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists uq_knowledge_chunks_file_chunk_index
  on public.knowledge_chunks (file_id, chunk_index)
  where file_id is not null;

create index if not exists idx_knowledge_bases_owner_id
  on public.knowledge_bases (owner_id, updated_at desc);

create index if not exists idx_knowledge_files_kb_id
  on public.knowledge_files (knowledge_base_id, created_at desc);

create index if not exists idx_knowledge_files_owner_id
  on public.knowledge_files (owner_id, created_at desc);

create index if not exists idx_knowledge_chunks_kb_id
  on public.knowledge_chunks (knowledge_base_id, chunk_index);

create index if not exists idx_knowledge_chunks_file_id
  on public.knowledge_chunks (file_id, chunk_index);

-- updated_at triggers

drop trigger if exists trg_knowledge_bases_set_updated_at on public.knowledge_bases;
create trigger trg_knowledge_bases_set_updated_at
before update on public.knowledge_bases
for each row
execute function public.set_updated_at();

drop trigger if exists trg_knowledge_files_set_updated_at on public.knowledge_files;
create trigger trg_knowledge_files_set_updated_at
before update on public.knowledge_files
for each row
execute function public.set_updated_at();

-- Row level security
alter table public.knowledge_bases enable row level security;
alter table public.knowledge_files enable row level security;
alter table public.knowledge_chunks enable row level security;

-- knowledge_bases policies

drop policy if exists "knowledge_bases_select_own" on public.knowledge_bases;
create policy "knowledge_bases_select_own"
on public.knowledge_bases
for select
using (auth.uid() = owner_id);

drop policy if exists "knowledge_bases_insert_own" on public.knowledge_bases;
create policy "knowledge_bases_insert_own"
on public.knowledge_bases
for insert
with check (auth.uid() = owner_id);

drop policy if exists "knowledge_bases_update_own" on public.knowledge_bases;
create policy "knowledge_bases_update_own"
on public.knowledge_bases
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "knowledge_bases_delete_own" on public.knowledge_bases;
create policy "knowledge_bases_delete_own"
on public.knowledge_bases
for delete
using (auth.uid() = owner_id);

-- knowledge_files policies

drop policy if exists "knowledge_files_select_own" on public.knowledge_files;
create policy "knowledge_files_select_own"
on public.knowledge_files
for select
using (auth.uid() = owner_id);

drop policy if exists "knowledge_files_insert_own" on public.knowledge_files;
create policy "knowledge_files_insert_own"
on public.knowledge_files
for insert
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = knowledge_base_id
      and kb.owner_id = auth.uid()
  )
);

drop policy if exists "knowledge_files_update_own" on public.knowledge_files;
create policy "knowledge_files_update_own"
on public.knowledge_files
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "knowledge_files_delete_own" on public.knowledge_files;
create policy "knowledge_files_delete_own"
on public.knowledge_files
for delete
using (auth.uid() = owner_id);

-- knowledge_chunks policies

drop policy if exists "knowledge_chunks_select_own" on public.knowledge_chunks;
create policy "knowledge_chunks_select_own"
on public.knowledge_chunks
for select
using (auth.uid() = owner_id);

drop policy if exists "knowledge_chunks_insert_own" on public.knowledge_chunks;
create policy "knowledge_chunks_insert_own"
on public.knowledge_chunks
for insert
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = knowledge_base_id
      and kb.owner_id = auth.uid()
  )
  and (
    file_id is null
    or exists (
      select 1
      from public.knowledge_files kf
      where kf.id = file_id
        and kf.owner_id = auth.uid()
    )
  )
);

drop policy if exists "knowledge_chunks_update_own" on public.knowledge_chunks;
create policy "knowledge_chunks_update_own"
on public.knowledge_chunks
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "knowledge_chunks_delete_own" on public.knowledge_chunks;
create policy "knowledge_chunks_delete_own"
on public.knowledge_chunks
for delete
using (auth.uid() = owner_id);

-- Refresh PostgREST schema cache (important after ALTER TABLE).
notify pgrst, 'reload schema';
