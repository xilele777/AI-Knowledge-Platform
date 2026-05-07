-- Add document-to-knowledge bridge and document chunk source support.
-- Safe to run multiple times.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title_snapshot text,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_chunk_count integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_documents
  add column if not exists title_snapshot text,
  add column if not exists status text default 'active',
  add column if not exists last_chunk_count integer default 0,
  add column if not exists last_synced_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.knowledge_documents
set
  status = coalesce(status, 'active'),
  last_chunk_count = coalesce(last_chunk_count, 0)
where status is null
   or last_chunk_count is null;

alter table public.knowledge_documents
  alter column status set default 'active',
  alter column status set not null,
  alter column last_chunk_count set default 0,
  alter column last_chunk_count set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_documents_status_check'
      and conrelid = 'public.knowledge_documents'::regclass
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_status_check
      check (status in ('active', 'archived'));
  end if;
end;
$$;

create unique index if not exists uq_knowledge_documents_kb_doc
  on public.knowledge_documents (knowledge_base_id, document_id);

create index if not exists idx_knowledge_documents_owner_id
  on public.knowledge_documents (owner_id, updated_at desc);

create index if not exists idx_knowledge_documents_kb_id
  on public.knowledge_documents (knowledge_base_id, updated_at desc);

alter table public.knowledge_chunks
  add column if not exists source_type text,
  add column if not exists document_id uuid references public.documents(id) on delete cascade;

update public.knowledge_chunks
set source_type = case
  when document_id is not null then 'document'
  else 'file'
end
where source_type is null
   or source_type = '';

alter table public.knowledge_chunks
  alter column source_type set default 'file',
  alter column source_type set not null;

alter table public.knowledge_chunks
  alter column file_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_chunks_source_type_check'
      and conrelid = 'public.knowledge_chunks'::regclass
  ) then
    alter table public.knowledge_chunks
      add constraint knowledge_chunks_source_type_check
      check (source_type in ('file', 'document'));
  end if;
end;
$$;

create unique index if not exists uq_knowledge_chunks_document_chunk_index
  on public.knowledge_chunks (knowledge_base_id, document_id, chunk_index)
  where document_id is not null;

create index if not exists idx_knowledge_chunks_document_id
  on public.knowledge_chunks (document_id, chunk_index)
  where document_id is not null;

create index if not exists idx_knowledge_chunks_source_type
  on public.knowledge_chunks (knowledge_base_id, source_type, chunk_index);

drop trigger if exists trg_knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_set_updated_at
before update on public.knowledge_documents
for each row
execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;

drop policy if exists "knowledge_documents_select_own" on public.knowledge_documents;
create policy "knowledge_documents_select_own"
on public.knowledge_documents
for select
using (auth.uid() = owner_id);

drop policy if exists "knowledge_documents_insert_own" on public.knowledge_documents;
create policy "knowledge_documents_insert_own"
on public.knowledge_documents
for insert
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.knowledge_bases kb
    where kb.id = knowledge_base_id
      and kb.owner_id = auth.uid()
  )
  and exists (
    select 1
    from public.documents d
    where d.id = document_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists "knowledge_documents_update_own" on public.knowledge_documents;
create policy "knowledge_documents_update_own"
on public.knowledge_documents
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "knowledge_documents_delete_own" on public.knowledge_documents;
create policy "knowledge_documents_delete_own"
on public.knowledge_documents
for delete
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
  and (
    document_id is null
    or exists (
      select 1
      from public.documents d
      where d.id = document_id
        and d.owner_id = auth.uid()
    )
  )
);

notify pgrst, 'reload schema';

commit;
