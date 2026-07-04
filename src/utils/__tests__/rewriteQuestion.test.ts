import { describe, expect, it } from 'vitest'
import { shouldRewriteQuestion } from '../rewriteQuestion'

describe('shouldRewriteQuestion', () => {
  it('无历史时不改写（首轮问题必然自包含）', () => {
    expect(shouldRewriteQuestion('那它怎么部署？', 0)).toBe(false)
  })

  it('空问题不改写', () => {
    expect(shouldRewriteQuestion('   ', 4)).toBe(false)
  })

  it('含指代词且有历史时改写', () => {
    expect(shouldRewriteQuestion('那它的性能怎么样，具体在高并发场景下表现如何', 2)).toBe(true)
    expect(shouldRewriteQuestion('上面提到的配置文件放在哪个目录里面比较合适', 2)).toBe(true)
  })

  it('短问题且有历史时改写（省略主语的追问）', () => {
    expect(shouldRewriteQuestion('怎么部署？', 2)).toBe(true)
  })

  it('长且自包含的问题不改写', () => {
    expect(
      shouldRewriteQuestion('请介绍 Supabase Edge Functions 如何配置环境变量与部署流程', 2),
    ).toBe(false)
  })
})
