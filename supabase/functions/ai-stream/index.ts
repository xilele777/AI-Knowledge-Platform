import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

type SceneType = 'doc-assistant' | 'kb-chat'
type ModeType = 'general-ai' | 'knowledge-enhanced' | 'strict-knowledge'

type ContextChunk = {
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

type StreamRequestBody = {
  scene: SceneType
  model?: string
  runtimeConfig?: {
    baseUrl?: string
    apiKey?: string
    model?: string
  }
  systemPrompt?: string
  userPrompt?: string
  temperature?: number
  contextChunks?: ContextChunk[]
  mode?: ModeType
}

type OpenAIStreamChunk = {
  model?: string
  choices?: Array<{
    delta?: {
      content?: unknown
      reasoning_content?: unknown
      text?: unknown
    }
    message?: {
      content?: unknown
    }
    text?: unknown
    finish_reason?: string | null
  }>
  output_text?: unknown
}

type UpstreamCallResult = {
  response: Response
  endpoint: string
}

type ModelAttemptFailure = {
  model: string
  reason: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function writeSseEvent(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(payload))
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRuntimeConfig(value: unknown): { baseUrl: string; apiKey: string; model: string } {
  if (!value || typeof value !== 'object') {
    return { baseUrl: '', apiKey: '', model: '' }
  }

  const raw = value as Record<string, unknown>
  return {
    baseUrl: toText(raw.baseUrl),
    apiKey: toText(raw.apiKey),
    model: toText(raw.model),
  }
}

function looksLikeHtmlDocument(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (normalized.startsWith('<!doctype html')) {
    return true
  }

  if (normalized.startsWith('<html') || normalized.includes('<head') || normalized.includes('<body')) {
    return true
  }

  return normalized.includes('<div id="root"') || normalized.includes('<div id="app"')
}

function normalizeContextChunks(value: unknown): ContextChunk[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const source = item as Record<string, unknown>
      const content = toText(source.content)
      if (!content) {
        return null
      }

      return {
        chunkId: typeof source.chunkId === 'string' ? source.chunkId : null,
        fileId: typeof source.fileId === 'string' ? source.fileId : null,
        documentId: typeof source.documentId === 'string' ? source.documentId : null,
        sourceType: source.sourceType === 'document' ? 'document' : 'file',
        sourceName: typeof source.sourceName === 'string' ? source.sourceName : null,
        chunkIndex: typeof source.chunkIndex === 'number' ? source.chunkIndex : null,
        content,
        score: typeof source.score === 'number' ? source.score : 0,
        matchedKeywords: Array.isArray(source.matchedKeywords)
          ? source.matchedKeywords.filter((x): x is string => typeof x === 'string')
          : [],
      }
    })
    .filter((item): item is ContextChunk => Boolean(item))
}

