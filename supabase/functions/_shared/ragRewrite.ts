import type { AiChatHistoryMessage } from '../../src/types/ai.ts'
import type { AiResolvedConfig } from './aiConfig.ts'

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

export async function rewriteQuestionForServerRetrieval(
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
