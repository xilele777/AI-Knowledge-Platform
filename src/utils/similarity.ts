/**
 * 向量相似度纯计算模块。
 *
 * 独立成文件的原因：需要同时被主线程与 retrieval Web Worker 引用，
 * 不能携带任何 supabase / DOM 依赖。
 *
 * 支持两种数据形态：
 * - 对象数组（number[] embedding）：兼容旧调用
 * - 打包矩阵（单个 Float32Array，行优先存储 n × dim）：配合 postMessage
 *   Transferable 零拷贝移交 Worker，避免结构化克隆 n 个数组的开销
 */

/** 余弦相似度接受任意数值序列（number[] / Float32Array 通用） */
export type NumericVector = ArrayLike<number>

export interface SimilarChunk<T> {
  item: T
  embedding: number[]
  similarity: number
}

export interface SimilarityHit {
  /** 输入 embedding 列表中的下标 */
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

/**
 * 将 n 条 dim 维向量打包为一个行优先连续矩阵。
 * 单次 memcpy 的成本换来：跨线程传输时只需 transfer 一个 ArrayBuffer。
 * 维度不等于 dim 的向量会被跳过（对应行全 0，相似度为 0，天然沉底）。
 */
export function packEmbeddingMatrix(embeddings: NumericVector[], dim: number): Float32Array {
  const matrix = new Float32Array(embeddings.length * dim)

  for (let row = 0; row < embeddings.length; row += 1) {
    const embedding = embeddings[row]
    if (embedding.length !== dim) {
      continue
    }

    const offset = row * dim
    for (let i = 0; i < dim; i += 1) {
      matrix[offset + i] = embedding[i]
    }
  }

  return matrix
}

/**
 * 在打包矩阵上计算查询向量与每行的余弦相似度，返回 topK 的行号与得分。
 * 查询向量的范数只计算一次；全 0 行（打包时维度不符被跳过的）得分为 0。
 */
export function findTopSimilarIndices(
  queryEmbedding: NumericVector,
  matrix: Float32Array,
  dim: number,
  topK: number = 5,
  minSimilarity: number = 0.0,
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

    if (rowNorm === 0) {
      continue
    }

    const similarity = dotProduct / (queryNorm * Math.sqrt(rowNorm))
    if (similarity >= minSimilarity) {
      hits.push({ index: row, similarity })
    }
  }

  return hits.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
