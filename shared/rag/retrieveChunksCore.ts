export interface RetrieveChunkInput {
  id?: string | number
  content: string
  [key: string]: unknown
}

export type RetrievedChunk<T extends RetrieveChunkInput = RetrieveChunkInput> = T & {
  score: number
  hitCount: number
  matchedKeywords: string[]
}

export interface RetrieveChunksOptions {
  topK?: number
  minScore?: number
  keywordBoost?: number
  exactQuestionBoost?: number
}

export interface ChunkValueOptions {
  minTopScore?: number
  minHitCount?: number
  minAverageScore?: number
}

const CN_STOP_WORDS = new Set([
  '的', '了', '和', '是', '在', '与', '及', '对', '或', '并', '一个', '我们', '你', '我', '他', '她', '它',
  '这个', '那个', '这些', '那些', '如何', '什么', '为什么', '怎么',
])

const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'with', 'how', 'what', 'why', 'when',
])

function clampTopK(value: number): number {
  if (value < 3) return 3
  if (value > 5) return 5
  return value
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').trim()
}

function buildChineseNgrams(text: string, minN = 2, maxN = 4): string[] {
  const clean = text.replace(/[^一-龥]/g, '')
  const result: string[] = []

  for (let n = minN; n <= maxN; n += 1) {
    if (clean.length < n) continue
    for (let i = 0; i <= clean.length - n; i += 1) {
      result.push(clean.slice(i, i + n))
    }
  }

  return result
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  const latinAndNumeric = normalized.match(/[a-z0-9]{2,}/g) ?? []
  const chineseWords = normalized.match(/[一-龥]{2,}/g) ?? []
  const chineseNgrams = buildChineseNgrams(normalized)
  const tokens = [...latinAndNumeric, ...chineseWords, ...chineseNgrams]

  return tokens.filter((token) => {
    if (!token) return false
    if (/^[a-z0-9]+$/i.test(token)) {
      return !EN_STOP_WORDS.has(token)
    }
    return !CN_STOP_WORDS.has(token)
  })
}

function scoreChunk(
  question: string,
  questionKeywords: string[],
  chunk: RetrieveChunkInput,
  keywordBoost: number,
  exactQuestionBoost: number,
): RetrievedChunk {
  const content = String(chunk.content ?? '')
  const normalizedContent = normalizeText(content)

  if (!normalizedContent || questionKeywords.length === 0) {
    return { ...chunk, score: 0, hitCount: 0, matchedKeywords: [] }
  }

  const chunkKeywords = new Set(tokenize(normalizedContent))
  const matchedKeywords: string[] = []

  for (const keyword of questionKeywords) {
    if (chunkKeywords.has(keyword) || normalizedContent.includes(keyword)) {
      matchedKeywords.push(keyword)
    }
  }

  const hitCount = matchedKeywords.length
  const keywordScore = (hitCount / questionKeywords.length) * keywordBoost
  const exactMatchScore = question.length >= 6 && normalizedContent.includes(question) ? exactQuestionBoost : 0
  const lengthPenalty = 1 / Math.sqrt(Math.max(1, normalizedContent.length))
  const densityScore = hitCount * lengthPenalty
  const score = Number((keywordScore + exactMatchScore + densityScore).toFixed(6))

  return { ...chunk, score, hitCount, matchedKeywords }
}

export function retrieveRelevantChunks<T extends RetrieveChunkInput>(
  question: string,
  chunks: T[],
  options: RetrieveChunksOptions = {},
): RetrievedChunk<T>[] {
  const normalizedQuestion = normalizeText(question)
  const questionKeywords = Array.from(new Set(tokenize(normalizedQuestion)))

  if (!normalizedQuestion || chunks.length === 0) {
    return []
  }

  const topK = clampTopK(options.topK ?? 5)
  const minScore = Math.max(0, options.minScore ?? 0.02)
  const keywordBoost = options.keywordBoost ?? 0.75
  const exactQuestionBoost = options.exactQuestionBoost ?? 0.25

  const scored = chunks
    .map((chunk) => scoreChunk(normalizedQuestion, questionKeywords, chunk, keywordBoost, exactQuestionBoost))
    .filter((chunk) => chunk.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount
      return String(a.content).length - String(b.content).length
    })

  if (scored.length === 0) {
    return []
  }

  return scored.slice(0, Math.min(scored.length, topK)) as RetrievedChunk<T>[]
}

export function hasValuableRetrievedChunks<T extends RetrieveChunkInput>(
  chunks: RetrievedChunk<T>[],
  options: ChunkValueOptions = {},
): boolean {
  if (chunks.length === 0) return false

  const minTopScore = Math.max(0, options.minTopScore ?? 0.1)
  const minHitCount = Math.max(1, options.minHitCount ?? 2)
  const minAverageScore = Math.max(0, options.minAverageScore ?? 0.06)
  const top = chunks[0]
  const averageScore = chunks.reduce((total, item) => total + item.score, 0) / chunks.length

  return top.score >= minTopScore && top.hitCount >= minHitCount && averageScore >= minAverageScore
}
