export interface AiResolvedConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiRuntimeConfigInput {
  baseUrl?: string
  apiKey?: string
  model?: string
}

const DEFAULT_BASE_URL = 'https://api.scnet.cn/api/llm/v1'
const DEFAULT_API_KEY = 'sk-OTcwLTExMjk3NTc0ODgzLTE3NzM0MTA3NTYzNDc='
const DEFAULT_MODEL = 'MiniMax-M2.5'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
}

export function resolveAiConfig(): AiResolvedConfig {
  const baseUrl = normalizeBaseUrl(import.meta.env.VITE_AI_BASE_URL || DEFAULT_BASE_URL)
  const apiKey = (import.meta.env.VITE_AI_API_KEY || DEFAULT_API_KEY).trim()
  const model = import.meta.env.VITE_AI_MODEL?.trim() || DEFAULT_MODEL

  return {
    baseUrl,
    apiKey,
    model,
  }
}

export function getAiConfigMissingFields(config?: AiResolvedConfig): string[] {
  const target = config || resolveAiConfig()
  const missing: string[] = []

  if (!target.baseUrl) {
    missing.push('API Base URL')
  }

  if (!target.apiKey) {
    missing.push('API Key')
  }

  return missing
}
