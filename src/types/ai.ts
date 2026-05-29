export interface UserAiConfig {
  id?: string
  userId?: string
  apiBaseUrl?: string
  apiKey?: string
  model?: string
  createdAt?: string
  updatedAt?: string
}

export interface AiGenerateTextParams {
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  signal?: AbortSignal
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
