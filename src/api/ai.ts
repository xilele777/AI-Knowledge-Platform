import type {
  AiErrorDetail,
  AiGenerateTextParams,
  AiResult,
  AiTextResultData,
  AiUsage,
} from '../types/ai'
import { getAiConfigMissingFields, resolveAiConfig } from '../utils/aiConfig'

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type OpenAiChatCompletionResponse = {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

function ok<T>(data: T): AiResult<T> {
  return {
    success: true,
    data,
    error: null,
    errorDetail: null,
  }
}

function fail<T>(message: string, detail?: AiErrorDetail): AiResult<T> {
  return {
    success: false,
    data: null,
    error: message,
    errorDetail: detail || null,
  }
}

function normalizeUnknownError(error: unknown): { message: string; detail: AiErrorDetail } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      message: 'AI 请求已取消',
      detail: {
        stage: 'request',
        providerMessage: error.message,
      },
    }
  }

  if (error instanceof TypeError) {
    return {
      message: `网络请求失败：${error.message}`,
      detail: {
        stage: 'network',
        providerMessage: error.message,
      },
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      detail: {
        stage: 'unknown',
        providerMessage: error.message,
      },
    }
  }

  return {
    message: 'AI 请求失败，请稍后重试',
    detail: {
      stage: 'unknown',
    },
  }
}

function toUsage(usage?: OpenAiChatCompletionResponse['usage']): AiUsage {
  return {
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
  }
}

function buildMessages(params: AiGenerateTextParams): OpenAiMessage[] {
  const messages: OpenAiMessage[] = []

  if (params.systemPrompt?.trim()) {
    messages.push({
      role: 'system',
      content: params.systemPrompt.trim(),
    })
  }

  messages.push({
    role: 'user',
    content: params.userPrompt.trim(),
  })

  return messages
}

function normalizeHttpError(status: number, payload: OpenAiChatCompletionResponse | null): string {
  const upstreamMessage = payload?.error?.message

  if (upstreamMessage) {
    return `AI 服务错误(${status}): ${upstreamMessage}`
  }

  return `AI 服务错误(${status})`
}

function formatSnippet(raw: string, maxLength = 400): string {
  if (!raw) {
    return ''
  }

  const normalized = raw.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function parseContentFromMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const chunks = content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }

      const maybeText = (item as { text?: unknown }).text
      return typeof maybeText === 'string' ? maybeText : ''
    })
    .filter(Boolean)

  return chunks.join('\n').trim()
}

function extractTextFromPayload(payload: OpenAiChatCompletionResponse | null): {
  text: string
  finishReason: string | null
} {
  const choice = payload?.choices?.[0]
  const finishReason = choice?.finish_reason ?? null

  const messageText = parseContentFromMessageContent(choice?.message?.content)

  if (messageText) {
    return { text: messageText, finishReason }
  }

  const fallbackText = (choice as { text?: unknown } | undefined)?.text

  if (typeof fallbackText === 'string' && fallbackText.trim()) {
    return {
      text: fallbackText.trim(),
      finishReason,
    }
  }

  return {
    text: '',
    finishReason,
  }
}

export async function generateAiText(params: AiGenerateTextParams): Promise<AiResult<AiTextResultData>> {
  try {
    if (!params.userPrompt?.trim()) {
      return fail('userPrompt 不能为空')
    }

    const config = resolveAiConfig()
    const missingFields = getAiConfigMissingFields(config)

    if (missingFields.length > 0) {
      return fail(`AI 配置不完整，请先配置：${missingFields.join(', ')}`, {
        stage: 'config',
        endpoint: config.baseUrl ? `${config.baseUrl}/chat/completions` : undefined,
        model: config.model,
      })
    }

    const endpoint = `${config.baseUrl}/chat/completions`
    const requestBody = {
      model: config.model,
      messages: buildMessages(params),
      stream: false,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      presence_penalty: params.presencePenalty,
      frequency_penalty: params.frequencyPenalty,
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: params.signal,
    })

    let payload: OpenAiChatCompletionResponse | null = null
    let rawResponseText = ''

    try {
      rawResponseText = await response.text()

      if (rawResponseText) {
        payload = JSON.parse(rawResponseText) as OpenAiChatCompletionResponse
      }
    } catch {
      return fail('AI 响应解析失败，返回内容不是合法 JSON', {
        stage: 'response-parse',
        endpoint,
        model: config.model,
        statusCode: response.status,
        statusText: response.statusText,
        requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined,
        responseSnippet: formatSnippet(rawResponseText),
      })
    }

    if (!response.ok) {
      return fail(normalizeHttpError(response.status, payload), {
        stage: 'http',
        endpoint,
        model: config.model,
        statusCode: response.status,
        statusText: response.statusText,
        requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined,
        providerMessage: payload?.error?.message,
        responseSnippet: formatSnippet(rawResponseText),
      })
    }

    const extraction = extractTextFromPayload(payload)
    const text = extraction.text

    if (!text) {
      return fail('AI 返回内容为空（响应结构与预期不一致或模型未返回文本）', {
        stage: 'response-empty',
        endpoint,
        model: payload?.model || config.model,
        statusCode: response.status,
        statusText: response.statusText,
        requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined,
        finishReason: extraction.finishReason,
        responseSnippet: formatSnippet(rawResponseText),
      })
    }

    return ok({
      id: payload?.id || '',
      model: payload?.model || config.model,
      text,
      finishReason: extraction.finishReason,
      usage: toUsage(payload?.usage),
    })
  } catch (error) {
    const normalized = normalizeUnknownError(error)
    return fail(normalized.message, normalized.detail)
  }
}

export function getAiConfigStatus() {
  const config = resolveAiConfig()
  const missingFields = getAiConfigMissingFields(config)

  return {
    configured: missingFields.length === 0,
    missingFields,
  }
}

export const aiPrompts = {
  polish: '你是中文写作助手。请在不改变原意的前提下润色文本，使其更专业、更自然。',
  expand: '你是中文写作助手。请在保留核心观点的前提下扩写文本，补充细节与论据。',
  summarize: '你是中文写作助手。请提炼文本要点并输出简洁总结。',
  continue: '你是中文写作助手。请保持原文语气与逻辑，续写后续内容。',
} as const
