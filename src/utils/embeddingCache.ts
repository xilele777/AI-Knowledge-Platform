/**
 * 知识切片向量的 IndexedDB 缓存层
 *
 * 背景：QA 检索需要全量切片（含 1536 维 embedding），每次提问都从服务端
 * 拉取 500 × 1536 个浮点数（约 3MB+ JSON）不可接受。
 *
 * 失效策略：知识切片行是不可变的（embedding 在插入前生成，之后只会整批删除、
 * 从不 update），因此「服务端 id 集合 vs 本地缓存 id 集合」的 diff 即可保证一致性：
 * - 服务端有、缓存没有 → 增量拉取
 * - 缓存有、服务端没有 → 本地淘汰
 *
 * embedding 以 Float32Array 存储（IndexedDB 原生支持 TypedArray），
 * 相比 JSON number[] 体积约 -75%，且免去解析成本。
 *
 * 所有操作静默容错：IndexedDB 不可用（隐私模式、旧浏览器、配额溢出）时
 * 返回 null / 空操作，调用方退回全量拉取，可用性优先。
 */
import type { KnowledgeChunkForQa } from '../types/chat'

/** 缓存的切片记录：不含 sourceName（文件名/文档标题可变，每次调用时新鲜解析） */
export type CachedKnowledgeChunk = Omit<KnowledgeChunkForQa, 'sourceName'>

const DB_NAME = 'ai-kb-cache'
const DB_VERSION = 1
const CHUNK_STORE = 'knowledge_chunks'
const KB_INDEX = 'byKnowledgeBase'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const store = db.createObjectStore(CHUNK_STORE, { keyPath: 'id' })
          store.createIndex(KB_INDEX, 'knowledgeBaseId', { unique: false })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return dbPromise
}

/**
 * 读取某知识库下的全部缓存切片。
 * 返回 null 表示缓存层不可用（调用方应全量拉取），[] 表示缓存为空。
 */
export async function loadCachedChunks(
  knowledgeBaseId: string,
): Promise<CachedKnowledgeChunk[] | null> {
  const db = await openDb()
  if (!db) {
    return null
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHUNK_STORE, 'readonly')
      const index = tx.objectStore(CHUNK_STORE).index(KB_INDEX)
      const request = index.getAll(IDBKeyRange.only(knowledgeBaseId))

      request.onsuccess = () => resolve((request.result ?? []) as CachedKnowledgeChunk[])
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** 批量写入切片缓存（单事务），失败静默忽略 */
export async function saveCachedChunks(chunks: CachedKnowledgeChunk[]): Promise<void> {
  if (!chunks.length) {
    return
  }

  const db = await openDb()
  if (!db) {
    return
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CHUNK_STORE, 'readwrite')
      const store = tx.objectStore(CHUNK_STORE)
      for (const chunk of chunks) {
        store.put(chunk)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** 淘汰已在服务端删除的切片 */
export async function deleteCachedChunks(ids: string[]): Promise<void> {
  if (!ids.length) {
    return
  }

  const db = await openDb()
  if (!db) {
    return
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CHUNK_STORE, 'readwrite')
      const store = tx.objectStore(CHUNK_STORE)
      for (const id of ids) {
        store.delete(id)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

export interface ChunkIdDiff {
  /** 服务端存在但本地缓存缺失，需要增量拉取 */
  missingIds: string[]
  /** 本地缓存存在但服务端已删除，需要本地淘汰 */
  staleIds: string[]
}

/** 纯函数：服务端 id 集合 vs 缓存 id 集合的双向 diff */
export function diffChunkIds(serverIds: string[], cachedIds: Iterable<string>): ChunkIdDiff {
  const serverSet = new Set(serverIds)
  const cachedSet = new Set(cachedIds)

  const missingIds = serverIds.filter((id) => !cachedSet.has(id))
  const staleIds: string[] = []

  for (const id of cachedSet) {
    if (!serverSet.has(id)) {
      staleIds.push(id)
    }
  }

  return { missingIds, staleIds }
}
