import { describe, expect, it } from 'vitest'
import { hasValuableRetrievedChunks, retrieveRelevantChunks } from '../retrieveChunks'

const CHUNKS = [
  { id: 1, content: 'Vue 组件通过 defineProps 声明属性，使用 emit 向父组件传递事件。' },
  { id: 2, content: 'Pinia 是 Vue 官方推荐的状态管理库，支持模块化 store 与 TypeScript。' },
  { id: 3, content: '今天天气很好，适合出去散步，公园里人很多。' },
  { id: 4, content: 'React Hooks 提供 useState 与 useEffect 管理组件状态与副作用。' },
]

describe('retrieveRelevantChunks', () => {
  it('空问题或空切片返回空数组', () => {
    expect(retrieveRelevantChunks('', CHUNKS)).toEqual([])
    expect(retrieveRelevantChunks('Vue 组件', [])).toEqual([])
  })

  it('中文关键词命中相关切片且排序正确', () => {
    const result = retrieveRelevantChunks('Vue 组件如何声明属性', CHUNKS)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe(1)
    expect(result[0].score).toBeGreaterThan(0)
    expect(result[0].matchedKeywords.length).toBeGreaterThan(0)
  })

  it('英文 token 匹配（大小写不敏感）', () => {
    const result = retrieveRelevantChunks('useState 怎么用', CHUNKS)
    expect(result[0]?.id).toBe(4)
  })

  it('无关问题被 minScore 过滤', () => {
    const result = retrieveRelevantChunks('量子力学的薛定谔方程', CHUNKS, { minScore: 0.05 })
    expect(result).toEqual([])
  })

  it('topK 被钳制在 3~5 之间', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      content: `Vue 组件相关内容第 ${i} 条，涉及组件通信。`,
    }))

    const resultBig = retrieveRelevantChunks('Vue 组件通信', many, { topK: 10 })
    expect(resultBig.length).toBeLessThanOrEqual(5)

    const resultSmall = retrieveRelevantChunks('Vue 组件通信', many, { topK: 1 })
    expect(resultSmall.length).toBe(3)
  })

  it('完整问题命中给予 exactQuestionBoost 加分', () => {
    const chunks = [
      { id: 'exact', content: '关于如何配置向量检索：先创建知识库再上传文件。' },
      { id: 'partial', content: '知识库支持配置与检索功能，向量能力可选。' },
    ]

    const result = retrieveRelevantChunks('如何配置向量检索', chunks)
    expect(result[0].id).toBe('exact')
  })

  it('停用词不参与匹配', () => {
    const chunks = [{ id: 1, content: '的了和是在，全部都是停用词的组合。' }]
    const result = retrieveRelevantChunks('什么是为什么', chunks, { minScore: 0.01 })
    expect(result).toEqual([])
  })
})

describe('hasValuableRetrievedChunks', () => {
  const buildChunk = (score: number, hitCount: number) => ({
    id: 1,
    content: 'x',
    score,
    hitCount,
    matchedKeywords: [],
  })

  it('空结果无价值', () => {
    expect(hasValuableRetrievedChunks([])).toBe(false)
  })

  it('top 分数与命中数达标才有价值', () => {
    expect(hasValuableRetrievedChunks([buildChunk(0.5, 3)])).toBe(true)
    expect(hasValuableRetrievedChunks([buildChunk(0.05, 3)])).toBe(false)
    expect(hasValuableRetrievedChunks([buildChunk(0.5, 1)])).toBe(false)
  })

  it('平均分过低时无价值', () => {
    const chunks = [buildChunk(0.3, 3), buildChunk(0.01, 1), buildChunk(0.01, 1)]
    expect(hasValuableRetrievedChunks(chunks, { minAverageScore: 0.2 })).toBe(false)
  })
})
