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
export {
  cosineSimilarity,
  findTopSimilarChunks,
  findTopSimilarIndices,
  packEmbeddingMatrix,
  type NumericVector,
  type SimilarChunk,
  type SimilarityHit,
} from '../../shared/rag/similarityCore'
