/**
 * AI API 连通性测试
 * 直接用表单中未保存的值发起最小请求，让用户在保存前发现 key/URL/模型错误。
 * 上游需支持浏览器 CORS（OpenAI 兼容服务基本都支持）。
 */
import { normalizeBaseUrl } from '../../shared/aiConfigCore'

export interface ConnectivityResult {
  success: boolean
  /** 请求耗时（毫秒） */
  latencyMs: number
  /** embedding 测试成功时返回向量维度 */
  dimension?: number
  error?: string
}

const TEST_TIMEOUT_MS = 15_000

function describeFailure(status: number, payload: unknown): string {
  const upstreamMessage =
    payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined

  if (status === 401 || status === 403) {
    return `API Key 无效或无权限（HTTP ${status}）${upstreamMessage ? `：${upstreamMessage}` : ''}`
  }
  if (status === 404) {
    return `接口路径不存在（HTTP 404），请检查 Base URL 是否以 /v1 结尾`
  }
  return `上游返回 HTTP ${status}${upstreamMessage ? `：${upstreamMessage}` : ''}`
}

function describeNetworkError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `请求超时（${TEST_TIMEOUT_MS / 1000} 秒），请检查 Base URL 是否可达`
  }
  return '网络请求失败，请检查 Base URL 是否正确、服务是否支持浏览器跨域访问'
}

async function postJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: unknown; latencyMs: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  const startedAt = performance.now()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    return { status: response.status, payload, latencyMs: Math.round(performance.now() - startedAt) }
  } finally {
    clearTimeout(timer)
  }
}

export async function testChatApi(input: {
  baseUrl?: string
  apiKey?: string
  model?: string
}): Promise<ConnectivityResult> {
  if (!input.apiKey?.trim()) {
    return { success: false, latencyMs: 0, error: '请先填写 API Key' }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  try {
    const { status, payload, latencyMs } = await postJson(`${baseUrl}/chat/completions`, input.apiKey, {
      model: input.model?.trim() || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    })

    if (status >= 200 && status < 300) {
      return { success: true, latencyMs }
    }
    return { success: false, latencyMs, error: describeFailure(status, payload) }
  } catch (error) {
    return { success: false, latencyMs: 0, error: describeNetworkError(error) }
  }
}

export async function testEmbeddingApi(input: {
  baseUrl?: string
  apiKey?: string
  model?: string
}): Promise<ConnectivityResult> {
  if (!input.apiKey?.trim()) {
    return { success: false, latencyMs: 0, error: '请先填写 API Key' }
  }
  if (!input.model?.trim()) {
    return { success: false, latencyMs: 0, error: '请先填写 Embedding 模型' }
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  try {
    const { status, payload, latencyMs } = await postJson(`${baseUrl}/embeddings`, input.apiKey, {
      input: 'ping',
      model: input.model.trim(),
    })

    if (status >= 200 && status < 300) {
      const embedding = (payload as { data?: Array<{ embedding?: unknown }> } | null)?.data?.[0]?.embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        return { success: false, latencyMs, error: '接口可达，但返回内容不是有效的向量，请确认这是 Embedding 模型' }
      }
      return { success: true, latencyMs, dimension: embedding.length }
    }
    return { success: false, latencyMs, error: describeFailure(status, payload) }
  } catch (error) {
    return { success: false, latencyMs: 0, error: describeNetworkError(error) }
  }
}
