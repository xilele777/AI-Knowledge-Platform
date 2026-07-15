-- 020 删除用户前的兜底清理：
-- GoTrue 的 deleteUser 在任何表存在「不带级联的外键 / 遗留引用」时会报
-- "Database error deleting user"。历史环境中部分表（如 documents、storage.objects）
-- 可能不是按 repo 里的 SQL 建的，外键未必带 on delete cascade，
-- 因此删除 auth 用户前先显式清空其业务数据。
-- Run this SQL in Supabase SQL Editor.

create or replace function public.admin_purge_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 会话
  delete from public.chat_messages m
  using public.chats c
  where m.chat_id = c.id
    and c.owner_id = p_user_id;

  delete from public.chats where owner_id = p_user_id;

  -- 知识库链路（先叶后根）
  delete from public.knowledge_chunks where owner_id = p_user_id;
  delete from public.knowledge_documents where owner_id = p_user_id;

  -- 兜底：指向该用户文档的桥表记录（即使 owner 不同）
  delete from public.knowledge_documents kd
  using public.documents d
  where kd.document_id = d.id
    and d.owner_id = p_user_id;

  delete from public.knowledge_files where owner_id = p_user_id;
  delete from public.knowledge_bases where owner_id = p_user_id;

  -- 文档与埋点、个人配置
  delete from public.documents where owner_id = p_user_id;
  delete from public.analytics_events where owner_id = p_user_id;
  delete from public.user_ai_config where user_id = p_user_id;

  -- 审计日志保留，但解除对 auth.users 的引用
  update public.admin_operation_logs
  set actor_user_id = null
  where actor_user_id = p_user_id;

  -- storage.objects 的 owner 列在老版本带指向 auth.users 的外键（无级联），
  -- 是 "Database error deleting user" 最常见的原因；列不存在时静默跳过。
  begin
    update storage.objects set owner = null where owner = p_user_id;
  exception when undefined_table or undefined_column or insufficient_privilege then
    null;
  end;

  begin
    update storage.objects set owner_id = null where owner_id = p_user_id::text;
  exception when undefined_table or undefined_column or insufficient_privilege then
    null;
  end;

  delete from public.profiles where id = p_user_id;
end;
$$;

-- 仅允许 Edge Function（service role）调用
revoke all on function public.admin_purge_user_data(uuid) from public;
revoke all on function public.admin_purge_user_data(uuid) from anon;
revoke all on function public.admin_purge_user_data(uuid) from authenticated;
grant execute on function public.admin_purge_user_data(uuid) to service_role;

notify pgrst, 'reload schema';
