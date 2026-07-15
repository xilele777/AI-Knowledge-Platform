-- 017 shared documents ranking + admin moderation RPCs

create or replace function public._is_admin_actor()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_is_admin :=
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y')
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'is_admin', '')) in ('true', '1', 't', 'yes', 'y');

  if not v_is_admin and to_regclass('public.profiles') is not null then
    if exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    ) then
      v_is_admin := true;
    end if;
  end if;

  return v_is_admin;
end;
$$;

grant execute on function public._is_admin_actor() to authenticated;

drop function if exists public.get_shared_documents(text, integer, integer, text);
create or replace function public.get_shared_documents(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort text default 'latest'
)
returns table (
  id uuid,
  owner_id uuid,
  owner_name text,
  title text,
  status text,
  is_shared boolean,
  shared_at timestamptz,
  character_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  view_count bigint,
  recent_view_count bigint,
  hot_score numeric,
  comprehensive_score numeric
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      d.id,
      d.owner_id,
      coalesce(nullif(p.full_name, ''), nullif(p.email, ''), '未署名用户') as owner_name,
      d.title,
      d.status,
      d.is_shared,
      d.shared_at,
      d.character_count,
      d.created_at,
      d.updated_at
    from public.documents d
    left join public.profiles p on p.id = d.owner_id
    where d.is_shared = true
      and (
        p_search is null
        or btrim(p_search) = ''
        or d.title ilike '%' || btrim(p_search) || '%'
      )
  ),
  metrics as (
    select
      b.id as document_id,
      count(ae.id)::bigint as view_count,
      count(*) filter (
        where ae.created_at >= now() - interval '7 day'
      )::bigint as recent_view_count
    from base b
    left join public.analytics_events ae
      on ae.event_name = 'shared_doc_view'
     and ae.payload ->> 'document_id' = b.id::text
    group by b.id
  ),
  ranked as (
    select
      b.id,
      b.owner_id,
      b.owner_name,
      b.title,
      b.status,
      b.is_shared,
      b.shared_at,
      b.character_count,
      b.created_at,
      b.updated_at,
      coalesce(m.view_count, 0) as view_count,
      coalesce(m.recent_view_count, 0) as recent_view_count,
      (coalesce(m.view_count, 0) * 0.35 + coalesce(m.recent_view_count, 0) * 0.65)::numeric as hot_score,
      (
        (coalesce(m.view_count, 0) * 0.35 + coalesce(m.recent_view_count, 0) * 0.65) * 0.7
        + 1000 / greatest(extract(epoch from (now() - coalesce(b.shared_at, b.updated_at))) / 86400, 1)
      )::numeric as comprehensive_score
    from base b
    left join metrics m on m.document_id = b.id
  )
  select
    r.id,
    r.owner_id,
    r.owner_name,
    r.title,
    r.status,
    r.is_shared,
    r.shared_at,
    r.character_count,
    r.created_at,
    r.updated_at,
    r.view_count,
    r.recent_view_count,
    r.hot_score,
    r.comprehensive_score
  from ranked r
  order by
    case when lower(coalesce(p_sort, 'latest')) = 'hottest' then r.hot_score end desc,
    case when lower(coalesce(p_sort, 'latest')) = 'comprehensive' then r.comprehensive_score end desc,
    coalesce(r.shared_at, r.updated_at) desc,
    r.updated_at desc
  limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_shared_documents(text, integer, integer, text) to authenticated;

create or replace function public.get_shared_document_detail(p_document_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  owner_name text,
  title text,
  content_md text,
  summary text,
  status text,
  is_shared boolean,
  shared_at timestamptz,
  character_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    d.id,
    d.owner_id,
    coalesce(nullif(p.full_name, ''), nullif(p.email, ''), '未署名用户') as owner_name,
    d.title,
    d.content_md,
    d.summary,
    d.status,
    d.is_shared,
    d.shared_at,
    d.character_count,
    d.created_at,
    d.updated_at
  from public.documents d
  left join public.profiles p on p.id = d.owner_id
  where d.id = p_document_id
    and d.is_shared = true
  limit 1;
$$;

grant execute on function public.get_shared_document_detail(uuid) to authenticated;

create or replace function public.admin_delete_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  delete from public.documents
  where id = p_document_id;
end;
$$;

grant execute on function public.admin_delete_document(uuid) to authenticated;

create or replace function public.admin_set_document_shared(p_document_id uuid, p_is_shared boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  update public.documents
  set
    is_shared = p_is_shared,
    shared_at = case when p_is_shared then coalesce(shared_at, now()) else null end,
    updated_at = now()
  where id = p_document_id;
end;
$$;

grant execute on function public.admin_set_document_shared(uuid, boolean) to authenticated;

create or replace function public.admin_delete_knowledge_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_knowledge_base_id uuid;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select knowledge_base_id into v_knowledge_base_id
  from public.knowledge_files
  where id = p_file_id;

  delete from public.knowledge_chunks
  where file_id = p_file_id;

  delete from public.knowledge_files
  where id = p_file_id;

  if v_knowledge_base_id is not null then
    update public.knowledge_bases
    set updated_at = now()
    where id = v_knowledge_base_id;
  end if;
end;
$$;

grant execute on function public.admin_delete_knowledge_file(uuid) to authenticated;

notify pgrst, 'reload schema';
