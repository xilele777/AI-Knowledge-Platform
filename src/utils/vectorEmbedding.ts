import type { AiResolvedConfig } from './aiConfig'
import { invokeEdgeFunction } from './serverProxy'

// 纯计算部分位于 similarity.ts（与 Web Worker 共享），此处 re-export 保持旧引用兼容
export { cosineSimilarity, findTopSimilarChunks, type SimilarChunk } from './similarity'

export interface EmbeddingResult {
  embedding: number[]
}

type EmbeddingApiItem = {
  embedding?: unknown
  index?: number
}

type EmbeddingApiResponse = {
  data?: EmbeddingApiItem[]
  error?: {
    message?: string
  }
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

function normalizeEmbeddingResponse(payload: EmbeddingApiResponse, expectedCount: number): EmbeddingResult[] {
  const items = payload.data ?? []

  if (items.length < expectedCount) {
    throw new Error('Embedding API 返回数量不足')
  }

  const sortedItems = [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return sortedItems.slice(0, expectedCount).map((item) => {
    if (!isNumberArray(item.embedding)) {
      throw new Error('Embedding API 返回格式无效')
    }

    return {
      embedding: item.embedding,
    }
  })
}

async function requestEmbeddings(
  input: string | string[],
  _config: AiResolvedConfig,
): Promise<EmbeddingResult[]> {
  const payload = await invokeEdgeFunction<EmbeddingApiResponse>('ai-embeddings', {
    input,
  })
  return normalizeEmbeddingResponse(payload, Array.isArray(input) ? input.length : 1)
}

export async function createEmbedding(
  text: string,
  config: AiResolvedConfig,
): Promise<EmbeddingResult> {
  const results = await requestEmbeddings(text, config)
  return results[0]
}

export async function createBatchEmbeddings(
  texts: string[],
  config: AiResolvedConfig,
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) {
    return []
  }

  return requestEmbeddings(texts, config)
}

