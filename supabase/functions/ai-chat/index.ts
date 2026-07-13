import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveUserAiConfig } from '../_shared/aiConfig.ts'
import {
  buildGeneralAiPrompt,
  buildUpstreamMessages,
  normalizeAiChatRequest,
} from '../_shared/aiPrompt.ts'
import { loadKnowledgeChunksForQa, createQueryEmbedding } from '../_shared/ragChunks.ts'
import { selectKnowledgeSources } from '../_shared/ragRetrieval.ts'
import { rewriteQuestionForServerRetrieval } from '../_shared/ragRewrite.ts'

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

type AiChatRequestKind = 'plain' | 'knowledge-enhanced'

type AiChatKnowledgePayload = {
  knowledgeBaseId?: string
  question?: string
  history?: Array<{ role?: string; content?: string }>
  systemPrompt?: string
  answerStyle?: string
  sources?: Array<{
    chunkId?: string
    fileId?: string | null
    documentId?: string | null
    sourceType?: 'file' | 'document'
    sourceName?: string | null
    chunkIndex?: number | null
    content?: string
    score?: number
    matchedKeywords?: string[]
  }>
}

type AiChatRequestPayload = {
  kind?: AiChatRequestKind
  params?: AiGenerateTextParams
  knowledge?: AiChatKnowledgePayload
}

type ChatRequestBody = {
  request?: AiChatRequestPayload
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

function normalizeRequest(body: ChatRequestBody) {
  const requestKind = body.request?.kind
  const kind: AiChatRequestKind =
    requestKind === 'knowledge-enhanced' ? 'knowledge-enhanced' : 'plain'

  return {
    kind,
    params: body.request?.params || body.params || {},
    stream: body.stream === true,
  }
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
    const normalized = normalizeAiChatRequest(body)
    const userPrompt =
      normalized.kind === 'knowledge-enhanced'
        ? normalized.knowledge?.question
        : normalized.params.userPrompt?.trim()

    if (!userPrompt) {
      return errorResponse('userPrompt is required', 400)
    }

    const config = await resolveUserAiConfig(authHeader)
    let streamMeta: { type: 'meta'; mode: 'general-ai' | 'knowledge-enhanced'; sources: unknown[] } | null = null

    if (normalized.kind === 'knowledge-enhanced' && normalized.knowledge?.knowledgeBaseId) {
      const rewrittenQuestion = await rewriteQuestionForServerRetrieval(
        normalized.knowledge.question,
        normalized.knowledge.history,
        config,
      )
      const chunks = await loadKnowledgeChunksForQa(authHeader, normalized.knowledge.knowledgeBaseId, 500)
      const queryEmbedding = chunks.length ? await createQueryEmbedding(authHeader, rewrittenQuestion) : null
      const selection = await selectKnowledgeSources({
        authHeader,
        knowledgeBaseId: normalized.knowledge.knowledgeBaseId,
        question: rewrittenQuestion,
        chunks,
        queryEmbedding,
      })

      streamMeta = {
        type: 'meta',
        mode: selection.mode,
        sources: selection.sources,
      }

      if (selection.mode === 'knowledge-enhanced') {
        normalized.knowledge.question = rewrittenQuestion
        normalized.knowledge.sources = selection.sources
      } else {
        normalized.kind = 'plain'
        normalized.knowledge = null
        normalized.params = {
          ...normalized.params,
          history: normalized.params.history,
          userPrompt: buildGeneralAiPrompt(userPrompt, {
            systemInstruction: body.request?.knowledge?.systemPrompt,
            answerStyle: body.request?.knowledge?.answerStyle,
          }),
        }
      }
    }

    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildUpstreamMessages(normalized),
        stream: normalized.stream,
        temperature: normalized.params.temperature ?? 0.7,
        max_tokens: normalized.params.maxTokens,
        top_p: normalized.params.topP,
        presence_penalty: normalized.params.presencePenalty,
        frequency_penalty: normalized.params.frequencyPenalty,
      }),
    })

    if (normalized.stream) {
      if (!streamMeta) {
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            ...corsHeaders,
            'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        })
      }

      const encoder = new TextEncoder()
      const metaChunk = encoder.encode(`data: ${JSON.stringify(streamMeta)}\n\n`)
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(metaChunk)
          const reader = upstream.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) controller.enqueue(value)
            }
          } finally {
            controller.close()
          }
        },
      })

      return new Response(stream, {
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
