-- User AI Configuration Table
-- Stores per-user API keys and AI configuration

create table if not exists public.user_ai_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_base_url text,
  api_key text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure unique config per user
create unique index if not exists uq_user_ai_config_user_id
  on public.user_ai_config (user_id);

-- Index for faster lookups
create index if not exists idx_user_ai_config_user_id
  on public.user_ai_config (user_id);

-- Add updated_at trigger
drop trigger if exists trg_user_ai_config_set_updated_at on public.user_ai_config;
create trigger trg_user_ai_config_set_updated_at
before update on public.user_ai_config
for each row
execute function public.set_updated_at();

-- Enable RLS
alter table public.user_ai_config enable row level security;

-- RLS Policies
drop policy if exists "user_ai_config_select_own" on public.user_ai_config;
create policy "user_ai_config_select_own"
on public.user_ai_config
for select
using (auth.uid() = user_id);

drop policy if exists "user_ai_config_insert_own" on public.user_ai_config;
create policy "user_ai_config_insert_own"
on public.user_ai_config
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_ai_config_update_own" on public.user_ai_config;
create policy "user_ai_config_update_own"
on public.user_ai_config
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_ai_config_delete_own" on public.user_ai_config;
create policy "user_ai_config_delete_own"
on public.user_ai_config
for delete
using (auth.uid() = user_id);

-- Refresh schema cache
notify pgrst, 'reload schema';
