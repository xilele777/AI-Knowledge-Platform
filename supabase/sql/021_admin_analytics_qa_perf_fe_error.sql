-- Extend admin_get_analytics_overview with QA latency percentiles (qa_perf)
-- and frontend runtime error stats (fe_error).
-- Run this SQL in Supabase SQL Editor. Fully replaces the function from 005.

create or replace function public.admin_get_analytics_overview(
  p_days integer default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end_date date := coalesce(p_end_date, current_date);
  v_start_date date := case
    when p_start_date is not null and p_end_date is not null then p_start_date
    else v_end_date - (greatest(coalesce(p_days, 7), 1) - 1)
  end;
  v_days integer := greatest((v_end_date - v_start_date + 1), 1);
  v_is_admin boolean := false;
  v_jwt_app_role text := '';
  v_jwt_user_role text := '';
  v_jwt_app_is_admin text := '';
  v_jwt_user_is_admin text := '';
  v_user_count bigint := 0;
  v_document_count bigint := 0;
  v_file_count bigint := 0;
  v_ai_call_count bigint := 0;
  v_login_total bigint := 0;
  v_ai_call_total bigint := 0;
  v_active_user_count bigint := 0;
  v_document_created_total bigint := 0;
  v_file_created_total bigint := 0;
  v_login_trend jsonb := '[]'::jsonb;
  v_ai_call_trend jsonb := '[]'::jsonb;
  v_top_events jsonb := '[]'::jsonb;
  v_qa_perf jsonb := jsonb_build_object('sampleCount', 0);
  v_fe_error jsonb := jsonb_build_object('total', 0, 'bySource', '[]'::jsonb, 'topMessages', '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'Invalid date range';
  end if;

  if v_days > 60 then
    raise exception 'Date range cannot exceed 60 days';
  end if;

  -- Multi-source admin check to avoid false negatives caused by schema/user metadata differences.
  v_jwt_app_role := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_jwt_user_role := coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '');
  v_jwt_app_is_admin := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', ''));
  v_jwt_user_is_admin := lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'is_admin', ''));

  v_is_admin :=
    lower(v_jwt_app_role) = 'admin'
    or lower(v_jwt_user_role) = 'admin'
    or v_jwt_app_is_admin in ('true', '1', 't', 'yes', 'y')
    or v_jwt_user_is_admin in ('true', '1', 't', 'yes', 'y');

  if not v_is_admin and to_regclass('public.profiles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) then
      execute 'select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and lower(coalesce(p.role, '''')) = ''admin''
      )' into v_is_admin;
    end if;

    if not v_is_admin and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_admin'
    ) then
      execute 'select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and coalesce(p.is_admin, false) = true
      )' into v_is_admin;
    end if;
  end if;

  if not v_is_admin then
    raise exception 'Forbidden';
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select count(*)::bigint from public.profiles' into v_user_count;
  end if;

  if to_regclass('public.documents') is not null then
    execute 'select count(*)::bigint from public.documents' into v_document_count;
    execute format(
      'select count(*)::bigint from public.documents where created_at >= %L::date and created_at < (%L::date + interval ''1 day'')',
      v_start_date,
      v_end_date
    ) into v_document_created_total;
  end if;

  if to_regclass('public.knowledge_files') is not null then
    execute 'select count(*)::bigint from public.knowledge_files' into v_file_count;
    execute format(
      'select count(*)::bigint from public.knowledge_files where created_at >= %L::date and created_at < (%L::date + interval ''1 day'')',
      v_start_date,
      v_end_date
    ) into v_file_created_total;
  end if;

  if to_regclass('public.analytics_events') is not null then
    execute 'select count(*)::bigint from public.analytics_events where event_name in (''qa_send'', ''ai_writing_call'')'
    into v_ai_call_count;

    execute format(
      'select count(*)::bigint from public.analytics_events where event_name = ''login_success'' and created_at >= %L::date and created_at < (%L::date + interval ''1 day'')',
      v_start_date,
      v_end_date
    ) into v_login_total;

    execute format(
      'select count(*)::bigint from public.analytics_events where event_name in (''qa_send'', ''ai_writing_call'') and created_at >= %L::date and created_at < (%L::date + interval ''1 day'')',
      v_start_date,
      v_end_date
    ) into v_ai_call_total;

    execute format(
      'select count(distinct owner_id)::bigint from public.analytics_events where created_at >= %L::date and created_at < (%L::date + interval ''1 day'')',
      v_start_date,
      v_end_date
    ) into v_active_user_count;

    with day_series as (
      select generate_series(
        v_start_date,
        v_end_date,
        interval '1 day'
      )::date as day
    ),
    agg as (
      select date(created_at) as day, count(*)::bigint as cnt
      from public.analytics_events
      where event_name = 'login_success'
        and created_at >= v_start_date
        and created_at < (v_end_date + interval '1 day')
      group by date(created_at)
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(day_series.day, 'YYYY-MM-DD'),
          'value', coalesce(agg.cnt, 0)
        )
        order by day_series.day
      ),
      '[]'::jsonb
    )
    into v_login_trend
    from day_series
    left join agg on day_series.day = agg.day;

    with day_series as (
      select generate_series(
        v_start_date,
        v_end_date,
        interval '1 day'
      )::date as day
    ),
    agg as (
      select date(created_at) as day, count(*)::bigint as cnt
      from public.analytics_events
      where event_name in ('qa_send', 'ai_writing_call')
        and created_at >= v_start_date
        and created_at < (v_end_date + interval '1 day')
      group by date(created_at)
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(day_series.day, 'YYYY-MM-DD'),
          'value', coalesce(agg.cnt, 0)
        )
        order by day_series.day
      ),
      '[]'::jsonb
    )
    into v_ai_call_trend
    from day_series
    left join agg on day_series.day = agg.day;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'eventName', t.event_name,
          'count', t.cnt
        )
      ),
      '[]'::jsonb
    )
    into v_top_events
    from (
      select event_name, count(*)::bigint as cnt
      from public.analytics_events
      where created_at >= v_start_date
        and created_at < (v_end_date + interval '1 day')
      group by event_name
      order by cnt desc, event_name asc
      limit 8
    ) t;

    -- QA 链路分段耗时分位（retrieval / ttft / stream / total），单位 ms。
    -- percentile_cont 自动忽略 null，样本不足时对应分位返回 null。
    with qa as (
      select
        nullif(payload ->> 'retrieval_ms', '')::numeric as retrieval_ms,
        nullif(payload ->> 'ttft_ms', '')::numeric as ttft_ms,
        nullif(payload ->> 'stream_ms', '')::numeric as stream_ms,
        nullif(payload ->> 'total_ms', '')::numeric as total_ms
      from public.analytics_events
      where event_name = 'qa_perf'
        and created_at >= v_start_date
        and created_at < (v_end_date + interval '1 day')
    )
    select jsonb_build_object(
      'sampleCount', count(*),
      'retrievalP50', round(percentile_cont(0.5) within group (order by retrieval_ms)::numeric),
      'retrievalP95', round(percentile_cont(0.95) within group (order by retrieval_ms)::numeric),
      'ttftP50', round(percentile_cont(0.5) within group (order by ttft_ms)::numeric),
      'ttftP95', round(percentile_cont(0.95) within group (order by ttft_ms)::numeric),
      'streamP50', round(percentile_cont(0.5) within group (order by stream_ms)::numeric),
      'streamP95', round(percentile_cont(0.95) within group (order by stream_ms)::numeric),
      'totalP50', round(percentile_cont(0.5) within group (order by total_ms)::numeric),
      'totalP95', round(percentile_cont(0.95) within group (order by total_ms)::numeric)
    )
    into v_qa_perf
    from qa;

    -- 前端运行时错误：总量 + 按来源分布 + Top 错误消息。
    with fe as (
      select
        coalesce(nullif(payload ->> 'source', ''), 'unknown') as source,
        coalesce(nullif(payload ->> 'message', ''), '(空消息)') as message
      from public.analytics_events
      where event_name = 'fe_error'
        and created_at >= v_start_date
        and created_at < (v_end_date + interval '1 day')
    )
    select jsonb_build_object(
      'total', (select count(*) from fe),
      'bySource', coalesce((
        select jsonb_agg(jsonb_build_object('source', source, 'count', cnt) order by cnt desc, source asc)
        from (select source, count(*)::bigint as cnt from fe group by source) s
      ), '[]'::jsonb),
      'topMessages', coalesce((
        select jsonb_agg(jsonb_build_object('message', message, 'count', cnt) order by cnt desc, message asc)
        from (
          select message, count(*)::bigint as cnt
          from fe
          group by message
          order by count(*) desc, message asc
          limit 5
        ) m
      ), '[]'::jsonb)
    )
    into v_fe_error;
  end if;

  return jsonb_build_object(
    'userCount', v_user_count,
    'documentCount', v_document_count,
    'knowledgeFileCount', v_file_count,
    'aiCallCount', v_ai_call_count,
    'loginTotal', v_login_total,
    'aiCallTotal', v_ai_call_total,
    'activeUserCount', v_active_user_count,
    'documentCreatedTotal', v_document_created_total,
    'fileCreatedTotal', v_file_created_total,
    'avgAiCallsPerDay', round(v_ai_call_total::numeric / v_days, 2),
    'loginTrend', v_login_trend,
    'aiCallTrend', v_ai_call_trend,
    'topEvents', v_top_events,
    'qaPerf', v_qa_perf,
    'feError', v_fe_error
  );
end;
$$;

grant execute on function public.admin_get_analytics_overview(integer, date, date) to authenticated;

notify pgrst, 'reload schema';
