/**
 * 回答文本中的引用溯源解析。
 *
 * Prompt 约定模型在回答末尾输出「参考片段: [片段x,片段y]」，但模型输出
 * 存在变体：全角/半角冒号、有无方括号、逗号或顿号分隔、片段与数字间的
 * 空格等。此处做宽容解析：
 * - 只认「结尾处」的引用行（其后仅剩空白），正文中间出现的不算，
 *   避免误删模型在论述中引用的字样
 * - 行内 `参考片段` 之前若还有正文，只截掉引用部分，保留前缀
 *
 * 返回正文（剥离引用行）与被引片段的 1-based 序号，供 UI 渲染可点击
 * 角标并定位到对应来源切片。
 */

export interface ParsedCitations {
  /** 剥离引用行后的正文 */
  body: string
  /** 被引用片段的 1-based 序号，升序去重 */
  citedIndices: number[]
}

const CITATION_MARKER = /参考片段\s*[:：]/g
const CHUNK_INDEX = /片段\s*(\d{1,3})/g

export function extractCitations(content: string): ParsedCitations {
  if (!content) {
    return { body: content, citedIndices: [] }
  }

  // 找最后一个「参考片段:」标记
  let markerStart = -1
  let markerEnd = -1
  CITATION_MARKER.lastIndex = 0
  for (const match of content.matchAll(CITATION_MARKER)) {
    markerStart = match.index
    markerEnd = match.index + match[0].length
  }

  if (markerStart < 0) {
    return { body: content, citedIndices: [] }
  }

  // 引用语句只认结尾：标记所在行之后必须只剩空白
  const lineEnd = content.indexOf('\n', markerEnd)
  const citationText = lineEnd < 0 ? content.slice(markerEnd) : content.slice(markerEnd, lineEnd)
  const rest = lineEnd < 0 ? '' : content.slice(lineEnd)
  if (rest.trim() !== '') {
    return { body: content, citedIndices: [] }
  }

  const indices = new Set<number>()
  CHUNK_INDEX.lastIndex = 0
  for (const match of citationText.matchAll(CHUNK_INDEX)) {
    const value = Number.parseInt(match[1], 10)
    if (Number.isFinite(value) && value > 0) {
      indices.add(value)
    }
  }

  // 标记存在但解析不出序号（如「参考片段: 无」）→ 不动原文
  if (indices.size === 0) {
    return { body: content, citedIndices: [] }
  }

  // 标记前若同行还有正文，只截掉引用部分；否则整行移除
  const lineStart = content.lastIndexOf('\n', markerStart) + 1
  const prefixOnLine = content.slice(lineStart, markerStart)
  const cutAt = prefixOnLine.trim() === '' ? lineStart : markerStart

  return {
    body: content.slice(0, cutAt).trimEnd(),
    citedIndices: Array.from(indices).sort((a, b) => a - b),
  }
}
