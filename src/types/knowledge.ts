export interface ApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export type KnowledgeChunkSourceType = 'file' | 'document'

export type KnowledgeBaseStatus = 'active' | 'archived'

export type QaAiProviderType = 'default' | 'custom'

export interface QaCustomAiConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface KnowledgeQaConfig {
  systemPrompt: string
  answerStyle: string
  useKnowledgeEnhanced: boolean
  aiProvider: QaAiProviderType
  customAi: QaCustomAiConfig
}

export interface KnowledgeBase {
  id: string
  ownerId: string
  name: string
  description: string | null
  status: KnowledgeBaseStatus
  qaConfig: KnowledgeQaConfig
  createdAt: string
  updatedAt: string
}

export interface KnowledgeBaseListItem {
  id: string
  name: string
  description: string | null
  status: KnowledgeBaseStatus
  qaConfig: KnowledgeQaConfig
  createdAt: string
  updatedAt: string
}

export interface CreateKnowledgeBaseInput {
  name: string
  description?: string | null
  status?: KnowledgeBaseStatus
}

export interface KnowledgeFileStatus {
  value: string
}

export interface KnowledgeFile {
  id: string
  knowledgeBaseId: string
  ownerId: string
  fileName: string
  filePath: string | null
  fileSize: number | null
  mimeType: string | null
  status: string
  meta: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeFileListItem {
  id: string
  knowledgeBaseId: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface CreateKnowledgeFileInput {
  knowledgeBaseId: string
  fileName: string
  filePath?: string | null
  fileSize?: number | null
  mimeType?: string | null
  status?: string
  meta?: Record<string, unknown> | null
}

export interface UpdateKnowledgeFileStatusInput {
  fileId: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  meta?: Record<string, unknown> | null
}

export interface KnowledgeFileListQuery {
  knowledgeBaseId: string
  limit?: number
  offset?: number
}

export interface KnowledgeChunk {
  id: string
  knowledgeBaseId: string
  fileId: string | null
  documentId: string | null
  sourceType: KnowledgeChunkSourceType
  ownerId: string
  chunkIndex: number
  content: string
  tokenCount: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  embeddingVector?: number[] | null
  createdAt: string
}

export interface CreateKnowledgeChunkInput {
  knowledgeBaseId: string
  fileId?: string | null
  documentId?: string | null
  sourceType?: KnowledgeChunkSourceType
  chunkIndex: number
  content: string
  tokenCount?: number | null
  meta?: Record<string, unknown> | null
  embedding?: number[] | null
  embeddingVector?: number[] | null
}

export interface BatchCreateKnowledgeChunksInput {
  knowledgeBaseId: string
  fileId?: string | null
  documentId?: string | null
  sourceType?: KnowledgeChunkSourceType
  chunks: Array<{
    chunkIndex: number
    content: string
    tokenCount?: number | null
    meta?: Record<string, unknown> | null
    embedding?: number[] | null
    embeddingVector?: number[] | null
  }>
}

export interface BatchWriteChunksResult {
  insertedCount: number
  chunkIds: string[]
  embeddingStatus: 'generated' | 'skipped' | 'failed'
  embeddingError: string | null
}

export interface KnowledgeDocumentSource {
  id: string
  knowledgeBaseId: string
  documentId: string
  title: string
  chunkCount: number
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}
