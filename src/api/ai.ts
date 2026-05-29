import type { AiGenerateTextParams, AiResult, AiTextResultData } from '../types/ai'
import type { AiResolvedConfig } from '../utils/aiConfig'
import { getAiConfigMissingFields } from '../utils/aiConfig'

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type OpenAiChatCompletionResponse = {
  id?: string
  model?: string
  output_text?: unknown
  choices?: Array<{
    finish_reason?: string | null
    text?: unknown
    message?: {
      content?: unknown
    }
  }>
  error?: {
    message?: string
  }
}

type OpenAiStreamPayload = {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string | null
    delta?: {
      content?: unknown
    }
    message?: {
      content?: unknown
    }
    text?: unknown
  }>
}

function ok<T>(data: T): AiResult<T> {
  return {
    success: true,
    data,
    error: null,
    errorDetail: null,
  }
}

function fail<T>(message: string): AiResult<T> {
  return {
    success: false,
    data: null,
    error: message,
    errorDetail: { message },
  }
}

function buildMessages(params: AiGenerateTextParams): OpenAiMessage[] {
  const messages: OpenAiMessage[] = []
  if (params.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: params.systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: params.userPrompt.trim() })
  return messages
}

function extractTextFromUnknownContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }

      const record = item as Record<string, unknown>
      if (typeof record.text === 'string') {
        return record.text
      }

      if (typeof record.content === 'string') {
        return record.content
      }

      if (
        record.delta &&
        typeof record.delta === 'object' &&
        typeof (record.delta as Record<string, unknown>).text === 'string'
      ) {
        return (record.delta as Record<string, string>).text
      }

      return ''
    })
    .join('')
}

function extractFirstDeepText(node: unknown, depth = 0): string {
  if (depth > 8 || node == null) {
    return ''
  }

  if (typeof node === 'string') {
    const text = node.trim()
    return text.length > 3 ? text : ''
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractFirstDeepText(item, depth + 1)
      if (found) {
        return found
      }
    }
    return ''
  }

  if (typeof node !== 'object') {
    return ''
  }

  const record = node as Record<string, unknown>
  const prioritizedKeys = ['content', 'text', 'output_text', 'answer', 'response', 'message', 'result']
  for (const key of prioritizedKeys) {
    if (key in record) {
      const found = extractFirstDeepText(record[key], depth + 1)
      if (found) {
        return found
      }
    }
  }

  for (const value of Object.values(record)) {
    const found = extractFirstDeepText(value, depth + 1)
    if (found) {
      return found
    }
  }

  return ''
}

export function extractTextFromCompletionPayload(payload: OpenAiChatCompletionResponse | null): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const directOutput = extractTextFromUnknownContent(payload.output_text)
  if (directOutput) {
    return directOutput
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : []
  for (const item of choices) {
    const fromMessage = extractTextFromUnknownContent(item.message?.content)
    if (fromMessage) {
      return fromMessage
    }

    const fromText = extractTextFromUnknownContent(item.text)
    if (fromText) {
      return fromText
    }
  }

  return extractFirstDeepText(payload)
}

function extractStreamDeltaText(payload: OpenAiStreamPayload): string {
  const choice = payload.choices?.[0]
  if (!choice) {
    return ''
  }

  return (
    extractTextFromUnknownContent(choice.delta?.content) ||
    extractTextFromUnknownContent(choice.message?.content) ||
    extractTextFromUnknownContent(choice.text)
  )
}

export async function generateAiText(
  params: AiGenerateTextParams,
  config: AiResolvedConfig,
): Promise<AiResult<AiTextResultData>> {
  try {
    if (!params.userPrompt?.trim()) {
      return fail('用户提示不能为空')
    }

    const missingFields = getAiConfigMissingFields(config)
    if (missingFields.length > 0) {
      return fail(`AI配置不完整，请先配置: ${missingFields.join(', ')}`)
    }

    const endpoint = `${config.baseUrl}/chat/completions`
    const requestBody = {
      model: config.model,
      messages: buildMessages(params),
      stream: false,
      temperature: params.temperature ?? 0.7,
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
    try {
      payload = await response.json()
    } catch {
      return fail('AI响应解析失败')
    }

    if (!response.ok) {
      const errorMsg = payload?.error?.message || `AI服务错误 (${response.status})`
      return fail(errorMsg)
    }

    const choice = payload?.choices?.[0]
    const text = extractTextFromCompletionPayload(payload).trim()
    if (!text) {
      return fail('AI返回内容为空')
    }

    return ok({
      id: payload?.id || '',
      model: payload?.model || config.model,
      text,
      finishReason: choice?.finish_reason || null,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('请求已取消')
    }
    const message = error instanceof Error ? error.message : 'AI请求失败'
    return fail(message)
  }
}

export async function generateAiTextStream(
  params: AiGenerateTextParams,
  config: AiResolvedConfig,
  onChunk: (chunk: string) => void,
): Promise<AiResult<{ id: string; model: string; finishReason: string | null }>> {
  try {
    if (!params.userPrompt?.trim()) {
      return fail('用户提示不能为空')
    }

    const missingFields = getAiConfigMissingFields(config)
    if (missingFields.length > 0) {
      return fail(`AI配置不完整，请先配置: ${missingFields.join(', ')}`)
    }

    const endpoint = `${config.baseUrl}/chat/completions`
    const requestBody = {
      model: config.model,
      messages: buildMessages(params),
      stream: true,
      temperature: params.temperature ?? 0.7,
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

    if (!response.ok) {
      let errorMsg = `AI服务错误 (${response.status})`
      try {
        const errorPayload = await response.json()
        errorMsg = errorPayload?.error?.message || errorMsg
      } catch {
        // 忽略解析错误，使用默认错误信息
      }
      return fail(errorMsg)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      return fail('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let id = ''
    let model = config.model
    let finishReason: string | null = null
    let buffer = ''

    const processEvent = (eventText: string) => {
      const dataLines = eventText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))

      if (dataLines.length === 0) {
        return
      }

      const dataText = dataLines.join('\n').trim()
      if (!dataText || dataText === '[DONE]') {
        return
      }

      try {
        const data = JSON.parse(dataText) as OpenAiStreamPayload
        id = data.id || id
        model = data.model || model

        const choice = data.choices?.[0]
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason
        }

        const content = extractStreamDeltaText(data)
        if (content) {
          onChunk(content)
        }
      } catch {
        // 忽略单个 SSE 事件解析错误，继续处理后续事件。
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''

      for (const eventText of events) {
        processEvent(eventText)
      }
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      processEvent(buffer)
    }

    return ok({
      id,
      model,
      finishReason,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('请求已取消')
    }
    const message = error instanceof Error ? error.message : 'AI请求失败'
    return fail(message)
  }
}
