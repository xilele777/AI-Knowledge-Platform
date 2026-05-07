-- Add per-knowledge-base QA config.
-- Run this SQL in Supabase SQL Editor.

alter table public.knowledge_bases
  add column if not exists qa_config jsonb;

update public.knowledge_bases
set qa_config = '{}'::jsonb
where qa_config is null;

alter table public.knowledge_bases
  alter column qa_config set default '{}'::jsonb,
  alter column qa_config set not null;

notify pgrst, 'reload schema';
