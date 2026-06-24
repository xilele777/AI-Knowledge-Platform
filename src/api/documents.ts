import { getCurrentUser } from './auth'
import { batchInsertKnowledgeChunks } from './knowledge'
import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import type {
  AddDocumentToKnowledgeBaseInput,
  AddDocumentToKnowledgeBaseResult,
  ApiResult,
  CreateDocumentInput,
  Document,
  DocumentListItem,
  DocumentListQuery,
  DocumentStatus,
  UpdateDocumentInput,
} from '../types/document'
import { chunkText } from '../utils/chunkText'

type DocumentRow = {
  id: string
  owner_id: string
  title: string
  content_md: string
  summary: string | null
  status: DocumentStatus
  is_shared: boolean
  shared_at: string | null
  created_at: string
  updated_at: string
}

const TABLE_NAME = 'documents'
const KNOWLEDGE_BASE_TABLE = 'knowledge_bases'
const KNOWLEDGE_CHUNK_TABLE = 'knowledge_chunks'
const KNOWLEDGE_DOCUMENT_TABLE = 'knowledge_documents'

type KnowledgeBaseRow = {
  id: string
}

type KnowledgeDocumentBridgeRow = {
  id: string
}

function ok<T>(data: T): ApiResult<T> {
  return {
    success: true,
    data,
    error: null,
  }
}

function fail<T>(message: string): ApiResult<T> {
  return {
    success: false,
    data: null,
    error: message,
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '请求失败，请稍后重试'
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    content: row.content_md,
    summary: row.summary,
    status: row.status,
    isShared: row.is_shared,
    sharedAt: row.shared_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDocumentListItem(row: DocumentRow & { owner_name?: string }): DocumentListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    isShared: row.is_shared,
    sharedAt: row.shared_at,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('未登录或登录已过期')
  }

  return user.id
}

