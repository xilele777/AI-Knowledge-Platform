import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveUserAiConfig } from '../_shared/aiConfig.ts'

type AiGenerateTextParams = {
  systemPrompt?: string
  userPrompt?: string
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

function buildMessages(params: AiGenerateTextParams) {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = []

  if (params.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: params.systemPrompt.trim() })
  }

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
