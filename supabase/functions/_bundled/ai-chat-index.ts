// ============================================================================
// ai-chat Edge Function — 单文件内联版（用于 Supabase Dashboard 在线部署）
//
// Dashboard 部署只上传 index.ts 本身，不包含 ../_shared 目录，
// 因此本文件把以下模块全部内联，逻辑与仓库源码保持一致：
//   - supabase/functions/_shared/cors.ts
//   - supabase/functions/_shared/aiConfig.ts
//   - supabase/functions/_shared/aiPrompt.ts
//   - supabase/functions/_shared/ragChunks.ts
//   - supabase/functions/_shared/ragRetrieval.ts
//   - supabase/functions/_shared/ragRewrite.ts
//   - shared/aiConfigCore.ts
//   - shared/rag/similarityCore.ts
//   - shared/rag/retrieveChunksCore.ts
//   - shared/rag/fuseRetrievalCore.ts
//
// 注意：仓库内上述源文件才是唯一真源；改动逻辑后需重新同步本文件。
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'

// ========== cors.ts ==========

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

// ========== shared/aiConfigCore.ts ==========

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = (value || DEFAULT_BASE_URL).trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function resolveDefaultModel(model: string | null | undefined): string {
  return (model || DEFAULT_MODEL).trim()
}

// ========== _shared/aiConfig.ts ==========

type SystemAiConfigRow = {
  embedding_base_url: string | null
  embedding_api_key: string | null
  embedding_model: string | null
}

type UserAiConfigRow = {
  api_base_url: string | null
  api_key: string | null
  model: string | null
}

type AiResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

async function resolveUserAiConfig(authHeader: string): Promise<AiResolvedConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError || !userResult.user) {
    throw new Error('Unauthorized')
  }

  const { data, error } = await client
    .from('user_ai_config')
    .select('api_base_url, api_key, model')
    .eq('user_id', userResult.user.id)
    .maybeSingle<UserAiConfigRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.api_key) {
    throw new Error('请先在个人中心配置您的 AI API Key')
  }

  return {
    baseUrl: normalizeBaseUrl(data.api_base_url),
    apiKey: data.api_key.trim(),
    model: resolveDefaultModel(data.model),
  }
}

type EmbeddingResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

// The embedding API is platform-level (configured once by an admin): all stored
// vectors must come from the same model, so it is never resolved per-user.
// RLS blocks normal users from this table, hence the service role client.
async function resolveSystemEmbeddingConfig(): Promise<EmbeddingResolvedConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  const client = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await client
    .from('system_ai_config')
    .select('embedding_base_url, embedding_api_key, embedding_model')
    .eq('id', 1)
    .maybeSingle<SystemAiConfigRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.embedding_api_key) {
    throw new Error('系统向量 API 尚未配置，请联系管理员在个人中心完成配置')
  }

  return {
    baseUrl: normalizeBaseUrl(data.embedding_base_url),
    apiKey: data.embedding_api_key.trim(),
    model: data.embedding_model?.trim() || DEFAULT_EMBEDDING_MODEL,
  }
}

// ========== _shared/aiPrompt.ts ==========

type AiChatHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AiChatSourceChunk = {
  chunkId: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number | null
  content: string
  score: number
  matchedKeywords: string[]
}

