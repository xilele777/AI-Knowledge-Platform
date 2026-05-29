-- Document sharing schema for Supabase
-- Run this SQL in Supabase SQL Editor.

-- Add shared status column to documents table
alter table public.documents
  add column if not exists is_shared boolean not null default false,
  add column if not exists shared_at timestamptz;

-- Update updated_at trigger for documents (if not already exists)
drop trigger if exists trg_documents_set_updated_at on public.documents;
create trigger trg_documents_set_updated_at
before update on public.documents
for each row
execute function public.set_updated_at();

-- Ensure RLS is enabled
alter table public.documents enable row level security;

-- Drop existing policies to recreate them correctly
drop policy if exists "documents_select_shared" on public.documents;
drop policy if exists "documents_select_own" on public.documents;
drop policy if exists "documents_insert_own" on public.documents;
drop policy if exists "documents_update_own" on public.documents;
drop policy if exists "documents_delete_own" on public.documents;

-- Row level security for shared documents - allow ANY authenticated user to view shared docs
create policy "documents_select_shared"
on public.documents
for select
to authenticated
using (is_shared = true);

-- Owner policies - allow owners full access to their own docs
create policy "documents_select_own"
on public.documents
for select
to authenticated
using (auth.uid() = owner_id);

create policy "documents_insert_own"
on public.documents
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "documents_update_own"
on public.documents
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "documents_delete_own"
on public.documents
for delete
to authenticated
using (auth.uid() = owner_id);

-- Create index for shared documents
create index if not exists idx_documents_shared
on public.documents (is_shared desc, updated_at desc);

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
