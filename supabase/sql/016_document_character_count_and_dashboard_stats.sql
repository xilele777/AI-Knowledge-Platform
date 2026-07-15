-- 016 documents.character_count 生成列 + 首页聚合统计 RPC
--
-- 背景:此前 Dashboard 与文档列表用 select('*') 把全文正文 content_md 下载到前端,
-- 仅为算字数与几个统计数字。本迁移把"算字数""统计"下沉到数据库:
--   1) documents 增加 STORED 生成列 character_count,口径对齐前端
--      content_md.replace(/\s/g,'').length(Unicode 空白差异 <1%,可接受);
--      历史数据自动回填,写入时自动维护,应用层无需再算。
--   2) 补 documents(owner_id, updated_at desc) 组合索引 —— "我的文档列表 / 最近文档"
--      热查询此前只有 is_shared 索引,缺 owner 维度。
--   3) get_dashboard_stats():一次 RPC 返回首页所需的统计数字 + 近7天按天 + 最近6条,
--      彻底免去前端下载全部正文。
--
-- 时区:今日 / 近7天按 Asia/Shanghai 归属,与前端本地时区口径一致。

-- 1) 生成列(STORED:自动回填历史 + 写入自动维护)
alter table public.documents
  add column if not exists character_count integer
  generated always as (char_length(regexp_replace(coalesce(content_md, ''), '\s', '', 'g'))) stored;

-- 2) 热查询组合索引
create index if not exists idx_documents_owner_updated
  on public.documents (owner_id, updated_at desc);

-- 3) 首页聚合统计:统计数字 + 近7天按天 + 最近6条(不含正文)
--    security invoker(默认)依赖 RLS,并显式 where owner_id = auth.uid() 双保险且走索引。
create or replace function public.get_dashboard_stats()
returns json
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with mine as (
    select
      id,
      title,
      character_count,
      status,
      updated_at,
      (updated_at at time zone 'Asia/Shanghai')::date as local_day
    from public.documents
    where owner_id = auth.uid()
  ),
  day_counts as (
    select local_day as day, count(*) as cnt
    from mine
    group by local_day
  ),
  last7 as (
    -- 近 7 天(含今天)的上海日期序列,某天 0 篇也补零
    select ((now() at time zone 'Asia/Shanghai')::date - g.offs) as day
    from generate_series(0, 6) as g(offs)
  )
  select json_build_object(
    'total_characters', coalesce((select sum(character_count) from mine), 0),
    'total_docs',       (select count(*) from mine),
    'knowledge_base_count', (select count(*) from public.knowledge_bases kb where kb.owner_id = auth.uid()),
    'last7days', coalesce((
      select json_agg(
        json_build_object('date', to_char(l.day, 'YYYY-MM-DD'), 'count', coalesce(dc.cnt, 0))
        order by l.day
      )
      from last7 l
      left join day_counts dc on dc.day = l.day
    ), '[]'::json),
    'recent', coalesce((
      select json_agg(r order by r.updated_at desc)
      from (
        select id, title, character_count, updated_at
        from mine
        order by updated_at desc
        limit 6
      ) r
    ), '[]'::json)
  );
$$;

-- 让 PostgREST 立即识别新列与新 RPC
notify pgrst, 'reload schema';
