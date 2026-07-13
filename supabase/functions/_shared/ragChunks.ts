import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'
import { resolveEmbeddingModel, resolveUserAiConfig } from './aiConfig.ts'

type ChunkRow = {
  id: string
  knowledge_base_id: string
  file_id: string | null
  document_id: string | null
  source_type: 'file' | 'document' | null
  chunk_index: number
  content: string
  token_count: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  embedding_vector?: string | null
  created_at: string
}

type KnowledgeFileNameRow = {
  id: string
  file_name: string
}

type DocumentTitleRow = {
  id: string
  title: string
}

export type RagChunk = {
  id: string
  knowledgeBaseId: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
  content: string
  tokenCount: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  embeddingVector?: string | null
  createdAt: string
}

const QA_CHUNK_SELECT =
  'id, knowledge_base_id, file_id, document_id, source_type, chunk_index, content, token_count, meta, embedding, embedding_vector, created_at'

function toPgvectorLiteral(value: number[]): string {
  return `[${value.join(',')}]`
}

function createAuthedClient(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })
}

async function requireUserId(authHeader: string): Promise<{ client: ReturnType<typeof createAuthedClient>; userId: string }> {
  const client = createAuthedClient(authHeader)
  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError || !userResult.user) {
    throw new Error('Unauthorized')
  }

  return { client, userId: userResult.user.id }
}

async function resolveSourceNameMaps(
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
  chunks: Array<{ fileId: string | null; documentId: string | null }>,
): Promise<{ fileNameMap: Map<string, string>; documentTitleMap: Map<string, string> }> {
  const fileIds = Array.from(
    new Set(chunks.map((item) => item.fileId).filter((item): item is string => Boolean(item))),
  )
  const documentIds = Array.from(
    new Set(chunks.map((item) => item.documentId).filter((item): item is string => Boolean(item))),
  )

  const [filesResult, documentsResult] = await Promise.all([
    fileIds.length
      ? client
          .from('knowledge_files')
          .select('id, file_name')
          .eq('owner_id', userId)
          .in('id', fileIds)
          .returns<KnowledgeFileNameRow[]>()
      : Promise.resolve({ data: [] as KnowledgeFileNameRow[], error: null }),
    documentIds.length
      ? client
          .from('documents')
          .select('id, title')
          .eq('owner_id', userId)
          .in('id', documentIds)
          .returns<DocumentTitleRow[]>()
      : Promise.resolve({ data: [] as DocumentTitleRow[], error: null }),
  ])

  if (filesResult.error) {
    throw new Error(filesResult.error.message)
  }

  if (documentsResult.error) {
    throw new Error(documentsResult.error.message)
  }

  return {
    fileNameMap: new Map((filesResult.data ?? []).map((item) => [item.id, item.file_name])),
    documentTitleMap: new Map((documentsResult.data ?? []).map((item) => [item.id, item.title])),
  }
}

function toRagChunk(
  row: ChunkRow,
  fileNameMap: Map<string, string>,
  documentTitleMap: Map<string, string>,
): RagChunk {
  const sourceType = row.source_type === 'document' || row.document_id ? 'document' : 'file'
  const sourceName =
    sourceType === 'document'
      ? row.document_id
        ? documentTitleMap.get(row.document_id) ?? null
        : null
      : row.file_id
        ? fileNameMap.get(row.file_id) ?? null
        : null

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    fileId: row.file_id,
    documentId: row.document_id,
    sourceType,
    sourceName,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    meta: row.meta,
    embedding: Array.isArray(row.embedding) ? row.embedding : null,
    embeddingVector: typeof row.embedding_vector === 'string' ? row.embedding_vector : null,
    createdAt: row.created_at,
  }
}

export async function loadKnowledgeChunksForQa(
  authHeader: string,
  knowledgeBaseId: string,
  limit = 500,
): Promise<RagChunk[]> {
  const { client, userId } = await requireUserId(authHeader)

  const { data, error } = await client
    .from('knowledge_chunks')
    .select(QA_CHUNK_SELECT)
    .eq('owner_id', userId)
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('chunk_index', { ascending: true })
    .limit(limit)
    .returns<ChunkRow[]>()

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  const { fileNameMap, documentTitleMap } = await resolveSourceNameMaps(
    client,
    userId,
    rows.map((row) => ({ fileId: row.file_id, documentId: row.document_id })),
  )

  return rows.map((row) => toRagChunk(row, fileNameMap, documentTitleMap))
}

export type RagVectorMatchRow = {
  id: string
  knowledge_base_id: string
  file_id: string | null
  document_id: string | null
  source_type: 'file' | 'document' | null
  chunk_index: number
  content: string
  token_count: number | null
  meta: Record<string, unknown> | null
  created_at: string
  score: number
}

export async function matchKnowledgeChunksByVector(
  authHeader: string,
  knowledgeBaseId: string,
  queryEmbedding: number[],
  limit = 8,
): Promise<Array<RagChunk & { score: number }>> {
  const { client, userId } = await requireUserId(authHeader)

  const { data, error } = await client.rpc('match_knowledge_chunks', {
    p_knowledge_base_id: knowledgeBaseId,
    p_query_embedding: toPgvectorLiteral(queryEmbedding),
    p_match_count: limit,
  }) as { data: RagVectorMatchRow[] | null; error: { message: string } | null }

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  const { fileNameMap, documentTitleMap } = await resolveSourceNameMaps(
    client,
    userId,
    rows.map((row) => ({ fileId: row.file_id, documentId: row.document_id })),
  )

  return rows.map((row) => ({
    ...toRagChunk(
      {
        ...row,
        embedding: null,
        embedding_vector: null,
      },
      fileNameMap,
      documentTitleMap,
    ),
    score: row.score,
  }))
}

export async function createQueryEmbedding(authHeader: string, question: string): Promise<number[]> {
  const config = await resolveUserAiConfig(authHeader)
  const upstream = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: question,
      model: resolveEmbeddingModel(config.model),
    }),
  })

  const payload = await upstream.json().catch(() => null) as { data?: Array<{ embedding?: unknown }> } | null
  const embedding = payload?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || !embedding.every((item) => typeof item === 'number')) {
    throw new Error('Embedding API 返回格式无效')
  }

  return embedding
}
