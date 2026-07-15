import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveUserAiConfig } from '../_shared/aiConfig.ts'
import {
  buildGeneralAiPrompt,
  buildUpstreamMessages,
  normalizeAiChatRequest,
  type ChatRequestBody,
} from '../_shared/aiPrompt.ts'
import { loadKnowledgeChunksForQa, createQueryEmbedding } from '../_shared/ragChunks.ts'
import { selectKnowledgeSources } from '../_shared/ragRetrieval.ts'
import { rewriteQuestionForServerRetrieval } from '../_shared/ragRewrite.ts'

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
    let normalized = normalizeAiChatRequest(body)
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
      const knowledge = normalized.knowledge
      const rewrittenQuestion = await rewriteQuestionForServerRetrieval(
        knowledge.question,
        knowledge.history,
        config,
      )
      const chunks = await loadKnowledgeChunksForQa(authHeader, knowledge.knowledgeBaseId, 500)
      const queryEmbedding = chunks.length ? await createQueryEmbedding(authHeader, rewrittenQuestion) : null
      const selection = await selectKnowledgeSources({
        authHeader,
        knowledgeBaseId: knowledge.knowledgeBaseId,
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
        normalized = {
          ...normalized,
          knowledge: {
            ...knowledge,
            question: rewrittenQuestion,
            sources: selection.sources,
          },
        }
      } else {
        normalized = {
          ...normalized,
          kind: 'plain',
          knowledge: null,
          params: {
            ...normalized.params,
            history: normalized.params.history,
            userPrompt: buildGeneralAiPrompt(userPrompt, {
              systemInstruction: knowledge.systemPrompt,
              answerStyle: knowledge.answerStyle,
            }),
          },
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