function buildFinalPrompt(input: {
  userPrompt: string
  mode?: ModeType
  contextChunks: ContextChunk[]
}): string {
  if (input.contextChunks.length === 0) {
    return input.userPrompt
  }

  const contextText = input.contextChunks
    .map((chunk, index) => {
      const sourceName = chunk.sourceName || chunk.chunkId || `chunk-${index + 1}`
      return `【参考 ${index + 1}｜${sourceName}】\n${chunk.content}`
    })
    .join('\n\n')

  if (input.mode === 'strict-knowledge') {
    return [
      '请严格仅基于参考资料回答；若资料不足，请明确说明“知识库中暂无足够信息”。',
      `参考资料：\n${contextText}`,
      `用户问题：\n${input.userPrompt}`,
    ].join('\n\n')
  }

  return [`参考资料：\n${contextText}`, `用户问题：\n${input.userPrompt}`].join('\n\n')
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

      const source = item as Record<string, unknown>

      if (typeof source.text === 'string') {
        return source.text
      }

      if (typeof source.content === 'string') {
        return source.content
      }

      if (source.delta && typeof source.delta === 'object') {
        const delta = source.delta as Record<string, unknown>
        if (typeof delta.text === 'string') {
          return delta.text
        }
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
    if (!text) {
      return ''
    }

    // Skip obvious metadata-like strings.
    if (text.length <= 3) {
      return ''
    }

    return text
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
  const prioritizedKeys = [
    'content',
    'text',
    'output_text',
    'answer',
    'response',
    'message',
    'result',
  ]

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

function extractChunkToken(chunk: OpenAIStreamChunk): string {
  const choice = chunk.choices?.[0]
  if (!choice) {
    return extractTextFromUnknownContent(chunk.output_text)
  }

  const fromDeltaContent = extractTextFromUnknownContent(choice.delta?.content)
  if (fromDeltaContent) {
    return fromDeltaContent
  }

  const fromDeltaText = extractTextFromUnknownContent(choice.delta?.text)
  if (fromDeltaText) {
    return fromDeltaText
  }

  const fromReasoning = extractTextFromUnknownContent(choice.delta?.reasoning_content)
  if (fromReasoning) {
    return fromReasoning
  }

  const fromMessage = extractTextFromUnknownContent(choice.message?.content)
  if (fromMessage) {
    return fromMessage
  }

  const fromChoiceText = extractTextFromUnknownContent(choice.text)
  if (fromChoiceText) {
    return fromChoiceText
  }

  return ''
}

function extractTextFromCompletionPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const root = payload as Record<string, unknown>

  if (root.error && typeof root.error === 'object') {
    return ''
  }

  const directOutput = extractTextFromUnknownContent(root.output_text)
  if (directOutput && !looksLikeHtmlDocument(directOutput)) {
    return directOutput
  }

  const choices = Array.isArray(root.choices) ? root.choices : []
  for (const item of choices) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const choice = item as Record<string, unknown>

    const fromMessage = extractTextFromUnknownContent((choice.message as { content?: unknown } | undefined)?.content)
    if (fromMessage && !looksLikeHtmlDocument(fromMessage)) {
      return fromMessage
    }

    const fromText = extractTextFromUnknownContent(choice.text)
    if (fromText && !looksLikeHtmlDocument(fromText)) {
      return fromText
    }
  }

  const deepFallback = extractFirstDeepText(root)
  if (deepFallback && !looksLikeHtmlDocument(deepFallback)) {
    return deepFallback
  }

  return ''
}

function extractTextFromRawUpstream(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  let text = ''

  // SSE-style chunks
  const lines = normalized.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '[DONE]') {
      continue
    }

    if (trimmed.startsWith('data:')) {
      const rawData = trimmed.slice(5).trim()
      if (!rawData || rawData === '[DONE]') {
        continue
      }

      try {
        const parsed = JSON.parse(rawData) as OpenAIStreamChunk | Record<string, unknown>
        const token = extractChunkToken(parsed as OpenAIStreamChunk)
        if (token) {
          text += token
          continue
        }

        const fromPayload = extractTextFromCompletionPayload(parsed)
        if (fromPayload) {
          text += fromPayload
        }
      } catch {
        text += rawData
      }
      continue
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        const fromPayload = extractTextFromCompletionPayload(parsed)
        if (fromPayload) {
          text += fromPayload
          continue
        }
      } catch {
        // not a valid JSON line
      }
    }

    if (!trimmed.startsWith('event:') && !trimmed.startsWith('id:') && !trimmed.startsWith(':')) {
      text += trimmed
    }
  }

  if (text.trim()) {
    if (looksLikeHtmlDocument(text)) {
      return ''
    }
    return text
  }

  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized)
      return extractTextFromCompletionPayload(parsed)
    } catch {
      return ''
    }
  }

  if (looksLikeHtmlDocument(normalized)) {
    return ''
  }

  return normalized
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '')
}

function normalizeModelName(model: unknown): string {
  return typeof model === 'string' ? model.trim() : ''
}

function parseModelAliases(): Record<string, string> {
  const raw = (Deno.env.get('OPENAI_MODEL_ALIASES') || '').trim()
  if (!raw) {
    return {}
  }

  // Prefer JSON object format: {"alias":"real-model"}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const alias = key.trim().toLowerCase()
        const target = normalizeModelName(value)
        if (alias && target) {
          result[alias] = target
        }
      }
      return result
    }
  } catch {
    // Fallback to key=value,key2=value2 format.
  }

  const result: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [rawAlias, ...rest] = pair.split('=')
    const alias = (rawAlias || '').trim().toLowerCase()
    const target = normalizeModelName(rest.join('='))
    if (alias && target) {
      result[alias] = target
    }
  }

  return result
}