type AiGenerateTextParams = {
  systemPrompt?: string
  userPrompt?: string
  history?: AiChatHistoryMessage[]
  temperature?: number
  maxTokens?: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

type AiChatRequestKind = 'plain' | 'knowledge-enhanced'

type AiChatKnowledgePayload = {
  knowledgeBaseId?: string
  question?: string
  history?: AiChatHistoryMessage[]
  systemPrompt?: string
  answerStyle?: string
  sources?: AiChatSourceChunk[]
}

type AiChatRequestPayload = {
  kind?: AiChatRequestKind
  params?: AiGenerateTextParams
  knowledge?: AiChatKnowledgePayload
}

type ChatRequestBody = {
  request?: AiChatRequestPayload
  params?: AiGenerateTextParams
  stream?: boolean
}

type AiChatNormalizedRequest = {
  kind: AiChatRequestKind
  params: AiGenerateTextParams
  stream: boolean
  knowledge: {
    knowledgeBaseId?: string
    question: string
    history: AiChatHistoryMessage[]
    systemPrompt?: string
    answerStyle?: string
    sources: AiChatSourceChunk[]
  } | null
}

const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_TOTAL_CHARS = 24000
const DEFAULT_MAX_CHUNK_CHARS = 1200

function sanitizeHistory(history: AiChatHistoryMessage[] | undefined): AiChatHistoryMessage[] {
  const items = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : []
  const messages: AiChatHistoryMessage[] = []
  let totalChars = 0

  for (const item of items) {
    const role = item?.role
    const content = typeof item?.content === 'string' ? item.content.trim() : ''

    if ((role !== 'user' && role !== 'assistant') || !content) {
      continue
    }

    totalChars += content.length
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) {
      break
    }

    messages.push({ role, content })
  }

  return messages
}

function trimChunkContent(content: string, maxChunkChars: number): string {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  if (normalized.length <= maxChunkChars) {
    return normalized
  }

  return normalized.slice(0, maxChunkChars) + '...'
}

function formatChunkBlock(chunk: AiChatSourceChunk, index: number, maxChunkChars: number): string {
  const sourceType = chunk.sourceType === 'document' ? '文档' : '文件'
  const sourceName =
    typeof chunk.sourceName === 'string' && chunk.sourceName
      ? chunk.sourceName
      : chunk.sourceType === 'document'
        ? chunk.documentId || '-'
        : chunk.fileId || '-'
  const scoreText = Number.isFinite(chunk.score) ? `\n相关度: ${chunk.score.toFixed(4)}` : ''
  const keywordsText =
    Array.isArray(chunk.matchedKeywords) && chunk.matchedKeywords.length > 0
      ? `\n命中关键词: ${chunk.matchedKeywords.slice(0, 8).join('、')}`
      : ''

  return [
    `【片段 ${String(index + 1)}】`,
    `ID: ${chunk.chunkId}\n来源: ${sourceType} / ${sourceName}${scoreText}${keywordsText}`,
    trimChunkContent(String(chunk.content ?? ''), maxChunkChars),
  ].join('\n')
}

function resolveKnowledgeEnhancedSystemInstruction(input?: string): string {
  if (input?.trim()) {
    return input.trim()
  }

  return [
    '你是智能问答助手。',
    '请优先结合给定参考资料回答用户问题。',
    '如果参考资料不足，可以结合通用知识进行补充，但要明确哪些结论来自参考资料。',
    '如果参考资料与通用知识存在差异，优先说明参考资料中的内容，并简要提示差异点。',
    '回答要自然、结构化、清晰，不要输出与问题无关的信息。',
  ].join('')
}

function resolveKnowledgeEnhancedAnswerStyle(input?: string): string {
  if (input?.trim()) {
    return input.trim()
  }

  return '先给出结论，再给关键依据；必要时使用 1-4 条要点，最后给出“参考片段: [片段x,片段y]”（若有）。'
}

function resolveGeneralAiSystemInstruction(input?: string): string {
  if (input?.trim()) {
    return input.trim()
  }

  return [
    '你是智能问答助手。',
    '当前没有可用参考资料，请直接基于通用知识提供高质量回答。',
    '回答要准确、清晰、结构化，避免空泛描述。',
    '如存在不确定性，请明确说明前提或适用范围。',
  ].join('')
}

function resolveGeneralAiAnswerStyle(input?: string): string {
  if (input?.trim()) {
    return input.trim()
  }

  return '优先给出可执行结论，再补充原因或步骤；必要时使用简短要点，语言自然。'
}

function buildGeneralAiPrompt(
  question: string,
  options: { systemInstruction?: string; answerStyle?: string } = {},
): string {
  return [
    '【系统指令】',
    resolveGeneralAiSystemInstruction(options.systemInstruction),
    '',
    '【回答风格要求】',
    resolveGeneralAiAnswerStyle(options.answerStyle),
    '',
    '【用户问题】',
    question.trim(),
    '',
    '【输出要求】',
    '1. 直接回答问题，提供清晰结构。',
    '2. 若问题信息不足，先给常见假设并提示用户补充关键信息。',
  ].join('\n')
}

