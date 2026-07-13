import type { RetrieveChunkInput, RetrievedChunk } from './retrieveChunksCore.ts'

export interface RrfOptions {
  k?: number
  topK?: number
}

const DEFAULT_K = 60
const DEFAULT_TOP_K = 5

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
    bestRank: number
  }

  const entries = new Map<string, FusedEntry>()

  function keyOf(chunk: RetrievedChunk<T>, fallbackRank: number, listTag: string): string {
    const id = chunk.id
    if (typeof id === 'string' && id) return id
    if (typeof id === 'number') return String(id)
    return `${listTag}-${fallbackRank}`
  }

  function accumulate(list: Array<RetrievedChunk<T>>, channel: 'vector' | 'keyword') {
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

  const maxScore = 2 / (k + 1)

  return Array.from(entries.values())
    .sort((a, b) => b.rrfScore - a.rrfScore || a.bestRank - b.bestRank)
    .slice(0, topK)
    .map((entry) => {
      const base = entry.vector ?? entry.keyword
      const chunk = base as RetrievedChunk<T>
      return {
        ...chunk,
        score: entry.rrfScore / maxScore,
        hitCount: entry.keyword?.hitCount ?? 0,
        matchedKeywords: entry.keyword?.matchedKeywords ?? [],
      }
    })
}
