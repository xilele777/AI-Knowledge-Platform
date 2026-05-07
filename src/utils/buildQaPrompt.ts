import type { RetrieveChunkInput, RetrievedChunk } from './retrieveChunks'

export interface BuildQaPromptOptions {
  systemInstruction?: string
  answerStyle?: string
  maxChunkChars?: number
  includeScore?: boolean
}

export interface BuildGeneralAiPromptOptions {
  systemInstruction?: string
  answerStyle?: string
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

function formatChunkBlock(
  chunk: RetrievedChunk<RetrieveChunkInput>,
  index: number,
  options: Required<Pick<BuildQaPromptOptions, 'maxChunkChars' | 'includeScore'>>,
): string {
  const chunkId = chunk.id ?? 'chunk-' + String(index + 1)
  const sourceType = chunk.sourceType === 'document' ? '文档' : '文件'
  const sourceName =
    typeof chunk.sourceName === 'string' && chunk.sourceName
      ? chunk.sourceName
      : chunk.sourceType === 'document'
        ? typeof chunk.documentId === 'string'
          ? chunk.documentId
          : '-'
        : typeof chunk.fileId === 'string'
          ? chunk.fileId
          : '-'
  const scoreText = options.includeScore ? '\n相关度: ' + chunk.score.toFixed(4) : ''
  const keywordsText =
    chunk.matchedKeywords.length > 0
      ? '\n命中关键词: ' + chunk.matchedKeywords.slice(0, 8).join('、')
      : ''

  return [
    '【片段 ' + String(index + 1) + '】',
    'ID: ' + String(chunkId) + '\n来源: ' + sourceType + ' / ' + sourceName + scoreText + keywordsText,
    trimChunkContent(String(chunk.content ?? ''), options.maxChunkChars),
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

export function buildGeneralAiPrompt(
  question: string,
  options: BuildGeneralAiPromptOptions = {},
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

export function buildKnowledgeEnhancedPrompt(
  question: string,
  chunks: Array<RetrievedChunk<RetrieveChunkInput>>,
  options: BuildQaPromptOptions = {},
): string {
  const maxChunkChars = Math.max(200, options.maxChunkChars ?? 1200)
  const includeScore = options.includeScore ?? true

  const chunkBlocks = chunks.length
    ? chunks
      .map((chunk, index) => formatChunkBlock(chunk, index, { maxChunkChars, includeScore }))
      .join('\n\n')
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

/**
 * 兼容旧调用：默认返回 knowledge-enhanced prompt。
 */
export function buildQaPrompt(
  question: string,
  chunks: Array<RetrievedChunk<RetrieveChunkInput>>,
  options: BuildQaPromptOptions = {},
): string {
  return buildKnowledgeEnhancedPrompt(question, chunks, options)
}