function parseFallbackModels(): string[] {
  const raw = (Deno.env.get('OPENAI_FALLBACK_MODELS') || '').trim()
  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((item) => normalizeModelName(item))
    .filter(Boolean)
}

function uniqueModels(models: string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const model of models) {
    const normalized = normalizeModelName(model)
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    unique.push(normalized)
  }

  return unique
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function resolveMaxTokensForModel(model: string): number | undefined {
  const envValue = (Deno.env.get('OPENAI_MAX_TOKENS') || '').trim()
  const fromEnv = envValue ? parsePositiveInt(envValue) : null
  if (fromEnv) {
    return fromEnv
  }

  // Anthropic-compatible endpoints often require max_tokens.
  if (model.toLowerCase().includes('claude')) {
    return 4096
  }

  return undefined
}

function buildUpstreamBody(input: {
  model: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
  temperature: number
  stream: boolean
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
    stream: input.stream,
  }

  const maxTokens = resolveMaxTokensForModel(input.model)
  if (typeof maxTokens === 'number') {
    body.max_tokens = maxTokens
  }

  return body
}

function stringifyResponseSnippet(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.length <= 220) {
    return trimmed
  }

  return `${trimmed.slice(0, 220)}...`
}

function resolveRequestedModel(input: {
  requestedModel: string
  defaultModel: string
  aliases: Record<string, string>
}): { model: string; requestedModel: string; aliasTarget: string | null } {
  const requested = normalizeModelName(input.requestedModel)
  if (!requested) {
    return {
      model: input.defaultModel,
      requestedModel: '',
      aliasTarget: null,
    }
  }

  const aliasTarget = input.aliases[requested.toLowerCase()] || null
  return {
    model: aliasTarget || requested,
    requestedModel: requested,
    aliasTarget,
  }
}

function looksLikeUnsupportedModelError(text: string): boolean {
  const normalized = text.toLowerCase()

  return (
    normalized.includes('不支持所选模型') ||
    normalized.includes('unsupported model') ||
    normalized.includes('model_not_supported') ||
    normalized.includes('invalid model') ||
    normalized.includes('model does not exist') ||
    normalized.includes('unknown model')
  )
}

