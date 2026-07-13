-- Batch 4: pgvector dual-column migration for knowledge chunk retrieval.
-- Initial dimension: 1536 (follow-up migrations may realign this to the chosen embedding model).
-- Safe to run multiple times.

begin;

create extension if not exists vector;

alter table public.knowledge_chunks
  add column if not exists embedding_vector vector(1536);

create index if not exists idx_knowledge_chunks_embedding_vector_hnsw
  on public.knowledge_chunks
  using hnsw (embedding_vector vector_cosine_ops)
  where embedding_vector is not null;

create or replace function public.match_knowledge_chunks(
  p_knowledge_base_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 8
)
returns table (
  id uuid,
  knowledge_base_id uuid,
  file_id uuid,
  document_id uuid,
  source_type text,
  chunk_index integer,
  content text,
  token_count integer,
  meta jsonb,
  created_at timestamptz,
  score double precision
)
language sql
stable
as $$
  select
    kc.id,
    kc.knowledge_base_id,
    kc.file_id,
    kc.document_id,
    kc.source_type,
    kc.chunk_index,
    kc.content,
    kc.token_count,
    kc.meta,
    kc.created_at,
    1 - (kc.embedding_vector <=> p_query_embedding) as score
  from public.knowledge_chunks kc
  where kc.owner_id = auth.uid()
    and kc.knowledge_base_id = p_knowledge_base_id
    and kc.embedding_vector is not null
  order by kc.embedding_vector <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 8), 1);
$$;

grant execute on function public.match_knowledge_chunks(uuid, vector, integer) to authenticated;

update public.knowledge_chunks
set embedding_vector = embedding::vector(1536)
where embedding is not null
  and embedding_vector is null
  and array_length(embedding, 1) = 1536;

notify pgrst, 'reload schema';

commit;
