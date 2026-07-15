-- Profiles bootstrap + admin users RPC.
-- Run this SQL in Supabase SQL Editor.

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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'user',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.profiles
set role = coalesce(nullif(role, ''), 'user')
where role is null or role = '';

alter table public.profiles
  alter column role set default 'user',
  alter column role set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'nickname'
    ),
    coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'user'),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = coalesce(nullif(excluded.role, ''), public.profiles.role),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

-- Backfill historical users.
insert into public.profiles (id, email, full_name, role, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'nickname'
  ) as full_name,
  coalesce(nullif(u.raw_app_meta_data ->> 'role', ''), 'user') as role,
  coalesce(u.created_at, now()) as created_at,
  now() as updated_at
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  role = coalesce(nullif(excluded.role, ''), public.profiles.role),
  updated_at = now();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_select_admin_all" on public.profiles;
create policy "profiles_select_admin_all"
on public.profiles
for select
using (
  lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
  or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'admin'
  or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
  or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
);

drop function if exists public.admin_get_profiles(integer);
create or replace function public.admin_get_profiles(p_limit integer default 200)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz,
  is_banned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 200), 1);
  v_is_admin boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  v_is_admin :=
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y');

  if not v_is_admin then
    if exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    ) then
      v_is_admin := true;
    end if;
  end if;

  if not v_is_admin then
    raise exception 'Forbidden';
  end if;

  return query
  select
    u.id::uuid,
    u.email::text,
    coalesce(
      p.full_name,
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'nickname'
    )::text as full_name,
    coalesce(nullif(p.role, ''), nullif(u.raw_app_meta_data ->> 'role', ''), 'user')::text as role,
    coalesce(p.created_at, u.created_at)::timestamptz as created_at,
    (u.banned_until is not null and u.banned_until > now())::boolean as is_banned
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by coalesce(p.created_at, u.created_at) desc nulls last
  limit least(v_limit, 1000);
end;
$$;

grant execute on function public.admin_get_profiles(integer) to authenticated;

notify pgrst, 'reload schema';
