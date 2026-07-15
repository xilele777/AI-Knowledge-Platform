import { getCurrentUser } from './auth'
import pinia from '../stores'
import { useUserStore } from '../stores/user'
import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import { createBatchEmbeddings } from '../utils/vectorEmbedding'
import type { AiResolvedConfig } from '../utils/aiConfig'
import type {
  ApiResult,
  BatchCreateKnowledgeChunksInput,
  BatchWriteChunksResult,
  CreateKnowledgeBaseInput,
  CreateKnowledgeFileInput,
  KnowledgeBase,
  KnowledgeBaseListItem,
  KnowledgeDocumentSource,
  KnowledgeFile,
  KnowledgeFileListItem,
  KnowledgeFileListQuery,
  KnowledgeQaConfig,
  UpdateKnowledgeFileStatusInput,
} from '../types/knowledge'

type KnowledgeBaseRow = {
  id: string
  owner_id: string
  name: string
  description: string | null
  status: string
  qa_config: unknown
  created_at: string
  updated_at: string
}

type KnowledgeFileRow = {
  id: string
  knowledge_base_id: string
  owner_id: string
  file_name: string
  file_path: string | null
  storage_path?: string | null
  file_size: number | null
  mime_type: string | null
  file_type?: string | null
  status: string
  meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type KnowledgeChunkRow = {
  id: string
}

type KnowledgeDocumentRow = {
  id: string
  knowledge_base_id: string
  document_id: string
  owner_id: string
  title_snapshot: string | null
  status: string
  last_chunk_count: number
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

type DocumentTitleRow = {
  id: string
  title: string
}

const KNOWLEDGE_BASE_TABLE = 'knowledge_bases'
const KNOWLEDGE_FILE_TABLE = 'knowledge_files'
const KNOWLEDGE_CHUNK_TABLE = 'knowledge_chunks'
const KNOWLEDGE_DOCUMENT_TABLE = 'knowledge_documents'

const DEFAULT_KNOWLEDGE_QA_CONFIG: KnowledgeQaConfig = {
  systemPrompt: '',
  answerStyle: '',
  useKnowledgeEnhanced: true,
  aiProvider: 'default',
  customAi: {
    baseUrl: '',
    apiKey: '',
    model: '',
  },
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

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeKnowledgeQaConfig(input: unknown): KnowledgeQaConfig {
  if (!input || typeof input !== 'object') {
    return {
      ...DEFAULT_KNOWLEDGE_QA_CONFIG,
      customAi: { ...DEFAULT_KNOWLEDGE_QA_CONFIG.customAi },
    }
  }

  const raw = input as Record<string, unknown>
  const rawCustom = raw.customAi && typeof raw.customAi === 'object'
    ? (raw.customAi as Record<string, unknown>)
    : {}

  const normalizedModel = normalizeText(rawCustom.model)
  const useCustomProvider = raw.aiProvider === 'custom' && normalizedModel

  return {
    systemPrompt: normalizeText(raw.systemPrompt),
    answerStyle: normalizeText(raw.answerStyle),
    useKnowledgeEnhanced:
      typeof raw.useKnowledgeEnhanced === 'boolean'
        ? raw.useKnowledgeEnhanced
        : DEFAULT_KNOWLEDGE_QA_CONFIG.useKnowledgeEnhanced,
    aiProvider: useCustomProvider ? 'custom' : 'default',
    customAi: {
      baseUrl: normalizeText(rawCustom.baseUrl),
      apiKey: normalizeText(rawCustom.apiKey),
      model: normalizedModel,
    },
  }
}

function toKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    status: row.status as KnowledgeBase['status'],
    qaConfig: normalizeKnowledgeQaConfig(row.qa_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toKnowledgeBaseListItem(row: KnowledgeBaseRow): KnowledgeBaseListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as KnowledgeBaseListItem['status'],
    qaConfig: normalizeKnowledgeQaConfig(row.qa_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toKnowledgeFile(row: KnowledgeFileRow): KnowledgeFile {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    filePath: row.file_path ?? row.storage_path ?? null,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    status: row.status,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toKnowledgeFileListItem(row: KnowledgeFileRow): KnowledgeFileListItem {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toKnowledgeDocumentSource(
  row: KnowledgeDocumentRow,
  documentTitleMap: Map<string, DocumentTitleRow>,
): KnowledgeDocumentSource {
  const doc = documentTitleMap.get(row.document_id)

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    documentId: row.document_id,
    title: doc?.title || row.title_snapshot || '未命名文档',
    chunkCount: row.last_chunk_count,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isStoragePathNotNullError(message: string): boolean {
  return (
    message.includes('storage_path') &&
    (message.includes('not-null') || message.includes('not null') || message.includes('null value'))
  )
}

function isFileTypeNotNullError(message: string): boolean {
  return (
    message.includes('file_type') &&
    (message.includes('not-null') || message.includes('not null') || message.includes('null value'))
  )
}

function inferFileType(fileName: string, mimeType: string | null | undefined): string {
  if (mimeType) {
    const parts = mimeType.split('/')
    if (parts.length === 2 && parts[1]) {
      return parts[1].toLowerCase()
    }
  }

  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md')) {
    return 'md'
  }
  if (lower.endsWith('.txt')) {
    return 'txt'
  }

  return 'txt'
}

function toPgvectorLiteral(value: number[] | null | undefined): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  return `[${value.join(',')}]`
}

async function requireUserId(): Promise<string> {
  const userStore = useUserStore(pinia)
  const storeUserId = userStore.user?.id

  if (storeUserId) {
    return storeUserId
  }

  const user = await getCurrentUser()

  if (!user) {
    throw new Error('未登录或登录已过期')
  }

  return user.id
}

export async function createKnowledgeBase(
  input: CreateKnowledgeBaseInput,
): Promise<ApiResult<KnowledgeBase>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const name = input.name.trim()

    if (!name) {
      return fail('知识库名称不能为空')
    }

    const payload = {
      owner_id: userId,
      name,
      description: input.description ?? null,
      status: input.status ?? 'active',
      qa_config: { ...DEFAULT_KNOWLEDGE_QA_CONFIG },
    }

    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .insert(payload)
      .select('*')
      .single<KnowledgeBaseRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toKnowledgeBase(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function updateKnowledgeBaseQaConfig(
  knowledgeBaseId: string,
  qaConfig: KnowledgeQaConfig,
): Promise<ApiResult<KnowledgeQaConfig>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    const normalized = normalizeKnowledgeQaConfig(qaConfig)

    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .update({
        qa_config: normalized,
      })
      .eq('id', knowledgeBaseId)
      .eq('owner_id', userId)
      .select('qa_config')
      .single<{ qa_config: unknown }>()

    if (error) {
      return fail(error.message)
    }

    return ok(normalizeKnowledgeQaConfig(data.qa_config))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getMyKnowledgeBases(): Promise<ApiResult<KnowledgeBaseListItem[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .select('id, name, description, status, qa_config, created_at, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .returns<KnowledgeBaseRow[]>()

    if (error) {
      return fail(error.message)
    }

    return ok((data ?? []).map(toKnowledgeBaseListItem))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getKnowledgeBaseById(id: string): Promise<ApiResult<KnowledgeBase>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
      .select('*')
      .eq('id', id)
      .eq('owner_id', userId)
      .single<KnowledgeBaseRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toKnowledgeBase(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function createKnowledgeFile(
  input: CreateKnowledgeFileInput,
): Promise<ApiResult<KnowledgeFile>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const fileName = input.fileName.trim()

    if (!input.knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    if (!fileName) {
      return fail('文件名不能为空')
    }

    const basePayload = {
      knowledge_base_id: input.knowledgeBaseId,
      owner_id: userId,
      file_name: fileName,
      file_size: input.fileSize ?? null,
      mime_type: input.mimeType ?? null,
      status: input.status ?? 'pending',
      meta: input.meta ?? null,
    }

    const fileType = inferFileType(fileName, input.mimeType)
    let useStoragePath = false
    let useFileType = false

    let data: KnowledgeFileRow | null = null
    let error: { message: string } | null = null

    for (let i = 0; i < 4; i += 1) {
      const insertPayload: Record<string, unknown> = {
        ...basePayload,
      }

      if (useStoragePath) {
        insertPayload.storage_path = input.filePath ?? ''
      } else {
        insertPayload.file_path = input.filePath ?? null
      }

      if (useFileType) {
        insertPayload.file_type = fileType
      }

      const result = await supabase
        .from(KNOWLEDGE_FILE_TABLE)
        .insert(insertPayload)
        .select('*')
        .single<KnowledgeFileRow>()

      data = result.data
      error = result.error

      if (!error) {
        break
      }

      const shouldEnableStoragePath = isStoragePathNotNullError(error.message) && !useStoragePath
      const shouldEnableFileType = isFileTypeNotNullError(error.message) && !useFileType

      if (!shouldEnableStoragePath && !shouldEnableFileType) {
        break
      }

      if (shouldEnableStoragePath) {
        useStoragePath = true
      }

      if (shouldEnableFileType) {
        useFileType = true
      }
    }

    if (error) {
      return fail(error.message)
    }

    if (!data) {
      return fail('创建文件记录失败')
    }

    return ok(toKnowledgeFile(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getKnowledgeFiles(
  query: KnowledgeFileListQuery,
): Promise<ApiResult<KnowledgeFileListItem[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!query.knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    const limit = query.limit ?? 100
    const offset = query.offset ?? 0

    const { data, error } = await supabase
      .from(KNOWLEDGE_FILE_TABLE)
      .select('*')
      .eq('owner_id', userId)
      .eq('knowledge_base_id', query.knowledgeBaseId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .returns<KnowledgeFileRow[]>()

    if (error) {
      return fail(error.message)
    }

    return ok((data ?? []).map(toKnowledgeFileListItem))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function deleteKnowledgeFile(id: string): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!id) {
      return fail('fileId 不能为空')
    }

    const { error: chunksError } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .delete()
      .eq('file_id', id)
      .eq('owner_id', userId)

    if (chunksError) {
      return fail(chunksError.message)
    }

    const { error } = await supabase
      .from(KNOWLEDGE_FILE_TABLE)
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

export async function deleteKnowledgeBase(id: string): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!id) {
      return fail('knowledgeBaseId 不能为空')
    }

    // 删除关联的文档切片
    const { error: chunksError } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .delete()
      .eq('knowledge_base_id', id)
      .eq('owner_id', userId)

    if (chunksError) {
      return fail(chunksError.message)
    }

    // 删除关联的文件
    const { error: filesError } = await supabase
      .from(KNOWLEDGE_FILE_TABLE)
      .delete()
      .eq('knowledge_base_id', id)
      .eq('owner_id', userId)

    if (filesError) {
      return fail(filesError.message)
    }

    // 删除关联的文档关系
    const { error: documentsError } = await supabase
      .from(KNOWLEDGE_DOCUMENT_TABLE)
      .delete()
      .eq('knowledge_base_id', id)
      .eq('owner_id', userId)

    if (documentsError) {
      return fail(documentsError.message)
    }

    // 删除知识库本身
    const { error } = await supabase
      .from(KNOWLEDGE_BASE_TABLE)
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

export async function removeDocumentFromKnowledgeBase(
  knowledgeBaseId: string,
  documentId: string,
): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    // 删除该文档在该知识库中的切片
    const { error: chunksError } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .delete()
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('document_id', documentId)
      .eq('owner_id', userId)

    if (chunksError) {
      return fail(chunksError.message)
    }

    // 删除文档与知识库的关联关系
    const { error } = await supabase
      .from(KNOWLEDGE_DOCUMENT_TABLE)
      .delete()
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('document_id', documentId)
      .eq('owner_id', userId)

    if (error) {
      return fail(error.message)
    }

    return ok(true)
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getKnowledgeDocumentSources(
  knowledgeBaseId: string,
): Promise<ApiResult<KnowledgeDocumentSource[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    const { data, error } = await supabase
      .from(KNOWLEDGE_DOCUMENT_TABLE)
      .select('*')
      .eq('owner_id', userId)
      .eq('knowledge_base_id', knowledgeBaseId)
      .order('updated_at', { ascending: false })
      .returns<KnowledgeDocumentRow[]>()

    if (error) {
      return fail(error.message)
    }

    const rows = data ?? []
    if (!rows.length) {
      return ok([])
    }

    const documentIds = Array.from(new Set(rows.map((item) => item.document_id)))
    const { data: docsData, error: docsError } = await supabase
      .from('documents')
      .select('id, title')
      .eq('owner_id', userId)
      .in('id', documentIds)
      .returns<DocumentTitleRow[]>()

    if (docsError) {
      return fail(docsError.message)
    }

    const documentTitleMap = new Map((docsData ?? []).map((item) => [item.id, item]))

    return ok(rows.map((item) => toKnowledgeDocumentSource(item, documentTitleMap)))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function updateKnowledgeFileStatus(
  input: UpdateKnowledgeFileStatusInput,
): Promise<ApiResult<KnowledgeFile>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!input.fileId) {
      return fail('fileId 不能为空')
    }

    const { data, error } = await supabase
      .from(KNOWLEDGE_FILE_TABLE)
      .update({
        status: input.status,
        meta: input.meta ?? null,
      })
      .eq('id', input.fileId)
      .eq('owner_id', userId)
      .select('*')
      .single<KnowledgeFileRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toKnowledgeFile(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function batchInsertKnowledgeChunks(
  input: BatchCreateKnowledgeChunksInput,
  options?: {
    generateEmbeddings?: boolean
    config?: AiResolvedConfig
  },
): Promise<ApiResult<BatchWriteChunksResult>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!input.knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    if (!input.chunks.length) {
      return fail('chunks 不能为空')
    }

    let chunksWithEmbeddings = input.chunks
    let embeddingStatus: BatchWriteChunksResult['embeddingStatus'] = 'skipped'
    let embeddingError: string | null = null

    if (options?.generateEmbeddings && options?.config) {
      try {
        const embeddings = await createBatchEmbeddings(
          input.chunks.map((chunk) => chunk.content),
          options.config,
        )
        chunksWithEmbeddings = input.chunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index].embedding,
          embeddingVector: embeddings[index].embedding,
        }))
        embeddingStatus = 'generated'
      } catch (error) {
        embeddingStatus = 'failed'
        embeddingError = error instanceof Error ? error.message : 'Embedding 生成失败'
        console.warn('[knowledge.batchInsertKnowledgeChunks] embedding generation failed:', error)
      }
    }

    const payload = chunksWithEmbeddings.map((chunk) => ({
      knowledge_base_id: input.knowledgeBaseId,
      file_id: input.fileId ?? null,
      document_id: input.documentId ?? null,
      source_type: input.sourceType ?? (input.documentId ? 'document' : 'file'),
      owner_id: userId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      token_count: chunk.tokenCount ?? null,
      meta: chunk.meta ?? null,
      embedding: chunk.embedding ?? null,
      embedding_vector: toPgvectorLiteral(chunk.embeddingVector ?? chunk.embedding ?? null),
    }))

    const { data, error } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .insert(payload)
      .select('id')
      .returns<KnowledgeChunkRow[]>()

    if (error) {
      return fail(error.message)
    }

    const inserted = data ?? []

    return ok({
      insertedCount: inserted.length,
      chunkIds: inserted.map((item) => item.id),
      embeddingStatus,
      embeddingError,
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}
