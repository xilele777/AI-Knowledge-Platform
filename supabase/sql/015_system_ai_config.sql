-- System AI Configuration Table (singleton)
-- Stores the platform-wide embedding API used by all RAG indexing/query flows.
-- Only admins can read/write via RLS; Edge Functions read it with the service role key.
--
-- Admin detection mirrors 006_profiles_admin_users.sql (JWT metadata), NOT profiles.role,
-- so it stays consistent with the frontend's userStore.isAdmin.

create or replace function public.is_admin_jwt()
returns boolean
language sql
stable
as $$
  select
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
$$;

create table if not exists public.system_ai_config (
  id smallint primary key default 1 check (id = 1),
  embedding_base_url text,
  embedding_api_key text,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_system_ai_config_set_updated_at on public.system_ai_config;
create trigger trg_system_ai_config_set_updated_at
before update on public.system_ai_config
for each row
execute function public.set_updated_at();

alter table public.system_ai_config enable row level security;

drop policy if exists "system_ai_config_admin_select" on public.system_ai_config;
create policy "system_ai_config_admin_select"
on public.system_ai_config
for select
using (public.is_admin_jwt());

drop policy if exists "system_ai_config_admin_insert" on public.system_ai_config;
create policy "system_ai_config_admin_insert"
on public.system_ai_config
for insert
with check (public.is_admin_jwt());

drop policy if exists "system_ai_config_admin_update" on public.system_ai_config;
create policy "system_ai_config_admin_update"
on public.system_ai_config
for update
using (public.is_admin_jwt())
with check (public.is_admin_jwt());

-- Refresh schema cache
notify pgrst, 'reload schema';