function buildKnowledgeEnhancedPrompt(
  question: string,
  chunks: AiChatSourceChunk[],
  options: { systemInstruction?: string; answerStyle?: string; maxChunkChars?: number } = {},
): string {
  const maxChunkChars = Math.max(200, options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS)
  const chunkBlocks = chunks.length
    ? chunks.map((chunk, index) => formatChunkBlock(chunk, index, maxChunkChars)).join('\n\n')
    : '未检索到可用参考资料。'

  return [
    '【系统指令】',
    resolveKnowledgeEnhancedSystemInstruction(options.systemInstruction),
    '',
    '【回答风格要求】',
    resolveKnowledgeEnhancedAnswerStyle(options.answerStyle),
    '',
    '【用户问题】',
    question.trim(),
    '',
    '【参考资料】',
    chunkBlocks,
    '',
    '【输出要求】',
    '1. 优先使用参考资料中的信息作答。',
    '2. 参考资料不足时，可结合通用知识补充，并保证逻辑自洽。',
    '3. 如参考资料与通用知识不一致，优先说明参考资料中的内容。',
    '4. 若使用了参考资料，末尾补充“参考片段: [片段x,片段y]”。',
  ].join('\n')
}

function buildPlainMessages(params: AiGenerateTextParams) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  if (params.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: params.systemPrompt.trim() })
  }

  messages.push(...sanitizeHistory(params.history))
  messages.push({ role: 'user', content: params.userPrompt?.trim() || '' })
  return messages
}

function normalizeAiChatRequest(body: ChatRequestBody): AiChatNormalizedRequest {
  const requestKind = body.request?.kind
  const kind: AiChatRequestKind =
    requestKind === 'knowledge-enhanced' ? 'knowledge-enhanced' : 'plain'
  const params = body.request?.params || body.params || {}
  const knowledge = body.request?.knowledge

  if (kind !== 'knowledge-enhanced' || !knowledge?.question?.trim()) {
    return {
      kind: 'plain',
      params,
      stream: body.stream === true,
      knowledge: null,
    }
  }

  return {
    kind,
    params,
    stream: body.stream === true,
    knowledge: {
      knowledgeBaseId: knowledge.knowledgeBaseId?.trim() || undefined,
      question: knowledge.question.trim(),
      history: sanitizeHistory(knowledge.history),
      systemPrompt: knowledge.systemPrompt?.trim() || undefined,
      answerStyle: knowledge.answerStyle?.trim() || undefined,
      sources: Array.isArray(knowledge.sources) ? knowledge.sources.filter((item) => {
        return Boolean(item && typeof item.chunkId === 'string' && typeof item.content === 'string')
      }) : [],
    },
  }
}

function buildUpstreamMessages(input: AiChatNormalizedRequest) {
  if (input.kind === 'knowledge-enhanced' && input.knowledge) {
    const prompt = buildKnowledgeEnhancedPrompt(input.knowledge.question, input.knowledge.sources, {
      systemInstruction: input.knowledge.systemPrompt,
      answerStyle: input.knowledge.answerStyle,
    })

    return buildPlainMessages({
      ...input.params,
      history: input.knowledge.history,
      userPrompt: prompt,
    })
  }

  return buildPlainMessages(input.params)
}

// ========== shared/rag/similarityCore.ts ==========

type NumericVector = ArrayLike<number>

