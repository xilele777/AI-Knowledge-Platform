import { describe, expect, it } from 'vitest'
import {
  buildChatHistory,
  stripThinkBlocks,
  takeMessagesBeforeLastQuestion,
} from '../chatHistory'

describe('stripThinkBlocks', () => {
  it('剥离 <think> 块并保留答案', () => {
    expect(stripThinkBlocks('<think>推理过程</think>最终答案')).toBe('最终答案')
  })

  it('多个 think 块全部剥离', () => {
    expect(stripThinkBlocks('<think>a</think>答案<think>b</think>')).toBe('答案')
  })

  it('无 think 块时原样返回（去首尾空白）', () => {
    expect(stripThinkBlocks('  普通回答  ')).toBe('普通回答')
  })
})

describe('takeMessagesBeforeLastQuestion', () => {
  const messages = [
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '第二问' },
    { role: 'assistant', content: '第二答' },
  ]

  it('发送场景：排除刚插入的当前问题', () => {
    const withPending = [...messages, { role: 'user', content: '第三问' }]
    const result = takeMessagesBeforeLastQuestion(withPending, '第三问')
    expect(result).toHaveLength(4)
  })

  it('重新生成场景：同时排除上一次的问与答', () => {
    const result = takeMessagesBeforeLastQuestion(messages, '第二问')
    expect(result).toHaveLength(2)
    expect(result[1].content).toBe('第一答')
  })

  it('匹配最后一次出现（重复提问时只裁最近一次）', () => {
    const repeated = [
      { role: 'user', content: '同一个问题' },
      { role: 'assistant', content: '答案一' },
      { role: 'user', content: '同一个问题' },
    ]
    const result = takeMessagesBeforeLastQuestion(repeated, '同一个问题')
    expect(result).toHaveLength(2)
  })

  it('找不到问题时返回全部消息', () => {
    expect(takeMessagesBeforeLastQuestion(messages, '不存在的问题')).toHaveLength(4)
  })
})

describe('buildChatHistory', () => {
  it('按时间正序返回 user/assistant 消息', () => {
    const result = buildChatHistory([
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答' },
    ])

    expect(result).toEqual([
      { role: 'user', content: '问' },
      { role: 'assistant', content: '答' },
    ])
  })

  it('跳过 streaming / error 状态与空消息', () => {
    const result = buildChatHistory([
      { role: 'user', content: '问' },
      { role: 'assistant', content: '生成中', status: 'streaming' },
      { role: 'assistant', content: '失败了', status: 'error' },
      { role: 'assistant', content: '   ' },
      { role: 'system', content: '系统消息' },
    ])

    expect(result).toEqual([{ role: 'user', content: '问' }])
  })

  it('超出字符预算时优先丢弃最旧消息', () => {
    const result = buildChatHistory(
      [
        { role: 'user', content: '旧'.repeat(300) },
        { role: 'assistant', content: '旧答'.repeat(150) },
        { role: 'user', content: '新'.repeat(300) },
        { role: 'assistant', content: '新答'.repeat(150) },
      ],
      { charBudget: 700 },
    )

    expect(result).toHaveLength(2)
    expect(result[0].content.startsWith('新')).toBe(true)
  })

  it('maxRounds 限制消息条数上限', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `消息${i}`,
    }))

    const result = buildChatHistory(messages, { maxRounds: 2, charBudget: 100000 })
    expect(result).toHaveLength(4)
    expect(result[result.length - 1].content).toBe('消息19')
  })

  it('单条超长消息从尾部截断', () => {
    const result = buildChatHistory(
      [{ role: 'assistant', content: 'x'.repeat(5000) }],
      { perMessageMaxChars: 500 },
    )

    expect(result[0].content.length).toBeLessThanOrEqual(500)
    expect(result[0].content.endsWith('…（内容过长已截断）')).toBe(true)
  })

  it('assistant 消息剥离 think 块后再计预算', () => {
    const result = buildChatHistory([
      { role: 'assistant', content: '<think>' + 'r'.repeat(9999) + '</think>简短答案' },
    ])

    expect(result[0].content).toBe('简短答案')
  })

  it('预算或轮数为 0 时返回空', () => {
    const messages = [{ role: 'user', content: '问' }]
    expect(buildChatHistory(messages, { charBudget: 0 })).toEqual([])
    expect(buildChatHistory(messages, { maxRounds: 0 })).toEqual([])
  })
})
