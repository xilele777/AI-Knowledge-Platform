import { describe, expect, it } from 'vitest'
import { chunkText } from '../chunkText'

describe('chunkText', () => {
  it('空内容返回空数组', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('短文本合并为单个切片', () => {
    const result = chunkText('第一段。\n\n第二段。')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('第一段。\n第二段。')
    expect(result[0].index).toBe(0)
  })

  it('切片长度不超过 maxLength', () => {
    const text = Array.from({ length: 40 }, (_, i) => `这是第${i}段测试内容，用来验证切片长度约束是否生效。`).join('\n\n')
    const result = chunkText(text, { minLength: 100, maxLength: 200 })

    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(200)
    }
  })

  it('超长段落按中文标点断句', () => {
    const sentence = '这是一个句子。'
    const paragraph = sentence.repeat(100)
    const result = chunkText(paragraph, { minLength: 100, maxLength: 300 })

    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(300)
    }
    // 断句切分不应把句子从中间切开（无标点截断时才硬切）
    expect(result[0].content.endsWith('。')).toBe(true)
  })

  it('无标点超长文本触发硬切', () => {
    const text = 'a'.repeat(1200)
    const result = chunkText(text, { minLength: 100, maxLength: 500 })

    expect(result).toHaveLength(3)
    expect(result.map((c) => c.length)).toEqual([500, 500, 200])
  })

  it('过短的相邻切片会被合并到 minLength 以上', () => {
    const text = ['短段一。', '短段二。', '短段三。'].join('\n\n')
    const result = chunkText(text, { minLength: 50, maxLength: 100 })

    expect(result).toHaveLength(1)
  })

  it('规范化 CRLF 与 \\u0000', () => {
    const result = chunkText('第一行\r\n\r\n第二行\u0000尾部')
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain('第一行')
    expect(result[0].content).not.toContain('\r')
    expect(result[0].content).not.toContain('\u0000')
  })

  it('index 连续递增', () => {
    const text = Array.from({ length: 20 }, (_, i) => `段落${i}内容`.repeat(30)).join('\n\n')
    const result = chunkText(text)
    expect(result.map((c) => c.index)).toEqual(result.map((_, i) => i))
  })
})
