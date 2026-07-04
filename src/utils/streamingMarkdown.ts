/**
 * 流式 Markdown 增量渲染的文本切分器。
 *
 * 问题：流式输出时每帧更新整条消息，MdPreview 对全文重新解析渲染，
 * 回答越长每帧成本越高——rAF 合帧只控制了更新「频率」，没控制单次
 * 更新的「渲染量」。
 *
 * 方案：把流式文本切为「已完成段落（stable）/ 进行中尾段（tail）」，
 * stable 仅在新段落完成时变化（MdPreview 不再随每帧 chunk 重新解析全文），
 * 每帧真正重渲染的只有小小的 tail。
 *
 * 切分点只取「代码围栏之外」的空行：围栏内的空行不是段落边界，
 * 否则代码块会被拦腰截断。围栏可能被 chunk 在任意位置切开，
 * 因此用逐行状态机而非正则整体匹配。
 *
 * 已知取舍：超长代码块内部没有安全切分点，整块留在 tail（退化为旧行为）；
 * 换来的是 stable 部分与最终渲染逐字节一致，无任何视觉跳变。
 */

export interface StreamingMarkdownParts {
  /** 已完成段落，与最终渲染逐字节一致，仅在新段落完成时变化 */
  stable: string
  /** 进行中尾段，每帧变化，体积小 */
  tail: string
}

interface FenceState {
  /** 围栏字符：'`' 或 '~'，null 表示当前不在围栏内 */
  char: string | null
  /** 开栏标记长度（闭栏需同字符且不短于它） */
  length: number
}

/** CommonMark 围栏：行首至多 3 空格缩进 + 至少 3 个 ` 或 ~ */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * 单趟逐行扫描：返回最后一个「围栏外空行」之后的字符偏移（即 tail 起点），
 * 以及扫描结束时的围栏状态。
 */
function scanMarkdown(text: string): { boundary: number; fence: FenceState } {
  const fence: FenceState = { char: null, length: 0 }
  let boundary = 0
  let offset = 0

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    offset += line.length + 1

    const match = line.match(FENCE_LINE)
    if (match) {
      const marker = match[1]
      if (fence.char === null) {
        fence.char = marker[0]
        fence.length = marker.length
      } else if (
        marker[0] === fence.char &&
        marker.length >= fence.length &&
        match[2].trim() === ''
      ) {
        fence.char = null
        fence.length = 0
      }
      continue
    }

    if (fence.char === null && line.trim() === '') {
      // 空行且在围栏外 → 段落边界，tail 从下一行开始
      boundary = Math.min(offset, text.length)
    }
  }

  return { boundary, fence }
}

/** 把流式文本切为 stable / tail 两段（纯函数，内容只追加时边界单调前移） */
export function splitStreamingMarkdown(text: string): StreamingMarkdownParts {
  if (!text) {
    return { stable: '', tail: '' }
  }

  const { boundary } = scanMarkdown(text)
  return {
    stable: text.slice(0, boundary),
    tail: text.slice(boundary),
  }
}

/**
 * 渲染容错：尾段存在未闭合围栏时补一个合成闭栏，
 * 避免流式中途代码块内容被当作普通文本渲染、闭栏到达时整段样式跳变。
 */
export function closeUnbalancedFence(text: string): string {
  if (!text) {
    return text
  }

  const { fence } = scanMarkdown(text)
  if (fence.char === null) {
    return text
  }

  const closing = fence.char.repeat(Math.max(fence.length, 3))
  return text.endsWith('\n') ? `${text}${closing}` : `${text}\n${closing}`
}
