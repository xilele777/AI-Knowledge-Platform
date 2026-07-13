export type NumericVector = ArrayLike<number>

export interface SimilarChunk<T> {
  item: T
  embedding: number[]
  similarity: number
}

export interface SimilarityHit {
  index: number
  similarity: number
}

export function cosineSimilarity(vecA: NumericVector, vecB: NumericVector): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i += 1) {
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
  topK = 5,
  minSimilarity = 0,
): SimilarChunk<T>[] {
  return chunks
    .filter(({ embedding }) => embedding.length === queryEmbedding.length)
    .map(({ item, embedding }) => ({
      item,
      embedding,
      similarity: cosineSimilarity(queryEmbedding, embedding),
    }))
    .filter((chunk) => chunk.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}

export function packEmbeddingMatrix(embeddings: NumericVector[], dim: number): Float32Array {
  const matrix = new Float32Array(embeddings.length * dim)

  for (let row = 0; row < embeddings.length; row += 1) {
    const embedding = embeddings[row]
    if (embedding.length !== dim) continue

    const offset = row * dim
    for (let i = 0; i < dim; i += 1) {
      matrix[offset + i] = embedding[i]
    }
  }

  return matrix
}

export function findTopSimilarIndices(
  queryEmbedding: NumericVector,
  matrix: Float32Array,
  dim: number,
  topK = 5,
  minSimilarity = 0,
): SimilarityHit[] {
  if (dim <= 0 || queryEmbedding.length !== dim || matrix.length % dim !== 0) {
    return []
  }

  let queryNorm = 0
  for (let i = 0; i < dim; i += 1) {
    queryNorm += queryEmbedding[i] * queryEmbedding[i]
  }
  queryNorm = Math.sqrt(queryNorm)

  if (queryNorm === 0) {
    return []
  }

  const rowCount = matrix.length / dim
  const hits: SimilarityHit[] = []

  for (let row = 0; row < rowCount; row += 1) {
    const offset = row * dim
    let dotProduct = 0
    let rowNorm = 0

    for (let i = 0; i < dim; i += 1) {
      const value = matrix[offset + i]
      dotProduct += queryEmbedding[i] * value
      rowNorm += value * value
    }

    if (rowNorm === 0) continue

    const similarity = dotProduct / (queryNorm * Math.sqrt(rowNorm))
    if (similarity >= minSimilarity) {
      hits.push({ index: row, similarity })
    }
  }

  return hits.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
