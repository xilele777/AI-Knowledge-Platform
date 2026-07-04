import { describe, expect, it } from 'vitest'
import { closeUnbalancedFence, splitStreamingMarkdown } from '../streamingMarkdown'

describe('splitStreamingMarkdown', () => {
  it('无空行时全部留在 tail', () => {
    const text = '第一段还在生成中'
    expect(splitStreamingMarkdown(text)).toEqual({ stable: '', tail: text })
  })

  it('在最后一个空行处切分，stable 含空行', () => {
    const text = '第一段。\n\n第二段。\n\n第三段还在生成'
    const { stable, tail } = splitStreamingMarkdown(text)
    expect(stable).toBe('第一段。\n\n第二段。\n\n')
    expect(tail).toBe('第三段还在生成')
  })

  it('stable + tail 拼回原文（无损切分）', () => {
    const text = '# 标题\n\n- 列表项\n- 列表项\n\n```ts\nconst a = 1\n```\n\n收尾'
    const { stable, tail } = splitStreamingMarkdown(text)
    expect(stable + tail).toBe(text)
  })

  it('围栏内的空行不是段落边界', () => {
    const text = '说明文字。\n\n```python\ndef f():\n\n    return 1\n还没闭合'
    const { stable, tail } = splitStreamingMarkdown(text)
    expect(stable).toBe('说明文字。\n\n')
    expect(tail).toContain('```python')
    expect(tail).toContain('还没闭合')
  })

  it('围栏闭合后的空行恢复为边界', () => {
    const text = '```js\ncode()\n```\n\n围栏之后的新段落'
    const { stable, tail } = splitStreamingMarkdown(text)
    expect(stable).toBe('```js\ncode()\n```\n\n')
    expect(tail).toBe('围栏之后的新段落')
  })

  it('波浪线围栏与反引号围栏互不闭合', () => {
    const text = '~~~\n```\n\n~~~\n\n新段落'
    const { stable, tail } = splitStreamingMarkdown(text)
    // ``` 在 ~~~ 围栏内是内容，不开新围栏；~~~ 闭合后空行生效
    expect(stable).toBe('~~~\n```\n\n~~~\n\n')
    expect(tail).toBe('新段落')
  })

  it('闭栏长度不足时不闭合围栏', () => {
    const text = 'a\n\n````\ncode\n```\n\nstill inside'
    const { stable } = splitStreamingMarkdown(text)
    // ``` 短于开栏的 ````，围栏未闭合，其后空行不是边界
    expect(stable).toBe('a\n\n')
  })

  it('文本以空行结尾时 tail 为空', () => {
    const text = '完整段落。\n\n'
    expect(splitStreamingMarkdown(text)).toEqual({ stable: text, tail: '' })
  })

  it('空字符串安全', () => {
    expect(splitStreamingMarkdown('')).toEqual({ stable: '', tail: '' })
  })

  it('内容追加时边界单调前移（stable 不回退）', () => {
    const chunks = ['第一段', '。\n\n第二', '段。\n\n```js\n', 'code()\n', '```\n\n第三段']
    let text = ''
    let prevStableLength = 0
    for (const chunk of chunks) {
      text += chunk
      const { stable } = splitStreamingMarkdown(text)
      expect(stable.length).toBeGreaterThanOrEqual(prevStableLength)
      prevStableLength = stable.length
    }
  })
})

describe('closeUnbalancedFence', () => {
  it('无围栏时原样返回', () => {
    expect(closeUnbalancedFence('普通文本')).toBe('普通文本')
  })

  it('已闭合围栏原样返回', () => {
    const text = '```js\ncode()\n```'
    expect(closeUnbalancedFence(text)).toBe(text)
  })

  it('未闭合围栏补合成闭栏', () => {
    expect(closeUnbalancedFence('```js\nconst a =')).toBe('```js\nconst a =\n```')
  })

  it('闭栏长度与开栏一致（四反引号开栏补四反引号）', () => {
    expect(closeUnbalancedFence('````md\n```内层')).toBe('````md\n```内层\n````')
  })

  it('波浪线围栏补波浪线闭栏', () => {
    expect(closeUnbalancedFence('~~~\ntext')).toBe('~~~\ntext\n~~~')
  })

  it('空字符串安全', () => {
    expect(closeUnbalancedFence('')).toBe('')
  })
})
