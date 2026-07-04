import { describe, expect, it } from 'vitest'
import {
  extractStreamDeltaText,
  extractTextFromCompletionPayload,
  parseSseDataLines,
} from '../../api/ai'

describe('parseSseDataLines', () => {
  it('提取 data: 行并去掉前缀', () => {
    const event = 'event: message\ndata: {"a":1}\nid: 3'
    expect(parseSseDataLines(event)).toEqual(['{"a":1}'])
  })

  it('一个事件包含多条 data 行', () => {
    const event = 'data: line1\ndata: line2'
    expect(parseSseDataLines(event)).toEqual(['line1', 'line2'])
  })

  it('忽略空 data 与非 data 行', () => {
    const event = ': keep-alive comment\ndata:\nretry: 3000'
    expect(parseSseDataLines(event)).toEqual([])
  })

  it('容忍 data: 后无空格与行首空白', () => {
    expect(parseSseDataLines('  data:payload  ')).toEqual(['payload'])
  })
})

describe('extractStreamDeltaText', () => {
  it('标准 OpenAI delta.content', () => {
    const payload = { choices: [{ delta: { content: '你好' } }] }
    expect(extractStreamDeltaText(payload)).toBe('你好')
  })

  it('delta.content 为分段数组（部分厂商格式）', () => {
    const payload = {
      choices: [{ delta: { content: [{ text: 'a' }, { text: 'b' }] as unknown as string } }],
    }
    expect(extractStreamDeltaText(payload)).toBe('ab')
  })

  it('退化到 message.content 与 choice.text', () => {
    expect(extractStreamDeltaText({ choices: [{ message: { content: 'm' } }] })).toBe('m')
    expect(extractStreamDeltaText({ choices: [{ text: 't' as unknown as string }] })).toBe('t')
  })

  it('无 choices 时返回空串', () => {
    expect(extractStreamDeltaText({})).toBe('')
  })
})

describe('extractTextFromCompletionPayload', () => {
  it('标准 choices[0].message.content', () => {
    const payload = { choices: [{ message: { content: '完整回答' } }] }
    expect(extractTextFromCompletionPayload(payload)).toBe('完整回答')
  })

  it('output_text 优先级最高', () => {
    const payload = {
      output_text: '来自 output_text',
      choices: [{ message: { content: '来自 choices' } }],
    }
    expect(extractTextFromCompletionPayload(payload)).toBe('来自 output_text')
  })

  it('非标准嵌套结构走深度递归兜底', () => {
    const payload = {
      result: { response: { answer: '深层嵌套的回答内容' } },
    } as Record<string, unknown>
    expect(extractTextFromCompletionPayload(payload)).toBe('深层嵌套的回答内容')
  })

  it('null / 空对象返回空串', () => {
    expect(extractTextFromCompletionPayload(null)).toBe('')
    expect(extractTextFromCompletionPayload({})).toBe('')
  })
})
