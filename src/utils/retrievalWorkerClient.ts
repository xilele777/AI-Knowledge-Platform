/**
 * 检索 Worker 的主线程客户端
 *
 * - 懒加载单例 Worker，首次调用才创建
 * - 基于自增 id 的请求/响应关联，支持并发调用
 * - Worker 不可用（旧浏览器、构建异常）或单次调用失败时，自动降级为主线程同步计算，
 *   保证功能可用性优先于性能收益
 */
import {
  retrieveRelevantChunks,
  type RetrieveChunkInput,
  type RetrieveChunksOptions,
  type RetrievedChunk,
} from './retrieveChunks'
import {
  findTopSimilarChunks,
  findTopSimilarIndices,
  packEmbeddingMatrix,
  type SimilarChunk,
  type SimilarityHit,
} from './similarity'
import type {
  RetrievalWorkerRequest,
  RetrievalWorkerResponse,
} from '../workers/retrieval.worker'

type PendingEntry = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

let worker: Worker | null = null
let workerBroken = false
let requestSeq = 0
const pending = new Map<number, PendingEntry>()

function rejectAllPending(reason: string) {
  for (const entry of pending.values()) {
    entry.reject(new Error(reason))
  }
  pending.clear()
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') {
    return null
  }

  if (worker) {
    return worker
  }

  try {
    worker = new Worker(new URL('../workers/retrieval.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('message', (event: MessageEvent<RetrievalWorkerResponse>) => {
      const response = event.data
      const entry = pending.get(response.id)
      if (!entry) {
        return
      }

      pending.delete(response.id)
      if (response.ok) {
        entry.resolve(response.result)
      } else {
        entry.reject(new Error(response.error))
      }
    })

    worker.addEventListener('error', () => {
      // Worker 脚本级错误：标记不可用并让所有在途请求走降级路径
      workerBroken = true
      rejectAllPending('retrieval worker crashed')
      worker?.terminate()
      worker = null
    })

    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** Omit 直接作用于联合类型会坍缩为公共属性，需要分配式版本 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

function postToWorker(
  request: DistributiveOmit<RetrievalWorkerRequest, 'id'>,
  transfer: Transferable[] = [],
): Promise<unknown> | null {
  const instance = getWorker()
  if (!instance) {
    return null
  }

  requestSeq += 1
  const id = requestSeq

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    instance.postMessage({ ...request, id }, transfer)
  })
}

/** 关键词检索（Worker 优先，失败降级主线程） */
export async function retrieveRelevantChunksAsync<T extends RetrieveChunkInput>(
  question: string,
  chunks: T[],
  options: RetrieveChunksOptions = {},
): Promise<RetrievedChunk<T>[]> {
  const task = postToWorker({ type: 'keyword', question, chunks, options })

  if (task) {
    try {
      return (await task) as RetrievedChunk<T>[]
    } catch (error) {
      console.warn('[retrievalWorker] keyword scoring fallback to main thread:', error)
    }
  }

  return retrieveRelevantChunks(question, chunks, options)
}

/** 向量相似度 topK（Worker 优先，失败降级主线程） */
export async function findTopSimilarChunksAsync<T>(
  queryEmbedding: number[],
  chunks: Array<{ item: T; embedding: number[] }>,
  topK: number = 5,
  minSimilarity: number = 0.0,
): Promise<SimilarChunk<T>[]> {
  const task = postToWorker({ type: 'vector', queryEmbedding, chunks, topK, minSimilarity })

  if (task) {
    try {
      return (await task) as SimilarChunk<T>[]
    } catch (error) {
      console.warn('[retrievalWorker] vector scoring fallback to main thread:', error)
    }
  }

  return findTopSimilarChunks(queryEmbedding, chunks, topK, minSimilarity)
}

/**
 * 打包矩阵版向量检索（Worker 优先，失败降级主线程）。
 *
 * 将全部切片向量 memcpy 进一个连续 Float32Array，postMessage 时 transfer
 * 其 ArrayBuffer 实现零拷贝移交——相比结构化克隆 n 个 number[]，跨线程
 * 传输成本从 O(数据量) 降为 O(1)。
 *
 * 源 embeddings（来自 IndexedDB 缓存）不会被 detach：矩阵是打包副本，
 * transfer 后源数据仍完整，Worker 失败时可在主线程重建矩阵同步计算。
 * 返回的 index 对应调用方传入 embeddings 数组的下标。
 */
export async function findTopSimilarIndicesAsync(
  queryEmbedding: Float32Array,
  embeddings: ArrayLike<number>[],
  topK: number = 5,
  minSimilarity: number = 0.0,
): Promise<SimilarityHit[]> {
  const dim = queryEmbedding.length
  if (dim === 0 || embeddings.length === 0) {
    return []
  }

  const matrix = packEmbeddingMatrix(embeddings, dim)
  // 只 transfer 大头（矩阵，n × dim × 4 字节）；查询向量仅 dim × 4 字节，
  // 结构化克隆的成本可忽略，且保证调用方持有的原向量不被 detach。
  const task = postToWorker(
    {
      type: 'vector-matrix',
      queryEmbedding,
      matrix,
      dim,
      topK,
      minSimilarity,
    },
    [matrix.buffer],
  )

  if (task) {
    try {
      return (await task) as SimilarityHit[]
    } catch (error) {
      console.warn('[retrievalWorker] matrix scoring fallback to main thread:', error)
    }
  }

  // 降级：matrix 可能已被 transfer detach，从源 embeddings 重新打包
  return findTopSimilarIndices(
    queryEmbedding,
    packEmbeddingMatrix(embeddings, dim),
    dim,
    topK,
    minSimilarity,
  )
}
