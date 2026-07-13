import type { UserAiConfig } from '../types/ai'
import { normalizeBaseUrl, resolveDefaultModel } from '../../shared/aiConfigCore'

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

export function resolveAiConfigFromUserConfig(userConfig: UserAiConfig | null): AiResolvedConfig {
  return {
    baseUrl: normalizeBaseUrl(userConfig?.apiBaseUrl),
    apiKey: typeof userConfig?.apiKey === 'string' ? userConfig.apiKey.trim() : '',
    model: resolveDefaultModel(userConfig?.model),
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