export async function createDocument(input: CreateDocumentInput): Promise<ApiResult<Document>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const payload = {
      owner_id: userId,
      title: input.title.trim(),
      content_md: input.content ?? '',
      summary: input.summary ?? null,
      status: input.status ?? 'draft',
      is_shared: false,
      shared_at: null,
    }

    if (!payload.title) {
      return fail('标题不能为空')
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select('*')
      .single<DocumentRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toDocument(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getMyDocuments(
  query: DocumentListQuery = {},
): Promise<ApiResult<DocumentListItem[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const keyword = query.searchTitle?.trim()

    let builder = supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (keyword) {
      builder = builder.ilike('title', `%${keyword}%`)
    }

    const { data, error } = await builder.returns<DocumentRow[]>()

    if (error) {
      return fail(error.message)
    }

    return ok((data ?? []).map(toDocumentListItem))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getDocumentById(id: string): Promise<ApiResult<Document>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .eq('owner_id', userId)
      .single<DocumentRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toDocument(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function updateDocument(
  id: string,
  input: UpdateDocumentInput,
): Promise<ApiResult<Document>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const payload: {
      title?: string
      content_md?: string
      summary?: string | null
      status?: DocumentStatus
      is_shared?: boolean
      shared_at?: string | null
    } = {}

    if (typeof input.title === 'string') {
      const trimmedTitle = input.title.trim()

      if (!trimmedTitle) {
        return fail('标题不能为空')
      }

      payload.title = trimmedTitle
    }

    if (typeof input.content === 'string') {
      payload.content_md = input.content
    }

    if (Object.prototype.hasOwnProperty.call(input, 'summary')) {
      payload.summary = input.summary ?? null
    }

    if (input.status) {
      payload.status = input.status
    }

    if (typeof input.isShared === 'boolean') {
      payload.is_shared = input.isShared
      payload.shared_at = input.isShared ? new Date().toISOString() : null
    }

    if (Object.keys(payload).length === 0) {
      return fail('没有可更新的字段')
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(payload)
      .eq('id', id)
      .eq('owner_id', userId)
      .select('*')
      .single<DocumentRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toDocument(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getSharedDocuments(
  query: DocumentListQuery = {},
): Promise<ApiResult<DocumentListItem[]>> {
  try {
    assertSupabaseConfigured()

    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const keyword = query.searchTitle?.trim()

    let builder = supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('is_shared', true)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (keyword) {
      builder = builder.ilike('title', `%${keyword}%`)
    }

    const { data, error } = await builder.returns<DocumentRow[]>()

    if (error) {
      return fail(error.message)
    }

    return ok((data || []).map((row) => ({
      ...toDocumentListItem(row),
      ownerName: '匿名用户',
    })))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getSharedDocumentById(id: string): Promise<ApiResult<Document>> {
  try {
    assertSupabaseConfigured()

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .eq('is_shared', true)
      .single<DocumentRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toDocument(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function deleteDocument(id: string): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id)
      .eq('owner_id', userId)

    if (error) {
      return fail(error.message)
    }

    return ok(true)
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function searchDocumentsByTitle(keyword: string): Promise<ApiResult<DocumentListItem[]>> {
  return getMyDocuments({
    searchTitle: keyword,
  })
}

export async function addDocumentToKnowledgeBase(
  input: AddDocumentToKnowledgeBaseInput,
): Promise<ApiResult<AddDocumentToKnowledgeBaseResult>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const documentId = input.documentId.trim()
    const knowledgeBaseId = input.knowledgeBaseId.trim()

    if (!documentId) {
      return fail('documentId 不能为空')
    }

    if (!knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    const { data: documentData, error: documentError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', documentId)
      .eq('owner_id', userId)
      .single<DocumentRow>()

    if (documentError || !documentData) {
      return fail(documentError?.message || '文档不存在或无权限')
    }

    const { data: knowledgeBaseData, error: knowledgeBaseError } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .select('id')
      .eq('id', knowledgeBaseId)
      .eq('owner_id', userId)
      .single<KnowledgeBaseRow>()

    if (knowledgeBaseError || !knowledgeBaseData) {
      return fail(knowledgeBaseError?.message || '知识库不存在或无权限')
    }

    const chunks = chunkText(documentData.content_md ?? '', {
      minLength: 300,
      maxLength: 500,
    })

    if (!chunks.length) {
      return fail('文档内容为空或无法切片，请先补充文档内容')
    }

    const now = new Date().toISOString()
    const { error: bridgeError } = await supabase
      .from(KNOWLEDGE_DOCUMENT_TABLE)
      .upsert(
        {
          knowledge_base_id: knowledgeBaseId,
          document_id: documentId,
          owner_id: userId,
          title_snapshot: documentData.title,
          status: 'active',
          last_chunk_count: chunks.length,
          last_synced_at: now,
        },
        {
          onConflict: 'knowledge_base_id,document_id',
        },
      )
      .select('id')
      .single<KnowledgeDocumentBridgeRow>()

    if (bridgeError) {
      return fail(bridgeError.message)
    }

    const { error: deleteOldChunksError } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .delete()
      .eq('owner_id', userId)
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('document_id', documentId)

    if (deleteOldChunksError) {
      return fail(deleteOldChunksError.message)
    }

    const insertResult = await batchInsertKnowledgeChunks({
      knowledgeBaseId,
      documentId,
      sourceType: 'document',
      chunks: chunks.map((item) => ({
        chunkIndex: item.index,
        content: item.content,
        tokenCount: item.length,
        meta: {
          sourceType: 'document',
          documentId,
          documentTitle: documentData.title,
        },
      })),
    }, {
      generateEmbeddings: Boolean(input.aiConfig),
      config: input.aiConfig ?? undefined,
    })

    let insertedCount = insertResult.data?.insertedCount ?? 0
    let embeddingStatus: AddDocumentToKnowledgeBaseResult['embeddingStatus'] =
      insertResult.data?.embeddingStatus ?? (input.aiConfig ? 'failed' : 'skipped')
    let embeddingError = insertResult.data?.embeddingError ?? null

    if (!insertResult.success || !insertResult.data) {
      return fail(insertResult.error || '文档切片入库失败')
    }

    insertedCount = insertResult.data.insertedCount
    embeddingStatus = insertResult.data.embeddingStatus
    embeddingError = insertResult.data.embeddingError

    const { error: updateBridgeError } = await supabase
      .from(KNOWLEDGE_DOCUMENT_TABLE)
      .update({
        title_snapshot: documentData.title,
        last_chunk_count: insertedCount,
        last_synced_at: now,
      })
      .eq('owner_id', userId)
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('document_id', documentId)

    if (updateBridgeError) {
      return fail(updateBridgeError.message)
    }

    return ok({
      knowledgeBaseId,
      documentId,
      documentTitle: documentData.title,
      chunkCount: insertedCount,
      embeddingStatus,
      embeddingError,
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}
