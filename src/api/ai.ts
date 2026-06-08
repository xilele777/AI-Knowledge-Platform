import type { AiGenerateTextParams, AiResult, AiTextResultData } from '../types/ai'
import type { AiResolvedConfig } from '../utils/aiConfig'
import { fetchEdgeFunctionStream, invokeEdgeFunction } from '../utils/serverProxy'

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

export function extractStreamDeltaText(payload: OpenAiStreamPayload): string {
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

export function parseSseDataLines(eventText: string): string[] {
  return eventText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter(Boolean)
}

async function readStreamResponse(
  response: Response,
  fallbackModel: string,
  onChunk: (chunk: string) => void,
): Promise<{ id: string; model: string; finishReason: string | null }> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  const decoder = new TextDecoder()
  let id = ''
  let model = fallbackModel
  let finishReason: string | null = null
  let buffer = ''

  const processEvent = (eventText: string) => {
    const dataLines = parseSseDataLines(eventText)

    for (const dataText of dataLines) {
      if (dataText === '[DONE]') {
        continue
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
        // Ignore a malformed SSE event and continue reading later events.
      }
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

  return {
    id,
    model,
    finishReason,
  }
}

export async function generateAiText(
  params: AiGenerateTextParams,
  config: AiResolvedConfig,
): Promise<AiResult<AiTextResultData>> {
  try {
    if (!params.userPrompt?.trim()) {
      return fail('用户提示不能为空')
    }

    const payload = await invokeEdgeFunction<OpenAiChatCompletionResponse>('ai-chat', {
      params,
      stream: false,
    })
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

    const response = await fetchEdgeFunctionStream(
      'ai-chat',
      {
        params,
        stream: true,
      },
      {
        signal: params.signal,
      },
    )

    return ok(await readStreamResponse(response, config.model, onChunk))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return fail('请求已取消')
    }
    const message = error instanceof Error ? error.message : 'AI请求失败'
    return fail(message)
  }
}
