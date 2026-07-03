import type { AiResolvedConfig } from './aiConfig'
import { invokeEdgeFunction } from './serverProxy'

export interface EmbeddingResult {
  embedding: number[]
}

export interface SimilarChunk<T> {
  item: T
  embedding: number[]
  similarity: number
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
  config: AiResolvedConfig,
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

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function findTopSimilarChunks<T>(
  queryEmbedding: number[],
  chunks: Array<{ item: T; embedding: number[] }>,
  topK: number = 5,
  minSimilarity: number = 0.0,
): SimilarChunk<T>[] {
  const results = chunks
    .filter(({ embedding }) => embedding.length === queryEmbedding.length)
    .map(({ item, embedding }) => ({
      item,
      embedding,
      similarity: cosineSimilarity(queryEmbedding, embedding),
    }))
    .filter((chunk) => chunk.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)

  return results
}
