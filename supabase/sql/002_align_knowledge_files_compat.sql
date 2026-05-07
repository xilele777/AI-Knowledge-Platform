-- One-time compatibility migration for knowledge_files schema drift.
-- Safe to run multiple times.

begin;

alter table public.knowledge_files
  add column if not exists file_path text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_type text,
  add column if not exists status text,
  add column if not exists meta jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Backfill path fields in both directions to keep old and new code compatible.
update public.knowledge_files
set
  file_path = coalesce(file_path, storage_path),
  storage_path = coalesce(storage_path, file_path, '')
where file_path is null
   or storage_path is null;

-- Backfill mime_type and file_type.
update public.knowledge_files
set mime_type = case
  when mime_type is not null and mime_type <> '' then mime_type
  when lower(file_name) like '%.md' then 'text/markdown'
  when lower(file_name) like '%.txt' then 'text/plain'
  else 'text/plain'
end
where mime_type is null
   or mime_type = '';

update public.knowledge_files
set file_type = case
  when file_type is not null and file_type <> '' then file_type
  when mime_type like '%/%' then lower(split_part(mime_type, '/', 2))
  when lower(file_name) like '%.md' then 'md'
  when lower(file_name) like '%.txt' then 'txt'
  else 'txt'
end
where file_type is null
   or file_type = '';

-- Normalize status.
update public.knowledge_files
set status = coalesce(status, 'pending')
where status is null;

-- Apply constraints/defaults expected by different app versions.
alter table public.knowledge_files
  alter column storage_path set default '',
  alter column storage_path set not null,
  alter column file_type set default 'txt',
  alter column file_type set not null,
  alter column status set default 'pending',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'knowledge_files_status_check'
      and conrelid = 'public.knowledge_files'::regclass
  ) then
    alter table public.knowledge_files
      add constraint knowledge_files_status_check
      check (status in ('pending', 'processing', 'done', 'failed'));
  end if;
end;
$$;

-- Keep updated_at fresh.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_knowledge_files_set_updated_at'
  ) then
    create trigger trg_knowledge_files_set_updated_at
    before update on public.knowledge_files
    for each row
    execute function public.set_updated_at();
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
