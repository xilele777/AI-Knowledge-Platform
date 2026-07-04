/**
 * 多轮对话的检索前问题改写（指代消解）。
 *
 * 现状问题：用户追问「那它怎么部署？」时，检索用的是原句——「它」召回
 * 不到任何切片，知识增强模式静默失效退化为纯 AI 回答。根因是检索 query
 * 与对话语境脱节：回答模型能看到历史，检索器看不到。
 *
 * 成本控制三板斧：
 * 1. 触发条件收窄（纯函数判断）：仅当存在历史且问题含指代词/过短时才改写
 * 2. 低 token 上限 + temperature 0：一次廉价补全
 * 3. 超时/失败降级：任何异常都返回原句，绝不阻塞主问答流程
 *
 * 改写结果只用于检索，展示与落库仍用用户原句。
 */
import { generateAiText } from '../api/ai'
import type { AiChatHistoryMessage } from '../types/ai'
import type { AiResolvedConfig } from './aiConfig'

/** 常见中文指代词/省略式追问的信号词 */
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

/** 问题很短且有上文时，大概率是省略主语的追问（如「怎么部署？」） */
const SHORT_QUESTION_THRESHOLD = 12

/**
 * 纯函数：判断是否值得花一次 LLM 调用做改写。
 * 无历史 → 不改写；含指代信号词或问题过短 → 改写。
 */
export function shouldRewriteQuestion(question: string, historyCount: number): boolean {
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

export interface RewriteQuestionOptions {
  /** 改写调用超时（毫秒），超时降级原句，默认 2500 */
  timeoutMs?: number
  /** 参与改写的最近历史条数，默认 6（约 3 轮） */
  maxHistoryMessages?: number
}

const REWRITE_SYSTEM_PROMPT = [
  '你是检索查询改写器。',
  '根据对话历史，把用户最新的问题改写为一个不依赖上下文、指代明确的独立问题，用于知识库检索。',
  '只输出改写后的问题本身，不要任何解释、前缀或引号。',
  '如果问题本身已经独立完整，原样输出。',
].join('')

/**
 * 把依赖上下文的追问改写为自包含的独立检索问题。
 * 任何失败（配置缺失 / 超时 / 空结果 / 异常）都返回原句。
 */
export async function rewriteQuestionForRetrieval(
  question: string,
  history: AiChatHistoryMessage[],
  config: AiResolvedConfig,
  options: RewriteQuestionOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 2500
  const maxHistoryMessages = options.maxHistoryMessages ?? 6

  const recentHistory = history.slice(-maxHistoryMessages)
  if (!recentHistory.length) {
    return question
  }

  try {
    const task = generateAiText(
      {
        systemPrompt: REWRITE_SYSTEM_PROMPT,
        userPrompt: `请改写这个问题用于检索：${question}`,
        history: recentHistory,
        temperature: 0,
        maxTokens: 120,
      },
      config,
    )

    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    })

    const result = await Promise.race([task, timeout])
    if (!result || !result.success || !result.data?.text) {
      return question
    }

    const rewritten = result.data.text.trim().replace(/^["'「『]|["'」』]$/g, '')
    // 明显异常的改写（空、过长的跑题输出）不采用
    if (!rewritten || rewritten.length > Math.max(question.length * 6, 200)) {
      return question
    }

    return rewritten
  } catch {
    return question
  }
}
