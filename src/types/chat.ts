export interface ApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatAnswerMode = 'general-ai' | 'knowledge-enhanced' | 'strict-knowledge'
export type ChatMessageStatus = 'streaming' | 'done' | 'error'

export interface ChatSession {
  id: string
  ownerId: string
  knowledgeBaseId: string | null
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatListItem {
  id: string
  knowledgeBaseId: string | null
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatSourceChunk {
  chunkId: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number | null
  content: string
  score: number
  matchedKeywords: string[]
}

export interface ChatMessage {
  id: string
  chatId: string
  ownerId: string
  role: ChatRole
  content: string
  sources: ChatSourceChunk[]
  answerMode: ChatAnswerMode | null
  status: ChatMessageStatus
  errorMessage: string | null
  createdAt: string
}

export interface ChatAnswerResult {
  answer: string
  mode: ChatAnswerMode
  sources: ChatSourceChunk[]
}

export interface CreateChatInput {
  knowledgeBaseId?: string | null
  title?: string
}

export interface CreateChatMessageInput {
  chatId: string
  role: ChatRole
  content: string
  sources?: ChatSourceChunk[]
  answerMode?: ChatAnswerMode | null
  status?: ChatMessageStatus
  errorMessage?: string | null
}

export interface KnowledgeChunkForQa {
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
  createdAt: string
}
