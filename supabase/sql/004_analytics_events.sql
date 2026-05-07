-- Analytics events schema for frontend tracking.
-- Run this SQL in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Compatibility patch for legacy environments.
alter table public.analytics_events
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists event_name text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table public.analytics_events
  alter column owner_id set not null,
  alter column event_name set not null,
  alter column payload set default '{}'::jsonb,
  alter column payload set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_analytics_events_owner_created
  on public.analytics_events (owner_id, created_at desc);

create index if not exists idx_analytics_events_event_created
  on public.analytics_events (event_name, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "analytics_events_select_own" on public.analytics_events;
create policy "analytics_events_select_own"
on public.analytics_events
for select
using (auth.uid() = owner_id);

drop policy if exists "analytics_events_insert_own" on public.analytics_events;
create policy "analytics_events_insert_own"
on public.analytics_events
for insert
with check (auth.uid() = owner_id);

drop policy if exists "analytics_events_delete_own" on public.analytics_events;
create policy "analytics_events_delete_own"
on public.analytics_events
for delete
using (auth.uid() = owner_id);

notify pgrst, 'reload schema';
