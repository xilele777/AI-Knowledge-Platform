import type { AiResolvedConfig } from './aiConfig'

export interface EmbeddingResult {
  embedding: number[]
}

export interface SimilarChunk<T> {
  item: T
  embedding: number[]
  similarity: number
}

export async function createEmbedding(
  text: string,
  config: AiResolvedConfig,
): Promise<EmbeddingResult> {
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: config.model,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return {
    embedding: data.data[0].embedding,
  }
}

export async function createBatchEmbeddings(
  texts: string[],
  config: AiResolvedConfig,
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = []
  for (const text of texts) {
    const result = await createEmbedding(text, config)
    results.push(result)
  }
  return results
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