function cosineSimilarity(vecA: NumericVector, vecB: NumericVector): number {
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

// ========== shared/rag/retrieveChunksCore.ts ==========

interface RetrieveChunkInput {
  id?: string | number
  content: string
  [key: string]: unknown
}

type RetrievedChunk<T extends RetrieveChunkInput = RetrieveChunkInput> = T & {
  score: number
  hitCount: number
  matchedKeywords: string[]
}

interface RetrieveChunksOptions {
  topK?: number
  minScore?: number
  keywordBoost?: number
  exactQuestionBoost?: number
}

interface ChunkValueOptions {
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

function retrieveRelevantChunks<T extends RetrieveChunkInput>(
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

function hasValuableRetrievedChunks<T extends RetrieveChunkInput>(
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

// ========== shared/rag/fuseRetrievalCore.ts ==========

interface RrfOptions {
  k?: number
  topK?: number
}

const RRF_DEFAULT_K = 60
const RRF_DEFAULT_TOP_K = 5

function fuseRetrievedChunks<T extends RetrieveChunkInput>(
  vectorList: Array<RetrievedChunk<T>>,
  keywordList: Array<RetrievedChunk<T>>,
  options: RrfOptions = {},
): Array<RetrievedChunk<T>> {
  const k = Math.max(1, options.k ?? RRF_DEFAULT_K)
  const topK = Math.max(1, options.topK ?? RRF_DEFAULT_TOP_K)

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

// ========== _shared/ragChunks.ts ==========

type ChunkRow = {
  id: string
  knowledge_base_id: string
  file_id: string | null
  document_id: string | null
  source_type: 'file' | 'document' | null
  chunk_index: number
  content: string
  token_count: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  embedding_vector?: string | null
  created_at: string
}

type KnowledgeFileNameRow = {
  id: string
  file_name: string
}

type DocumentTitleRow = {
  id: string
  title: string
}

type RagChunk = {
  id: string
  knowledgeBaseId: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
  content: string
  tokenCount: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  embeddingVector?: string | null
  createdAt: string
}

const QA_CHUNK_SELECT =
  'id, knowledge_base_id, file_id, document_id, source_type, chunk_index, content, token_count, meta, embedding, embedding_vector, created_at'

function toPgvectorLiteral(value: number[]): string {
  return `[${value.join(',')}]`
}

function createAuthedClient(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })
}

async function requireUserId(authHeader: string): Promise<{ client: ReturnType<typeof createAuthedClient>; userId: string }> {
  const client = createAuthedClient(authHeader)
  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError || !userResult.user) {
    throw new Error('Unauthorized')
  }

  return { client, userId: userResult.user.id }
}

async function resolveSourceNameMaps(
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
  chunks: Array<{ fileId: string | null; documentId: string | null }>,
): Promise<{ fileNameMap: Map<string, string>; documentTitleMap: Map<string, string> }> {
  const fileIds = Array.from(
    new Set(chunks.map((item) => item.fileId).filter((item): item is string => Boolean(item))),
  )
  const documentIds = Array.from(
    new Set(chunks.map((item) => item.documentId).filter((item): item is string => Boolean(item))),
  )

  const [filesResult, documentsResult] = await Promise.all([
    fileIds.length
      ? client
          .from('knowledge_files')
          .select('id, file_name')
          .eq('owner_id', userId)
          .in('id', fileIds)
          .returns<KnowledgeFileNameRow[]>()
      : Promise.resolve({ data: [] as KnowledgeFileNameRow[], error: null }),
    documentIds.length
      ? client
          .from('documents')
          .select('id, title')
          .eq('owner_id', userId)
          .in('id', documentIds)
          .returns<DocumentTitleRow[]>()
      : Promise.resolve({ data: [] as DocumentTitleRow[], error: null }),
  ])

  if (filesResult.error) {
    throw new Error(filesResult.error.message)
  }

  if (documentsResult.error) {
    throw new Error(documentsResult.error.message)
  }

  return {
    fileNameMap: new Map((filesResult.data ?? []).map((item) => [item.id, item.file_name])),
    documentTitleMap: new Map((documentsResult.data ?? []).map((item) => [item.id, item.title])),
  }
}

function toRagChunk(
  row: ChunkRow,
  fileNameMap: Map<string, string>,
  documentTitleMap: Map<string, string>,
): RagChunk {
  const sourceType = row.source_type === 'document' || row.document_id ? 'document' : 'file'
  const sourceName =
    sourceType === 'document'
      ? row.document_id
        ? documentTitleMap.get(row.document_id) ?? null
        : null
      : row.file_id
        ? fileNameMap.get(row.file_id) ?? null
        : null

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    fileId: row.file_id,
    documentId: row.document_id,
    sourceType,
    sourceName,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    meta: row.meta,
    embedding: Array.isArray(row.embedding) ? row.embedding : null,
    embeddingVector: typeof row.embedding_vector === 'string' ? row.embedding_vector : null,
    createdAt: row.created_at,
  }
}

async function loadKnowledgeChunksForQa(
  authHeader: string,
  knowledgeBaseId: string,
  limit = 500,
): Promise<RagChunk[]> {
  const { client, userId } = await requireUserId(authHeader)

  const { data, error } = await client
    .from('knowledge_chunks')
    .select(QA_CHUNK_SELECT)
    .eq('owner_id', userId)
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('chunk_index', { ascending: true })
    .limit(limit)
    .returns<ChunkRow[]>()

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  const { fileNameMap, documentTitleMap } = await resolveSourceNameMaps(
    client,
    userId,
    rows.map((row) => ({ fileId: row.file_id, documentId: row.document_id })),
  )

  return rows.map((row) => toRagChunk(row, fileNameMap, documentTitleMap))
}

type RagVectorMatchRow = {
  id: string
  knowledge_base_id: string
  file_id: string | null
  document_id: string | null
  source_type: 'file' | 'document' | null
  chunk_index: number
  content: string
  token_count: number | null
  meta: Record<string, unknown> | null
  created_at: string
  score: number
}

async function matchKnowledgeChunksByVector(
  authHeader: string,
  knowledgeBaseId: string,
  queryEmbedding: number[],
  limit = 8,
): Promise<Array<RagChunk & { score: number }>> {
  const { client, userId } = await requireUserId(authHeader)

  const { data, error } = await client.rpc('match_knowledge_chunks', {
    p_knowledge_base_id: knowledgeBaseId,
    p_query_embedding: toPgvectorLiteral(queryEmbedding),
    p_match_count: limit,
  }) as { data: RagVectorMatchRow[] | null; error: { message: string } | null }

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  const { fileNameMap, documentTitleMap } = await resolveSourceNameMaps(
    client,
    userId,
    rows.map((row) => ({ fileId: row.file_id, documentId: row.document_id })),
  )

  return rows.map((row) => ({
    ...toRagChunk(
      {
        ...row,
        embedding: null,
        embedding_vector: null,
      },
      fileNameMap,
      documentTitleMap,
    ),
    score: row.score,
  }))
}

async function createQueryEmbedding(_authHeader: string, question: string): Promise<number[]> {
  const config = await resolveSystemEmbeddingConfig()
  const upstream = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: question,
      model: config.model,
    }),
  })

  const payload = await upstream.json().catch(() => null) as { data?: Array<{ embedding?: unknown }> } | null
  const embedding = payload?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || !embedding.every((item) => typeof item === 'number')) {
    throw new Error('Embedding API 返回格式无效')
  }

  return embedding
}

