import { ref } from 'vue'
import { supabase } from '../utils/supabase'

export type AIStreamScene = 'doc-assistant' | 'kb-chat'
export type AIStreamMode = 'general-ai' | 'knowledge-enhanced' | 'strict-knowledge'

export interface AIStreamChunk {
  chunkId?: string | null
  fileId?: string | null
  documentId?: string | null
  sourceType?: 'file' | 'document'
  sourceName?: string | null
  chunkIndex?: number | null
  content: string
  score?: number
  matchedKeywords?: string[]
}

export interface AIStreamRequest {
  scene: AIStreamScene
  model?: string
  runtimeConfig?: {
    baseUrl?: string
    apiKey?: string
    model?: string
  }
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  contextChunks?: AIStreamChunk[]
  mode?: AIStreamMode
  timeoutMs?: number
}

interface StreamEventPayload {
  token?: string
  fullText?: string
  error?: string
  model?: string
  finishReason?: string | null
  message?: string
}

interface StartStreamOptions {
  onToken?: (token: string) => void
  onDone?: (fullText: string, meta: { model?: string; finishReason?: string | null }) => void
  onError?: (error: Error) => void
}

function parseEventPayload(raw: string): StreamEventPayload {
  try {
    return JSON.parse(raw) as StreamEventPayload
  } catch {
    return {}
  }
}

function toReadableError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('已停止生成')
  }

  if (error instanceof Error) {
    return error
  }

  return new Error('流式请求失败')
}

async function normalizeHttpError(response: Response): Promise<Error> {
  const statusPrefix = `请求失败(${response.status})`
  const text = await response.text()

  if (!text) {
    return new Error(statusPrefix)
  }

  try {
    const parsed = JSON.parse(text) as {
      error?: string
      message?: string
      details?: string
      type?: string
    }
    const message = parsed.error || parsed.message
    const detail = typeof parsed.details === 'string' ? parsed.details.trim() : ''
    const type = typeof parsed.type === 'string' ? parsed.type.trim() : ''

    if (message && detail) {
      return new Error(`${statusPrefix}: ${message}\n详情: ${detail}`)
    }

    if (message && type) {
      return new Error(`${statusPrefix}: ${message} [${type}]`)
    }

    return new Error(message ? `${statusPrefix}: ${message}` : `${statusPrefix}: ${text}`)
  } catch {
    return new Error(`${statusPrefix}: ${text}`)
  }
}

export function useAIStream() {
  const running = ref(false)
  const stoppedByUser = ref(false)

  let controller: AbortController | null = null

  function stop() {
    stoppedByUser.value = true
    controller?.abort()
  }

  async function start(payload: AIStreamRequest, options: StartStreamOptions = {}) {
    if (running.value) {
      throw new Error('已有进行中的生成任务')
    }

    if (!payload.userPrompt?.trim()) {
      throw new Error('userPrompt 不能为空')
    }

    running.value = true
    stoppedByUser.value = false

    const nextController = new AbortController()
    controller = nextController
    let timedOut = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const timeoutMs = payload.timeoutMs ?? 300000
    const refreshTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        timedOut = true
        nextController.abort('timeout')
      }, timeoutMs)
    }

    refreshTimeout()

    const stopTimeout = () => {
      if (!timeoutId) {
        return
      }

      clearTimeout(timeoutId)
      timeoutId = null
    }

    let fullText = ''

    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data.session?.access_token
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (!accessToken) {
        throw new Error('登录已过期，请重新登录后重试')
      }

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('缺少 Supabase 前端环境变量配置')
      }

      const functionUrl = `${supabaseUrl}/functions/v1/ai-stream`

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: nextController.signal,
      })

      refreshTimeout()

      if (!response.ok) {
        throw await normalizeHttpError(response)
      }

      if (!response.body) {
        throw new Error('未收到可读取的流响应')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = ''
      let doneMeta: { model?: string; finishReason?: string | null } = {}
      let gotDoneEvent = false

      while (true) {
        const result = await reader.read()
        if (result.done) {
          break
        }

        refreshTimeout()

        buffer += decoder.decode(result.value, { stream: true })
        buffer = buffer.replace(/\r\n/g, '\n')

        let boundaryIndex = buffer.indexOf('\n\n')

        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)

          const lines = rawEvent.split('\n')
          let dataLine = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim()
            }

            if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim()
            }
          }

          const payloadData = parseEventPayload(dataLine)

          if (eventName === 'token' && payloadData.token) {
            fullText += payloadData.token
            options.onToken?.(payloadData.token)
          }

          if (eventName === 'error') {
            throw new Error(payloadData.error || 'AI 流式生成失败')
          }

          if (eventName === 'ping' || eventName === 'ready') {
            eventName = ''
            boundaryIndex = buffer.indexOf('\n\n')
            continue
          }

          if (eventName === 'done') {
            gotDoneEvent = true
            doneMeta = {
              model: payloadData.model,
              finishReason: payloadData.finishReason ?? null,
            }

            if (payloadData.fullText && payloadData.fullText.length > fullText.length) {
              fullText = payloadData.fullText
            }
          }

          eventName = ''
          boundaryIndex = buffer.indexOf('\n\n')
        }
      }

      if (!gotDoneEvent && !fullText.trim()) {
        throw new Error('流式连接已结束，但未收到有效内容')
      }

      options.onDone?.(fullText, doneMeta)
      return {
        fullText,
        stoppedByUser: stoppedByUser.value,
      }
    } catch (error) {
      if (timedOut) {
        const timeoutError = new Error(`流式连接超时：${timeoutMs}ms 内未收到数据`)
        options.onError?.(timeoutError)
        throw timeoutError
      }

      const normalized = toReadableError(error)
      options.onError?.(normalized)
      throw normalized
    } finally {
      stopTimeout()
      if (controller === nextController) {
        controller = null
      }
      running.value = false
    }
  }

  return {
    running,
    stoppedByUser,
    start,
    stop,
  }
}
