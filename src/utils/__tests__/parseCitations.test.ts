import { describe, expect, it } from 'vitest'
import { extractCitations } from '../parseCitations'

describe('extractCitations', () => {
  it('解析标准方括号形式并剥离引用行', () => {
    const content = '结论是 A。\n\n参考片段: [片段1,片段3]'
    expect(extractCitations(content)).toEqual({
      body: '结论是 A。',
      citedIndices: [1, 3],
    })
  })

  it('兼容全角冒号与顿号分隔', () => {
    const content = '结论。\n参考片段：片段2、片段4'
    expect(extractCitations(content)).toEqual({
      body: '结论。',
      citedIndices: [2, 4],
    })
  })

  it('序号去重并升序', () => {
    const content = '答。\n参考片段: [片段3,片段1,片段3]'
    expect(extractCitations(content).citedIndices).toEqual([1, 3])
  })

  it('正文中间出现的“参考片段”不处理', () => {
    const content = '参考片段: [片段1] 的写法如下。\n\n更多正文内容。'
    expect(extractCitations(content)).toEqual({
      body: content,
      citedIndices: [],
    })
  })

  it('取最后一个引用标记（正文提及 + 末尾引用共存）', () => {
    const content = '上文说明了参考片段: 的格式。\n\n参考片段: [片段2]'
    expect(extractCitations(content)).toEqual({
      body: '上文说明了参考片段: 的格式。',
      citedIndices: [2],
    })
  })

  it('引用标记同行有正文前缀时只截掉引用部分', () => {
    const content = '最终结论如上。参考片段: [片段1,片段2]'
    expect(extractCitations(content)).toEqual({
      body: '最终结论如上。',
      citedIndices: [1, 2],
    })
  })

  it('引用行后允许尾随空白', () => {
    const content = '答案。\n参考片段: [片段1]\n\n  '
    expect(extractCitations(content)).toEqual({
      body: '答案。',
      citedIndices: [1],
    })
  })

  it('标记存在但无序号（如“参考片段: 无”）不动原文', () => {
    const content = '答案。\n参考片段: 无'
    expect(extractCitations(content)).toEqual({
      body: content,
      citedIndices: [],
    })
  })

  it('无引用标记原样返回', () => {
    const content = '普通回答，没有引用。'
    expect(extractCitations(content)).toEqual({
      body: content,
      citedIndices: [],
    })
  })

  it('空字符串安全', () => {
    expect(extractCitations('')).toEqual({ body: '', citedIndices: [] })
  })
})