// ========== _shared/ragRetrieval.ts ==========

type RagRetrievedChunk = RetrievedChunk<RetrieveChunkInput & {
  id: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
}>

function toRetrieveInput(chunk: RagChunk): RetrieveChunkInput & {
  id: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
} {
  return {
    id: chunk.id,
    fileId: chunk.fileId,
    documentId: chunk.documentId,
    sourceType: chunk.sourceType,
    sourceName: chunk.sourceName,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
  }
}

function hasValuableVectorChunks(chunks: RagRetrievedChunk[]): boolean {
  if (chunks.length === 0) return false
  const topScore = chunks[0]?.score ?? 0
  const averageScore = chunks.reduce((total, item) => total + item.score, 0) / chunks.length
  return topScore >= 0.2 && averageScore >= 0.12
}

function toSourceChunks(items: RagRetrievedChunk[]): AiChatSourceChunk[] {
  return items.map((item) => ({
    chunkId: String(item.id ?? ''),
    fileId: typeof item.fileId === 'string' ? item.fileId : null,
    documentId: typeof item.documentId === 'string' ? item.documentId : null,
    sourceType: item.sourceType === 'document' ? 'document' : 'file',
    sourceName: typeof item.sourceName === 'string' ? item.sourceName : null,
    chunkIndex: typeof item.chunkIndex === 'number' ? item.chunkIndex : null,
    content: String(item.content ?? ''),
    score: item.score,
    matchedKeywords: item.matchedKeywords,
  }))
}

