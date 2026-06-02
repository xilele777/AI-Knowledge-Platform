import type { AiResolvedConfig } from '../utils/aiConfig'

export type DocumentStatus = 'draft' | 'published' | 'archived'

export interface Document {
  id: string
  ownerId: string
  title: string
  content: string
  summary: string | null
  status: DocumentStatus
  isShared: boolean
  sharedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentListItem {
  id: string
  title: string
  status: DocumentStatus
  isShared: boolean
  sharedAt: string | null
  ownerId?: string
  ownerName?: string
  createdAt: string
  updatedAt: string
}

export interface CreateDocumentInput {
  title: string
  content?: string
  summary?: string | null
  status?: DocumentStatus
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
  summary?: string | null
  status?: DocumentStatus
  isShared?: boolean
}

export interface DocumentListQuery {
  searchTitle?: string
  limit?: number
  offset?: number
}

export interface AddDocumentToKnowledgeBaseInput {
  documentId: string
  knowledgeBaseId: string
  aiConfig?: AiResolvedConfig | null
}

export interface AddDocumentToKnowledgeBaseResult {
  knowledgeBaseId: string
  documentId: string
  documentTitle: string
  chunkCount: number
  embeddingStatus: 'generated' | 'skipped' | 'failed'
  embeddingError: string | null
}

export interface ApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}
