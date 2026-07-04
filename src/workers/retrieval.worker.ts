/**
 * 检索评分 Web Worker
 *
 * 承接两类主线程外的重计算：
 * - vector-matrix：查询向量 vs 打包矩阵（Float32Array，Transferable 零拷贝传入）
 *   的余弦相似度 topK（500 切片 × 1536 维时最重）
 * - keyword：中文 N-gram 分词 + 关键词命中评分
 *
 * 只依赖纯计算模块，禁止引入 supabase / DOM 相关代码。
 */
import {
  retrieveRelevantChunks,
  type RetrieveChunkInput,
  type RetrieveChunksOptions,
} from '../utils/retrieveChunks'
import { findTopSimilarChunks, findTopSimilarIndices } from '../utils/similarity'

export type RetrievalWorkerRequest =
  | {
      id: number
      type: 'keyword'
      question: string
      chunks: RetrieveChunkInput[]
      options?: RetrieveChunksOptions
    }
  | {
      id: number
      type: 'vector'
      queryEmbedding: number[]
      chunks: Array<{ item: unknown; embedding: number[] }>
      topK: number
      minSimilarity: number
    }
  | {
      id: number
      type: 'vector-matrix'
      queryEmbedding: Float32Array
      matrix: Float32Array
      dim: number
      topK: number
      minSimilarity: number
    }

export type RetrievalWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

function compute(request: RetrievalWorkerRequest): unknown {
  switch (request.type) {
    case 'keyword':
      return retrieveRelevantChunks(request.question, request.chunks, request.options)
    case 'vector':
      return findTopSimilarChunks(
        request.queryEmbedding,
        request.chunks,
        request.topK,
        request.minSimilarity,
      )
    case 'vector-matrix':
      return findTopSimilarIndices(
        request.queryEmbedding,
        request.matrix,
        request.dim,
        request.topK,
        request.minSimilarity,
      )
  }
}

self.addEventListener('message', (event: MessageEvent<RetrievalWorkerRequest>) => {
  const request = event.data

  try {
    const response: RetrievalWorkerResponse = { id: request.id, ok: true, result: compute(request) }
    self.postMessage(response)
  } catch (error) {
    const response: RetrievalWorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'retrieval worker failed',
    }
    self.postMessage(response)
  }
})
