import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveEmbeddingModel, resolveUserAiConfig } from '../_shared/aiConfig.ts'

type EmbeddingRequestBody = {
  input?: string | string[]
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
    const body = (await request.json()) as EmbeddingRequestBody
    const input = body.input
    const hasInput = Array.isArray(input)
      ? input.some((item) => item.trim())
      : Boolean(input?.trim())

    if (!hasInput) {
      return errorResponse('input is required', 400)
    }

    const config = await resolveUserAiConfig(authHeader)
    const upstream = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        model: resolveEmbeddingModel(config.model),
      }),
    })

    const payload = await upstream.json().catch(() => null)
    return jsonResponse(payload, upstream.status)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding request failed'
    const status = message === 'Unauthorized' ? 401 : 400
    return errorResponse(message, status)
  }
})