async function selectKnowledgeSources(input: {
  authHeader: string
  knowledgeBaseId: string
  question: string
  chunks: RagChunk[]
  queryEmbedding: number[] | null
}): Promise<{ mode: 'general-ai' | 'knowledge-enhanced'; sources: AiChatSourceChunk[] }> {
  const retrieveInputs = input.chunks.map(toRetrieveInput)

  let vectorResults: RagRetrievedChunk[] = []
  if (input.queryEmbedding) {
    try {
      const matched = await matchKnowledgeChunksByVector(
        input.authHeader,
        input.knowledgeBaseId,
        input.queryEmbedding,
        8,
      )
      vectorResults = matched.map((chunk) => ({
        ...toRetrieveInput(chunk),
        score: chunk.score,
        hitCount: 0,
        matchedKeywords: [],
      }))
    } catch {
      vectorResults = input.chunks
        .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === input.queryEmbedding!.length)
        .map((chunk) => ({
          ...toRetrieveInput(chunk),
          score: cosineSimilarity(input.queryEmbedding!, chunk.embedding as number[]),
          hitCount: 0,
          matchedKeywords: [],
        }))
        .filter((chunk) => chunk.score >= 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    }
  }

  const keywordResults = retrieveRelevantChunks(input.question, retrieveInputs, {
    topK: 8,
    minScore: 0.03,
  }) as RagRetrievedChunk[]

  const vectorValuable = hasValuableVectorChunks(vectorResults)
  const keywordValuable = hasValuableRetrievedChunks(keywordResults, {
    minTopScore: 0.1,
    minHitCount: 2,
    minAverageScore: 0.06,
  })

  let retrieved: RagRetrievedChunk[] = []
  if (vectorResults.length > 0 && keywordResults.length > 0) {
    retrieved = fuseRetrievedChunks(vectorResults, keywordResults, { topK: 5 }) as RagRetrievedChunk[]
  } else if (vectorResults.length > 0) {
    retrieved = vectorResults.slice(0, 5)
  } else {
    retrieved = keywordResults.slice(0, 5)
  }

  const hasValuableSources = retrieved.length > 0 && (vectorValuable || keywordValuable)
  return {
    mode: hasValuableSources ? 'knowledge-enhanced' : 'general-ai',
    sources: hasValuableSources ? toSourceChunks(retrieved) : [],
  }
}

// ========== _shared/ragRewrite.ts ==========

const ANAPHORA_PATTERNS = [
  '它',
  '他们',
  '她们',
  '它们',
  '这个',
  '那个',
  '这些',
  '那些',
  '这种',
  '那种',
  '上面',
  '上述',
  '前面',
  '刚才',
  '之前',
  '该方案',
  '该方法',
  '此方案',
  '此方法',
  '其中',
  '为什么',
  '怎么办',
  '呢',
]

const SHORT_QUESTION_THRESHOLD = 12

function shouldRewriteQuestion(question: string, historyCount: number): boolean {
  if (historyCount <= 0) {
    return false
  }

  const trimmed = question.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.length <= SHORT_QUESTION_THRESHOLD) {
    return true
  }

  return ANAPHORA_PATTERNS.some((pattern) => trimmed.includes(pattern))
}

const REWRITE_SYSTEM_PROMPT = [
  '你是检索查询改写器。',
  '根据对话历史，把用户最新的问题改写为一个不依赖上下文、指代明确的独立问题，用于知识库检索。',
  '只输出改写后的问题本身，不要任何解释、前缀或引号。',
  '如果问题本身已经独立完整，原样输出。',
].join('')

async function requestRewrite(
  question: string,
  history: AiChatHistoryMessage[],
  config: AiResolvedConfig,
): Promise<string | null> {
  const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: 'user', content: `请改写这个问题用于检索：${question}` },
      ],
    }),
  })

  const payload = await upstream.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
  } | null

  const choice = payload?.choices?.[0]
  const content = typeof choice?.message?.content === 'string'
    ? choice.message.content
    : typeof choice?.text === 'string'
      ? choice.text
      : ''

  return content.trim() || null
}

