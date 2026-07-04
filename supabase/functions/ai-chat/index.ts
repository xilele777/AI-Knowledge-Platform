import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveUserAiConfig } from '../_shared/aiConfig.ts'

type AiGenerateTextParams = {
  systemPrompt?: string
  userPrompt?: string
  history?: Array<{ role?: string; content?: string }>
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

type ChatRequestBody = {
  params?: AiGenerateTextParams
  stream?: boolean
}

// 服务端防御性上限：即使客户端裁剪失效，也不放任意长的历史打到上游。
const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_TOTAL_CHARS = 24000

function sanitizeHistory(history: AiGenerateTextParams['history']) {
  const items = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : []
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let totalChars = 0

  for (const item of items) {
    const role = item?.role
    const content = typeof item?.content === 'string' ? item.content.trim() : ''

    if ((role !== 'user' && role !== 'assistant') || !content) {
      continue
    }

    totalChars += content.length
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) {
      break
    }

    messages.push({ role, content })
  }

  return messages
}

function buildMessages(params: AiGenerateTextParams) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  if (params.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: params.systemPrompt.trim() })
  }

  messages.push(...sanitizeHistory(params.history))
  messages.push({ role: 'user', content: params.userPrompt?.trim() || '' })
  return messages
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader) {
    return errorResponse('Unauthorized', 401)
  }

  try {
    const body = (await request.json()) as ChatRequestBody
    const params = body.params || {}
    const userPrompt = params.userPrompt?.trim()

    if (!userPrompt) {
      return errorResponse('userPrompt is required', 400)
    }

    const config = await resolveUserAiConfig(authHeader)
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildMessages(params),
        stream: body.stream === true,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        top_p: params.topP,
        presence_penalty: params.presencePenalty,
        frequency_penalty: params.frequencyPenalty,
      }),
    })

    if (body.stream === true) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    }

    const payload = await upstream.json().catch(() => null)
    return jsonResponse(payload, upstream.status)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed'
    const status = message === 'Unauthorized' ? 401 : 400
    return errorResponse(message, status)
  }
})
