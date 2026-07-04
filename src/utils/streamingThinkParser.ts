/**
 * 推理模型 <think> 块的流式解析。
 *
 * 现状问题：<think> 内容被直接剥离，推理过程对用户完全不可见；且旧实现
 * 用整体正则只能匹配「已闭合」的块，流式期间 <think> 尚未闭合时整段
 * 推理文本会被当作正文渲染出来。
 *
 * 关键边界：标签可能被 SSE chunk 在任意位置切断（'<thi' + 'nk>'）。
 * 本模块每帧解析「累积全文」而非单个 chunk，天然免疫标签跨 chunk；
 * 对「结尾恰好是半截标签」的瞬时状态，将其暂时隐藏（下一帧标签补全后
 * 自然归位），避免闪现 '<thi' 这类残缺文本。
 *
 * 支持多个 think 块（模型分段思考），全部汇入 thinking 通道。
 * 落库仍保存原始全文，本模块只负责展示层分流。
 */

export interface ThinkSplit {
  /** 思考通道：所有 think 块内容（含未闭合块的已到达部分） */
  thinking: string
  /** 回答通道：think 块之外的正文 */
  answer: string
  /** 是否存在未闭合的 think 块（流式思考进行中） */
  thinkOpen: boolean
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/** 若文本以 tag 的「非空真前缀」结尾（半截标签），去掉该残缺后缀 */
function stripPartialTagSuffix(text: string, tag: string): string {
  const maxLen = Math.min(tag.length - 1, text.length)
  for (let len = maxLen; len >= 1; len -= 1) {
    if (text.endsWith(tag.slice(0, len))) {
      return text.slice(0, text.length - len)
    }
  }
  return text
}

export function splitThinkContent(content: string): ThinkSplit {
  if (!content) {
    return { thinking: '', answer: '', thinkOpen: false }
  }

  const thinkingParts: string[] = []
  let answer = ''
  let rest = content
  let thinkOpen = false

  while (rest) {
    const openIndex = rest.indexOf(OPEN_TAG)
    if (openIndex < 0) {
      answer += rest
      rest = ''
      break
    }

    answer += rest.slice(0, openIndex)
    const afterOpen = rest.slice(openIndex + OPEN_TAG.length)
    const closeIndex = afterOpen.indexOf(CLOSE_TAG)

    if (closeIndex < 0) {
      // 未闭合：全部进思考通道；结尾可能是半截 </think>，先隐藏
      thinkingParts.push(stripPartialTagSuffix(afterOpen, CLOSE_TAG))
      thinkOpen = true
      rest = ''
      break
    }

    thinkingParts.push(afterOpen.slice(0, closeIndex))
    rest = afterOpen.slice(closeIndex + CLOSE_TAG.length)
  }

  if (!thinkOpen) {
    // 回答结尾可能是半截 <think>，先隐藏，标签补全后自然归位
    answer = stripPartialTagSuffix(answer, OPEN_TAG)
  }

  return {
    thinking: thinkingParts.join('\n\n').trim(),
    answer: answer.trim(),
    thinkOpen,
  }
}

/**
 * 兼容不输出 <think> 标签、而用「思考：…… 回答：……」前缀风格的模型：
 * 剥离思考前缀，仅保留回答部分。只在无 <think> 标签时使用。
 */
const LEGACY_THINK_PREFIX =
  /^(?:思考|思考过程|thinking|reasoning)[:：]\s*[\s\S]*?(?=\n\s*(?:回答|输出|answer|output)[:：]|$)/i
const LEGACY_ANSWER_PREFIX = /^\n\s*(?:回答|输出|answer|output)[:：]\s*/i

export function stripLegacyThinkPrefix(content: string): string {
  const match = content.match(LEGACY_THINK_PREFIX)
  if (!match) {
    return content
  }

  return content.slice(match[0].length).replace(LEGACY_ANSWER_PREFIX, '').trim()
}
