-- 019 admin_get_profiles 分页版：支持 offset/搜索/角色筛选，并附带全局统计。
-- Run this SQL in Supabase SQL Editor.

drop function if exists public.admin_get_profiles(integer);
drop function if exists public.admin_get_profiles(integer, integer, text, text);

create or replace function public.admin_get_profiles(
  p_limit integer default 10,
  p_offset integer default 0,
  p_search text default null,
  p_role text default null
)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz,
  is_banned boolean,
  filtered_count bigint,
  total_count bigint,
  admin_count bigint,
  banned_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
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
  with base as (
    select
      u.id::uuid as id,
      u.email::text as email,
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
  ),
  filtered as (
    select *
    from base b
    where (v_role is null or b.role = v_role)
      and (
        v_search is null
        or coalesce(b.email, '') ilike '%' || v_search || '%'
        or coalesce(b.full_name, '') ilike '%' || v_search || '%'
      )
  )
  select
    f.id,
    f.email,
    f.full_name,
    f.role,
    f.created_at,
    f.is_banned,
    (select count(*) from filtered)::bigint as filtered_count,
    (select count(*) from base)::bigint as total_count,
    (select count(*) from base b where b.role = 'admin')::bigint as admin_count,
    (select count(*) from base b where b.is_banned)::bigint as banned_count
  from filtered f
  order by f.created_at desc nulls last
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.admin_get_profiles(integer, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
