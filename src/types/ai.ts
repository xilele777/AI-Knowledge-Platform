export interface UserAiConfig {
  id?: string
  userId?: string
  apiBaseUrl?: string
  apiKey?: string
  model?: string
  createdAt?: string
  updatedAt?: string
}

export interface AiChatSourceChunk {
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

export interface AiChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiGenerateTextParams {
  systemPrompt?: string
  userPrompt: string
  /** 多轮对话历史（按时间正序，不含当前问题），由 chatHistory 工具裁剪后传入 */
  history?: AiChatHistoryMessage[]
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  signal?: AbortSignal
}

export type AiChatRequestKind = 'plain' | 'knowledge-enhanced'

export type AiChatAnswerMode = 'general-ai' | 'knowledge-enhanced' | 'strict-knowledge'

export interface AiChatStreamMeta {
  mode?: AiChatAnswerMode
  sources?: AiChatSourceChunk[]
}

export interface AiChatRequestPayload {
  kind: AiChatRequestKind
  params?: Partial<AiGenerateTextParams>
  knowledge?: {
    knowledgeBaseId?: string
    question: string
    history?: AiChatHistoryMessage[]
    systemPrompt?: string
    answerStyle?: string
    sources?: AiChatSourceChunk[]
  }
}

export interface AiChatRequest {
  stream?: boolean
  request?: AiChatRequestPayload
  params?: AiGenerateTextParams
}

export interface AiTextResultData {
  id: string
  model: string
  text: string
  finishReason: string | null
}

export interface AiErrorDetail {
  message: string
}

export interface AiResult<T> {
  success: boolean
  data: T | null
  error: string | null
  errorDetail?: AiErrorDetail | null
}
