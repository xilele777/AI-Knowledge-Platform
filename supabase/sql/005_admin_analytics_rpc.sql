-- Admin analytics RPC for dashboard metrics and trends.
-- Run this SQL in Supabase SQL Editor.

create or replace function public.admin_get_analytics_overview(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_days, 7), 1);
  v_is_admin boolean := false;
  v_jwt_app_role text := '';
  v_jwt_user_role text := '';
  v_jwt_app_is_admin text := '';
  v_jwt_user_is_admin text := '';
  v_user_count bigint := 0;
  v_document_count bigint := 0;
  v_file_count bigint := 0;
  v_ai_call_count bigint := 0;
  v_login_7d_total bigint := 0;
  v_ai_call_7d_total bigint := 0;
  v_active_user_7d bigint := 0;
  v_document_created_7d bigint := 0;
  v_file_created_7d bigint := 0;
  v_login_trend jsonb := '[]'::jsonb;
  v_ai_call_trend jsonb := '[]'::jsonb;
  v_top_events jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
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
      'select count(*)::bigint from public.documents where created_at >= current_date - interval ''%s day''',
      v_days - 1
    ) into v_document_created_7d;
  end if;

  if to_regclass('public.knowledge_files') is not null then
    execute 'select count(*)::bigint from public.knowledge_files' into v_file_count;
    execute format(
      'select count(*)::bigint from public.knowledge_files where created_at >= current_date - interval ''%s day''',
      v_days - 1
    ) into v_file_created_7d;
  end if;

  if to_regclass('public.analytics_events') is not null then
    execute 'select count(*)::bigint from public.analytics_events where event_name in (''qa_send'', ''ai_writing_call'')'
    into v_ai_call_count;

    execute format(
      'select count(*)::bigint from public.analytics_events where event_name = ''login_success'' and created_at >= current_date - interval ''%s day''',
      v_days - 1
    ) into v_login_7d_total;

    execute format(
      'select count(*)::bigint from public.analytics_events where event_name in (''qa_send'', ''ai_writing_call'') and created_at >= current_date - interval ''%s day''',
      v_days - 1
    ) into v_ai_call_7d_total;

    execute format(
      'select count(distinct owner_id)::bigint from public.analytics_events where created_at >= current_date - interval ''%s day''',
      v_days - 1
    ) into v_active_user_7d;

    with day_series as (
      select generate_series(
        current_date - (v_days - 1),
        current_date,
        interval '1 day'
      )::date as day
    ),
    agg as (
      select date(created_at) as day, count(*)::bigint as cnt
      from public.analytics_events
      where event_name = 'login_success'
        and created_at >= current_date - (v_days - 1)
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
        current_date - (v_days - 1),
        current_date,
        interval '1 day'
      )::date as day
    ),
    agg as (
      select date(created_at) as day, count(*)::bigint as cnt
      from public.analytics_events
      where event_name in ('qa_send', 'ai_writing_call')
        and created_at >= current_date - (v_days - 1)
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
      where created_at >= current_date - (v_days - 1)
      group by event_name
      order by cnt desc, event_name asc
      limit 8
    ) t;
  end if;

  return jsonb_build_object(
    'userCount', v_user_count,
    'documentCount', v_document_count,
    'knowledgeFileCount', v_file_count,
    'aiCallCount', v_ai_call_count,
    'login7dTotal', v_login_7d_total,
    'aiCall7dTotal', v_ai_call_7d_total,
    'activeUser7d', v_active_user_7d,
    'documentCreated7d', v_document_created_7d,
    'fileCreated7d', v_file_created_7d,
    'avgAiCallsPerDay', round(v_ai_call_7d_total::numeric / v_days, 2),
    'loginTrend', v_login_trend,
    'aiCallTrend', v_ai_call_trend,
    'topEvents', v_top_events
  );
end;
$$;

grant execute on function public.admin_get_analytics_overview(integer) to authenticated;

notify pgrst, 'reload schema';
