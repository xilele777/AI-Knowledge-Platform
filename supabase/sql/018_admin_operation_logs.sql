-- 018 admin operation logs + audited admin mutations

create table if not exists public.admin_operation_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  target_label text,
  status text not null default 'success',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_operation_logs
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists actor_email text,
  add column if not exists action text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists target_label text,
  add column if not exists status text default 'success',
  add column if not exists details jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table public.admin_operation_logs
  alter column action set not null,
  alter column target_type set not null,
  alter column status set default 'success',
  alter column status set not null,
  alter column details set default '{}'::jsonb,
  alter column details set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_admin_operation_logs_created_at
  on public.admin_operation_logs (created_at desc);

create index if not exists idx_admin_operation_logs_actor_created_at
  on public.admin_operation_logs (actor_user_id, created_at desc);

create index if not exists idx_admin_operation_logs_action_created_at
  on public.admin_operation_logs (action, created_at desc);

create index if not exists idx_admin_operation_logs_target_lookup
  on public.admin_operation_logs (target_type, target_id);

alter table public.admin_operation_logs enable row level security;

drop policy if exists "admin_operation_logs_select_admin_all" on public.admin_operation_logs;
create policy "admin_operation_logs_select_admin_all"
on public.admin_operation_logs
for select
using (public._is_admin_actor());

create or replace function public.admin_get_operation_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null,
  p_target_type text default null,
  p_status text default null,
  p_search text default null
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  target_label text,
  status text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    l.id,
    l.actor_user_id,
    l.actor_email,
    l.action,
    l.target_type,
    l.target_id,
    l.target_label,
    l.status,
    l.details,
    l.created_at
  from public.admin_operation_logs l
  where (
    p_action is null or btrim(p_action) = '' or l.action = btrim(p_action)
  )
    and (
      p_target_type is null or btrim(p_target_type) = '' or l.target_type = btrim(p_target_type)
    )
    and (
      p_status is null or btrim(p_status) = '' or l.status = btrim(p_status)
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or coalesce(l.actor_email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(l.target_label, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(l.target_id, '') ilike '%' || btrim(p_search) || '%'
      or l.action ilike '%' || btrim(p_search) || '%'
    )
  order by l.created_at desc
  limit least(v_limit, 200)
  offset v_offset;
end;
$$;

grant execute on function public.admin_get_operation_logs(integer, integer, text, text, text, text) to authenticated;

create or replace function public.admin_delete_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_title text;
  v_is_shared boolean := false;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select coalesce(auth.jwt() ->> 'email', p.email, '')
  into v_actor_email
  from public.profiles p
  where p.id = auth.uid();

  select d.title, d.is_shared
  into v_title, v_is_shared
  from public.documents d
  where d.id = p_document_id;

  delete from public.documents
  where id = p_document_id;

  insert into public.admin_operation_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    status,
    details
  ) values (
    auth.uid(),
    coalesce(v_actor_email, ''),
    'delete_document',
    'document',
    p_document_id::text,
    coalesce(v_title, '未知文档'),
    'success',
    jsonb_build_object('isShared', v_is_shared)
  );
end;
$$;

grant execute on function public.admin_delete_document(uuid) to authenticated;

create or replace function public.admin_set_document_shared(p_document_id uuid, p_is_shared boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_title text;
  v_old_shared boolean := false;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select coalesce(auth.jwt() ->> 'email', p.email, '')
  into v_actor_email
  from public.profiles p
  where p.id = auth.uid();

  select d.title, d.is_shared
  into v_title, v_old_shared
  from public.documents d
  where d.id = p_document_id;

  update public.documents
  set
    is_shared = p_is_shared,
    shared_at = case when p_is_shared then coalesce(shared_at, now()) else null end,
    updated_at = now()
  where id = p_document_id;

  insert into public.admin_operation_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    status,
    details
  ) values (
    auth.uid(),
    coalesce(v_actor_email, ''),
    'set_document_shared',
    'document',
    p_document_id::text,
    coalesce(v_title, '未知文档'),
    'success',
    jsonb_build_object('before', v_old_shared, 'after', p_is_shared)
  );
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
  v_actor_email text;
  v_knowledge_base_id uuid;
  v_file_name text;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select coalesce(auth.jwt() ->> 'email', p.email, '')
  into v_actor_email
  from public.profiles p
  where p.id = auth.uid();

  select knowledge_base_id, file_name
  into v_knowledge_base_id, v_file_name
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

  insert into public.admin_operation_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    status,
    details
  ) values (
    auth.uid(),
    coalesce(v_actor_email, ''),
    'delete_knowledge_file',
    'knowledge_file',
    p_file_id::text,
    coalesce(v_file_name, '未知文件'),
    'success',
    jsonb_build_object('knowledgeBaseId', v_knowledge_base_id)
  );
end;
$$;

grant execute on function public.admin_delete_knowledge_file(uuid) to authenticated;

create or replace function public.admin_delete_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_title text;
  v_message_count integer := 0;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select coalesce(auth.jwt() ->> 'email', p.email, '')
  into v_actor_email
  from public.profiles p
  where p.id = auth.uid();

  select c.title into v_title
  from public.chats c
  where c.id = p_chat_id;

  select count(*) into v_message_count
  from public.chat_messages m
  where m.chat_id = p_chat_id;

  delete from public.chat_messages
  where chat_id = p_chat_id;

  delete from public.chats
  where id = p_chat_id;

  insert into public.admin_operation_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    status,
    details
  ) values (
    auth.uid(),
    coalesce(v_actor_email, ''),
    'delete_chat',
    'chat',
    p_chat_id::text,
    coalesce(v_title, '未命名会话'),
    'success',
    jsonb_build_object('messageCount', v_message_count)
  );
end;
$$;

grant execute on function public.admin_delete_chat(uuid) to authenticated;

create or replace function public.admin_delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
  v_chat_id uuid;
  v_preview text;
begin
  if not public._is_admin_actor() then
    raise exception 'Forbidden';
  end if;

  select coalesce(auth.jwt() ->> 'email', p.email, '')
  into v_actor_email
  from public.profiles p
  where p.id = auth.uid();

  select m.chat_id, left(m.content, 60)
  into v_chat_id, v_preview
  from public.chat_messages m
  where m.id = p_message_id;

  delete from public.chat_messages
  where id = p_message_id;

  insert into public.admin_operation_logs (
    actor_user_id,
    actor_email,
    action,
    target_type,
    target_id,
    target_label,
    status,
    details
  ) values (
    auth.uid(),
    coalesce(v_actor_email, ''),
    'delete_chat_message',
    'chat_message',
    p_message_id::text,
    coalesce(v_preview, '消息片段'),
    'success',
    jsonb_build_object('chatId', v_chat_id)
  );
end;
$$;

grant execute on function public.admin_delete_chat_message(uuid) to authenticated;

notify pgrst, 'reload schema';
