import type { UserAiConfig } from '../types/ai'

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

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

function normalizeBaseUrl(url: string | undefined | null): string {
  if (!url) return DEFAULT_BASE_URL
  const trimmed = url.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function resolveAiConfigFromUserConfig(userConfig: UserAiConfig | null): AiResolvedConfig {
  return {
    baseUrl: normalizeBaseUrl(userConfig?.apiBaseUrl),
    apiKey: userConfig?.apiKey?.trim() || '',
    model: userConfig?.model?.trim() || DEFAULT_MODEL,
  }
}

export function getAiConfigMissingFields(config: AiResolvedConfig): string[] {
  const missing: string[] = []
  if (!config.baseUrl) missing.push('API Base URL')
  if (!config.apiKey) missing.push('API Key')
  return missing
}

export function isAiConfigComplete(config: AiResolvedConfig): boolean {
  return getAiConfigMissingFields(config).length === 0
}