async function rewriteQuestionForServerRetrieval(
  question: string,
  history: AiChatHistoryMessage[],
  config: AiResolvedConfig,
  options: { timeoutMs?: number; maxHistoryMessages?: number } = {},
): Promise<string> {
  if (!shouldRewriteQuestion(question, history.length)) {
    return question
  }

  const timeoutMs = options.timeoutMs ?? 2500
  const maxHistoryMessages = options.maxHistoryMessages ?? 6
  const recentHistory = history.slice(-maxHistoryMessages)
  if (!recentHistory.length) {
    return question
  }

  try {
    const task = requestRewrite(question, recentHistory, config)

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    })

    const result = await Promise.race([task, timeout])
    if (!result) {
      return question
    }

    const rewritten = result.trim().replace(/^["'「『]|["'」』]$/g, '')
    if (!rewritten || rewritten.length > Math.max(question.length * 6, 200)) {
      return question
    }

    return rewritten
  } catch {
    return question
  }
}

// ========== ai-chat/index.ts 主逻辑 ==========

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader) {
    return errorResponse('Unauthorized', 401)
  }

  try {
    const body = (await request.json()) as ChatRequestBody
    let normalized = normalizeAiChatRequest(body)
    const userPrompt =
      normalized.kind === 'knowledge-enhanced'
        ? normalized.knowledge?.question
        : normalized.params.userPrompt?.trim()

    if (!userPrompt) {
      return errorResponse('userPrompt is required', 400)
    }

    const config = await resolveUserAiConfig(authHeader)
    let streamMeta: { type: 'meta'; mode: 'general-ai' | 'knowledge-enhanced'; sources: unknown[] } | null = null

    if (normalized.kind === 'knowledge-enhanced' && normalized.knowledge?.knowledgeBaseId) {
      const knowledge = normalized.knowledge
      const rewrittenQuestion = await rewriteQuestionForServerRetrieval(
        knowledge.question,
        knowledge.history,
        config,
      )
      const chunks = await loadKnowledgeChunksForQa(authHeader, knowledge.knowledgeBaseId, 500)
      const queryEmbedding = chunks.length ? await createQueryEmbedding(authHeader, rewrittenQuestion) : null
      const selection = await selectKnowledgeSources({
        authHeader,
        knowledgeBaseId: knowledge.knowledgeBaseId,
        question: rewrittenQuestion,
        chunks,
        queryEmbedding,
      })

      streamMeta = {
        type: 'meta',
        mode: selection.mode,
        sources: selection.sources,
      }

      if (selection.mode === 'knowledge-enhanced') {
        normalized = {
          ...normalized,
          knowledge: {
            ...knowledge,
            question: rewrittenQuestion,
            sources: selection.sources,
          },
        }
      } else {
        normalized = {
          ...normalized,
          kind: 'plain',
          knowledge: null,
          params: {
            ...normalized.params,
            history: normalized.params.history,
            userPrompt: buildGeneralAiPrompt(userPrompt, {
              systemInstruction: knowledge.systemPrompt,
              answerStyle: knowledge.answerStyle,
            }),
          },
        }
      }
    }

    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildUpstreamMessages(normalized),
        stream: normalized.stream,
        temperature: normalized.params.temperature ?? 0.7,
        max_tokens: normalized.params.maxTokens,
        top_p: normalized.params.topP,
        presence_penalty: normalized.params.presencePenalty,
        frequency_penalty: normalized.params.frequencyPenalty,
      }),
    })

    if (normalized.stream) {
      if (!streamMeta) {
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            ...corsHeaders,
            'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        })
      }

      const encoder = new TextEncoder()
      const metaChunk = encoder.encode(`data: ${JSON.stringify(streamMeta)}\n\n`)
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(metaChunk)
          const reader = upstream.body?.getReader()
          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              if (value) controller.enqueue(value)
            }
          } finally {
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    }

    const payload = await upstream.json().catch(() => null)
    return jsonResponse(payload, upstream.status)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed'
    const status = message === 'Unauthorized' ? 401 : 400
    return errorResponse(message, status)
  }
})
