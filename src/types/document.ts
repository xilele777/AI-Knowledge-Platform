export type DocumentStatus = 'draft' | 'published' | 'archived'

export interface Document {
  id: string
  ownerId: string
  title: string
  content: string
  summary: string | null
  status: DocumentStatus
  createdAt: string
  updatedAt: string
}

export interface DocumentListItem {
  id: string
  title: string
  status: DocumentStatus
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
}

export interface DocumentListQuery {
  searchTitle?: string
  limit?: number
  offset?: number
}

export interface AddDocumentToKnowledgeBaseInput {
  documentId: string
  knowledgeBaseId: string
}

export interface AddDocumentToKnowledgeBaseResult {
  knowledgeBaseId: string
  documentId: string
  documentTitle: string
  chunkCount: number
}

export interface ApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}