function parseBaseUrls(): string[] {
  const rawList = Deno.env.get('OPENAI_BASE_URLS') || ''
  const fromList = rawList
    .split(',')
    .map((item) => normalizeBaseUrl(item))
    .filter(Boolean)

  if (fromList.length > 0) {
    // 如果环境变量有旧地址，直接忽略，使用新地址
    // return fromList
  }

  const single = normalizeBaseUrl(Deno.env.get('OPENAI_BASE_URL') || 'https://api.scnet.cn/api/llm/v1')
  return [single]
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function callUpstreamWithFailover(input: {
  baseUrls: string[]
  apiKey: string
  body: Record<string, unknown>
  signal: AbortSignal
}): Promise<UpstreamCallResult> {
  const attempts: string[] = []

  for (const baseUrl of input.baseUrls) {
    const endpoint = `${baseUrl}/chat/completions`

    // Keep per-endpoint dial timeout short so failover can proceed quickly.
    const perTryController = new AbortController()
    const timeoutId = setTimeout(() => {
      perTryController.abort('connect-timeout')
    }, 60000)

    const forwardAbort = () => {
      perTryController.abort('request-aborted')
    }

    input.signal.addEventListener('abort', forwardAbort, { once: true })

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.body),
        signal: perTryController.signal,
      })

      clearTimeout(timeoutId)
      if (response.ok && response.body) {
        return {
          response,
          endpoint,
        }
      }

      const failureText = await response.text()
      const snippet = stringifyResponseSnippet(failureText)
      attempts.push(
        `${endpoint} -> status=${response.status}${snippet ? `, body=${snippet}` : ''}`,
      )
    } catch (error) {
      attempts.push(`${endpoint} -> ${asErrorMessage(error)}`)
    } finally {
      clearTimeout(timeoutId)
      input.signal.removeEventListener('abort', forwardAbort)
    }
  }

  throw new Error(`所有上游地址都失败：${attempts.join(' | ')}`)
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const body = (await request.json()) as StreamRequestBody
    const scene = body.scene
    const userPrompt = toText(body.userPrompt)

    if (scene !== 'doc-assistant' && scene !== 'kb-chat') {
      return new Response(JSON.stringify({ error: 'scene 不合法' }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    if (!userPrompt) {
      return new Response(JSON.stringify({ error: 'userPrompt 不能为空' }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    const runtimeConfig = normalizeRuntimeConfig(body.runtimeConfig)
    const openAiApiKey = runtimeConfig.apiKey || Deno.env.get('OPENAI_API_KEY') || 'sk-OTcwLTExMjk3NTc0ODgzLTE3NzM0MTA3NTYzNDc='
    const openAiBaseUrls = runtimeConfig.baseUrl
      ? [normalizeBaseUrl(runtimeConfig.baseUrl)]
      : parseBaseUrls()
    const defaultModel = normalizeModelName(Deno.env.get('OPENAI_MODEL') || 'MiniMax-M2.5')
    const requestedModelRaw = normalizeModelName(runtimeConfig.model || body.model)
    const modelAliases = parseModelAliases()
    const fallbackModels = parseFallbackModels()
    const resolvedModel = resolveRequestedModel({
      requestedModel: requestedModelRaw,
      defaultModel,
      aliases: modelAliases,
    })

    if (!openAiApiKey) {
      return new Response(JSON.stringify({ error: '缺少 OPENAI_API_KEY secret 或请求中未提供 apiKey' }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    const contextChunks = normalizeContextChunks(body.contextChunks)
    const finalPrompt = buildFinalPrompt({
      userPrompt,
      mode: body.mode,
      contextChunks,
    })

    const messages: Array<{ role: 'system' | 'user'; content: string }> = []

    const systemPrompt = toText(body.systemPrompt)
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    messages.push({ role: 'user', content: finalPrompt })

    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.2
    const modelCandidates = uniqueModels([
      resolvedModel.model,
      defaultModel,
      ...fallbackModels,
      'gpt-4o-mini',
    ])

    let upstreamCall: UpstreamCallResult | null = null
    let upstreamResponse: Response | null = null
    let modelUsedForCall = ''
    let streamRequestBody: Record<string, unknown> | null = null
    const failures: ModelAttemptFailure[] = []

    for (const candidateModel of modelCandidates) {
      const candidateBody = buildUpstreamBody({
        model: candidateModel,
        messages,
        temperature,
        stream: true,
      })

      try {
        const callResult = await callUpstreamWithFailover({
          baseUrls: openAiBaseUrls,
          apiKey: openAiApiKey,
          body: candidateBody,
          signal: request.signal,
        })

        upstreamCall = callResult
        upstreamResponse = callResult.response
        modelUsedForCall = candidateModel
        streamRequestBody = candidateBody
        break
      } catch (error) {
        failures.push({
          model: candidateModel,
          reason: asErrorMessage(error),
        })
      }
    }

    if (!upstreamCall || !upstreamResponse || !streamRequestBody) {
      const unsupportedCount = failures.filter((item) => looksLikeUnsupportedModelError(item.reason)).length
      const details = failures
        .map((item) => `[${item.model}] ${item.reason}`)
        .join(' | ')

      return new Response(
        JSON.stringify({
          error:
            unsupportedCount > 0
              ? `模型尝试均失败（含 ${unsupportedCount} 次模型不支持）。请检查 OPENAI_MODEL / OPENAI_FALLBACK_MODELS 与上游支持列表。`
              : '上游接口调用失败，请检查 OPENAI_BASE_URL(S)、OPENAI_API_KEY 或网关可用性。',
          details,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const stream = new ReadableStream({
      async start(controller) {
        const contentType = (upstreamResponse.headers.get('content-type') || '').toLowerCase()

        if (contentType.includes('application/json')) {
          try {
            const payload = await upstreamResponse.json()
            const text = extractTextFromCompletionPayload(payload)

            if (text) {
              writeSseEvent(controller, 'ready', { ok: true })
              writeSseEvent(controller, 'token', { token: text })
              writeSseEvent(controller, 'done', {
                fullText: text,
                model: modelUsedForCall,
                finishReason: null,
              })
              controller.close()
              return
            }
          } catch {
            // Continue into standard stream parser as a fallback.
          }
        }

        const reader = upstreamResponse.body!.getReader()
        const decoder = new TextDecoder()
        let fullText = ''
        let model = modelUsedForCall
        let finishReason: string | null = null
        let buffer = ''
        let rawCapture = ''
        let pingTimer: number | null = null

        // Send an immediate event so the client can confirm the stream is alive.
        writeSseEvent(controller, 'ready', { ok: true })
        pingTimer = setInterval(() => {
          writeSseEvent(controller, 'ping', { ts: Date.now() })
        }, 10000)

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }

            const decodedPart = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            rawCapture += decodedPart
            if (rawCapture.length > 200000) {
              rawCapture = rawCapture.slice(-200000)
            }

            buffer += decodedPart
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) {
                continue
              }

              const rawData = trimmed.slice(5).trim()

              if (rawData === '[DONE]') {
                writeSseEvent(controller, 'done', {
                  fullText,
                  model,
                  finishReason,
                })
                controller.close()
                return
              }

              try {
                const chunk = JSON.parse(rawData) as OpenAIStreamChunk
                model = chunk.model || model

                const choice = chunk.choices?.[0]
                if (choice?.finish_reason) {
                  finishReason = choice.finish_reason
                }

                const token = extractChunkToken(chunk)
                if (!token) {
                  continue
                }

                fullText += token
                writeSseEvent(controller, 'token', { token })
              } catch {
                const fallbackToken = extractTextFromRawUpstream(rawData)
                if (fallbackToken) {
                  fullText += fallbackToken
                  writeSseEvent(controller, 'token', { token: fallbackToken })
                }
              }
            }
          }

          if (buffer.trim().startsWith('data:')) {
            const rawData = buffer.trim().slice(5).trim()
            if (rawData !== '[DONE]') {
              try {
                const chunk = JSON.parse(rawData) as OpenAIStreamChunk
                model = chunk.model || model
                const token = extractChunkToken(chunk)
                if (token) {
                  fullText += token
                  writeSseEvent(controller, 'token', { token })
                }
              } catch {
                // Ignore trailing non-JSON fragment.
              }
            }
          }

          if (!fullText.trim()) {
            const rawExtracted = extractTextFromRawUpstream(rawCapture)
            if (rawExtracted) {
              fullText = rawExtracted
              writeSseEvent(controller, 'token', { token: rawExtracted })
            }
          }

          if (!fullText.trim()) {
            // Some providers accept stream=true but only return final text in non-stream format.
            try {
              const fallbackCall = await callUpstreamWithFailover({
                baseUrls: openAiBaseUrls,
                apiKey: openAiApiKey,
                body: buildUpstreamBody({
                  model: modelUsedForCall,
                  messages,
                  temperature,
                  stream: false,
                }),
                signal: request.signal,
              })

              if (fallbackCall.response.ok) {
                const fallbackRaw = await fallbackCall.response.text()
                const fallbackText = extractTextFromRawUpstream(fallbackRaw)
                if (fallbackText) {
                  fullText = fallbackText
                  writeSseEvent(controller, 'token', { token: fallbackText })
                }
              }
            } catch {
              // Keep graceful done event even if fallback extraction fails.
            }
          }

          if (looksLikeHtmlDocument(fullText)) {
            writeSseEvent(controller, 'error', {
              error: '检测到上游返回 HTML 页面而非模型文本，请检查 OPENAI_BASE_URL(S) 与网关路由配置',
            })
            controller.close()
            return
          }

          if (!fullText.trim()) {
            writeSseEvent(controller, 'error', {
              error: '上游已响应，但未解析到文本内容，请检查模型或接口返回格式',
            })
            controller.close()
            return
          }

          writeSseEvent(controller, 'done', {
            fullText,
            model,
            finishReason,
          })
          controller.close()
        } catch (error) {
          const message = error instanceof Error ? error.message : '流式转发失败'
          writeSseEvent(controller, 'error', { error: message })
          controller.close()
        } finally {
          if (pingTimer !== null) {
            clearInterval(pingTimer)
          }
          reader.releaseLock()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '请求解析失败'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }
})
