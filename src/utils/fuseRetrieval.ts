/**
 * Reciprocal Rank Fusion（RRF）双路检索融合。
 *
 * 现状问题：向量与关键词检索是「二选一降级」——向量结果质量不达标才
 * 整体切换关键词，两路信号的强项（向量懂语义改述、关键词擅长专有名词
 * 精确匹配）无法互补。
 *
 * 为什么选 RRF 而不是分数线性加权：余弦相似度（0~1）与关键词密度分
 * （量纲自定义）不可直接比较，加权需要脆弱的归一化调参；RRF 只用
 * 「排名」，天然免归一化：score(d) = Σ 1/(k + rank_i(d))，k 取 60
 * （原论文经验值，抑制单路排名的微小抖动）。
 */
import type { RetrieveChunkInput, RetrievedChunk } from './retrieveChunks'

export interface RrfOptions {
  /** 平滑常数，越大各排名差距越平缓，默认 60 */
  k?: number
  /** 融合后保留条数，默认 5 */
  topK?: number
}

const DEFAULT_K = 60
const DEFAULT_TOP_K = 5

/**
 * 融合向量与关键词两路已排序（最优在前）的检索结果。
 *
 * 返回的 score 是归一化 RRF 分（除以「双路都排第一」的理论最大值，
 * 落在 0~1，双路第一 = 1.0），排序即融合排序；hitCount / matchedKeywords
 * 取关键词路的信号，两路字段合并后同时展示。
 */
export function fuseRetrievedChunks<T extends RetrieveChunkInput>(
  vectorList: Array<RetrievedChunk<T>>,
  keywordList: Array<RetrievedChunk<T>>,
  options: RrfOptions = {},
): Array<RetrievedChunk<T>> {
  const k = Math.max(1, options.k ?? DEFAULT_K)
  const topK = Math.max(1, options.topK ?? DEFAULT_TOP_K)

  if (!vectorList.length && !keywordList.length) {
    return []
  }

  interface FusedEntry {
    vector: RetrievedChunk<T> | null
    keyword: RetrievedChunk<T> | null
    rrfScore: number
    /** 用于并列分数时的稳定排序：更靠前的向量排名优先 */
    bestRank: number
  }

  const entries = new Map<string, FusedEntry>()

  function keyOf(chunk: RetrievedChunk<T>, fallbackRank: number, listTag: string): string {
    const id = chunk.id
    if (typeof id === 'string' && id) {
      return id
    }
    if (typeof id === 'number') {
      return String(id)
    }
    return `${listTag}-${fallbackRank}`
  }

  function accumulate(
    list: Array<RetrievedChunk<T>>,
    channel: 'vector' | 'keyword',
  ) {
    for (let rank = 1; rank <= list.length; rank += 1) {
      const chunk = list[rank - 1]
      const key = keyOf(chunk, rank, channel)
      const entry = entries.get(key) ?? {
        vector: null,
        keyword: null,
        rrfScore: 0,
        bestRank: Number.MAX_SAFE_INTEGER,
      }

      entry[channel] = chunk
      entry.rrfScore += 1 / (k + rank)
      entry.bestRank = Math.min(entry.bestRank, rank)
      entries.set(key, entry)
    }
  }

  accumulate(vectorList, 'vector')
  accumulate(keywordList, 'keyword')

  // 归一化基准：双路都排第一的理论最大 RRF 分
  const maxScore = 2 / (k + 1)

  return Array.from(entries.values())
    .sort((a, b) => b.rrfScore - a.rrfScore || a.bestRank - b.bestRank)
    .slice(0, topK)
    .map((entry) => {
      const base = entry.vector ?? entry.keyword
      // accumulate 保证 vector/keyword 至少一路存在
      const chunk = base as RetrievedChunk<T>
      return {
        ...chunk,
        score: entry.rrfScore / maxScore,
        hitCount: entry.keyword?.hitCount ?? 0,
        matchedKeywords: entry.keyword?.matchedKeywords ?? [],
      }
    })
}
