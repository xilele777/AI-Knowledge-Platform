import type { AiResolvedConfig } from '../utils/aiConfig'

export type DocumentStatus = 'draft' | 'published' | 'archived'
export type SharedDocumentSort = 'latest' | 'hottest' | 'comprehensive'

export interface Document {
  id: string
  ownerId: string
  ownerName?: string
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
  characterCount: number
  status: DocumentStatus
  isShared: boolean
  sharedAt: string | null
  ownerId?: string
  ownerName?: string
  viewCount?: number
  recentViewCount?: number
  hotScore?: number
  comprehensiveScore?: number
  createdAt: string
  updatedAt: string
}

/** 首页近 7 天某一天的更新计数(date 为 Asia/Shanghai 口径的 YYYY-MM-DD) */
export interface DashboardDailyCount {
  date: string
  count: number
}

/** 首页「最近文档」条目(不含正文) */
export interface DashboardRecentDoc {
  id: string
  title: string
  characterCount: number
  updatedAt: string
}

/** 首页聚合统计:由 get_dashboard_stats RPC 一次返回,免去下载全部正文 */
export interface DashboardStats {
  totalCharacters: number
  totalDocs: number
  knowledgeBaseCount: number
  last7Days: DashboardDailyCount[]
  recent: DashboardRecentDoc[]
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
  sortBy?: SharedDocumentSort
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
