export interface AiRequestRuntimeConfig {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface AiGenerateTextParams {
  systemPrompt?: string
  userPrompt: string
  model?: string
  runtimeConfig?: AiRequestRuntimeConfig
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
  signal?: AbortSignal
}

export interface AiUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface AiTextResultData {
  id: string
  model: string
  text: string
  finishReason: string | null
  usage: AiUsage
}

export interface AiErrorDetail {
  stage:
  | 'config'
  | 'request'
  | 'network'
  | 'http'
  | 'response-parse'
  | 'response-empty'
  | 'unknown'
  endpoint?: string
  model?: string
  statusCode?: number
  statusText?: string
  requestId?: string
  providerMessage?: string
  finishReason?: string | null
  responseSnippet?: string
}

export interface AiResult<T> {
  success: boolean
  data: T | null
  error: string | null
  errorDetail?: AiErrorDetail | null
}