import { describe, expect, it } from 'vitest'
import { splitThinkContent, stripLegacyThinkPrefix } from '../streamingThinkParser'

describe('splitThinkContent', () => {
  it('无 think 标签时全部进回答通道', () => {
    expect(splitThinkContent('直接回答内容')).toEqual({
      thinking: '',
      answer: '直接回答内容',
      thinkOpen: false,
    })
  })

  it('闭合 think 块分流到思考通道', () => {
    const result = splitThinkContent('<think>先分析问题</think>最终答案')
    expect(result).toEqual({
      thinking: '先分析问题',
      answer: '最终答案',
      thinkOpen: false,
    })
  })

  it('未闭合 think 块：思考进行中', () => {
    const result = splitThinkContent('<think>正在推理第一步')
    expect(result).toEqual({
      thinking: '正在推理第一步',
      answer: '',
      thinkOpen: true,
    })
  })

  it('开标签被 chunk 切断时暂时隐藏半截标签', () => {
    // 流式到达 '<thi' —— 不应把残缺标签当正文渲染
    expect(splitThinkContent('<thi')).toEqual({ thinking: '', answer: '', thinkOpen: false })
    // 下一帧补全后正常分流
    expect(splitThinkContent('<think>推理').thinkOpen).toBe(true)
  })

  it('闭标签被 chunk 切断时思考通道暂时隐藏半截标签', () => {
    const result = splitThinkContent('<think>推理内容</thi')
    expect(result.thinking).toBe('推理内容')
    expect(result.thinkOpen).toBe(true)
  })

  it('多个 think 块全部汇入思考通道', () => {
    const result = splitThinkContent('<think>第一段</think>中间回答<think>第二段</think>结尾')
    expect(result.thinking).toBe('第一段\n\n第二段')
    expect(result.answer).toBe('中间回答结尾')
    expect(result.thinkOpen).toBe(false)
  })

  it('开标签之前的正文保留在回答通道', () => {
    const result = splitThinkContent('前置说明<think>推理</think>答案')
    expect(result.answer).toBe('前置说明答案')
  })

  it('正文中的孤立 < 不受影响', () => {
    expect(splitThinkContent('a < b 是成立的').answer).toBe('a < b 是成立的')
  })

  it('空字符串安全', () => {
    expect(splitThinkContent('')).toEqual({ thinking: '', answer: '', thinkOpen: false })
  })

  it('模拟流式逐帧解析：思考态 → 回答态', () => {
    const frames = [
      '<th',
      '<think>分析',
      '<think>分析中</th',
      '<think>分析中</think>',
      '<think>分析中</think>答案开始',
    ]
    const states = frames.map((frame) => splitThinkContent(frame))
    expect(states[0]).toEqual({ thinking: '', answer: '', thinkOpen: false })
    expect(states[1]!.thinkOpen).toBe(true)
    expect(states[2]!.thinking).toBe('分析中')
    expect(states[3]!.thinkOpen).toBe(false)
    expect(states[4]!.answer).toBe('答案开始')
  })
})

describe('stripLegacyThinkPrefix', () => {
  it('剥离「思考：…回答：…」前缀风格', () => {
    expect(stripLegacyThinkPrefix('思考：先想一下\n回答：这是答案')).toBe('这是答案')
  })

  it('无前缀时原样返回', () => {
    expect(stripLegacyThinkPrefix('普通回答')).toBe('普通回答')
  })
})
