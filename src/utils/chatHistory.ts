/**
 * 多轮对话历史构建与预算裁剪
 *
 * 将会话中已完成的消息压缩为可回传给模型的 history 数组：
 * - 从最新往旧收集，超出字符预算或轮数上限即停止（旧消息优先被丢弃）
 * - 单条消息超长时头部保留、尾部截断
 * - 跳过 streaming / error 状态与空内容消息
 * - 剥离推理模型输出中的 <think> 块，避免浪费上下文预算
 */

export interface ChatHistorySourceMessage {
  role: string
  content: string
  status?: string
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuildChatHistoryOptions {
  /** 历史消息总字符预算（不含当前问题与检索片段）。默认 6000 */
  charBudget?: number
  /** 最多回传的对话轮数（1 轮 = 1 问 + 1 答）。默认 6 */
  maxRounds?: number
  /** 单条历史消息的最大字符数，超出从尾部截断。默认 1500 */
  perMessageMaxChars?: number
}

const TRUNCATION_SUFFIX = '…（内容过长已截断）'

export function stripThinkBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function truncateMessageContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content
  }

  return content.slice(0, Math.max(0, maxChars - TRUNCATION_SUFFIX.length)) + TRUNCATION_SUFFIX
}

/**
 * 取「最后一次提出 question 之前」的消息，用于排除当前提问及其之后的内容。
 *
 * 发送场景：本地已插入当前用户消息，历史应止步于它之前；
 * 重新生成场景：同时排除上一次的回答，避免旧答案污染新一次生成。
 */
export function takeMessagesBeforeLastQuestion<T extends ChatHistorySourceMessage>(
  messages: T[],
  question: string,
): T[] {
  const normalizedQuestion = question.trim()

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user' && messages[i].content.trim() === normalizedQuestion) {
      return messages.slice(0, i)
    }
  }

  return messages
}

/**
 * 构建带预算约束的多轮历史。返回按时间正序排列的 user/assistant 消息数组。
 */
export function buildChatHistory(
  messages: ChatHistorySourceMessage[],
  options: BuildChatHistoryOptions = {},
): ChatHistoryMessage[] {
  const charBudget = Math.max(0, options.charBudget ?? 6000)
  const maxRounds = Math.max(0, options.maxRounds ?? 6)
  const perMessageMaxChars = Math.max(200, options.perMessageMaxChars ?? 1500)

  if (charBudget === 0 || maxRounds === 0) {
    return []
  }

  const maxMessages = maxRounds * 2
  const collected: ChatHistoryMessage[] = []
  let usedChars = 0

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]

    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }

    if (message.status === 'streaming' || message.status === 'error') {
      continue
    }

    const cleaned =
      message.role === 'assistant' ? stripThinkBlocks(message.content) : message.content.trim()

    if (!cleaned) {
      continue
    }

    const content = truncateMessageContent(cleaned, perMessageMaxChars)

    if (usedChars + content.length > charBudget || collected.length >= maxMessages) {
      break
    }

    collected.push({ role: message.role, content })
    usedChars += content.length
  }

  return collected.reverse()
}
