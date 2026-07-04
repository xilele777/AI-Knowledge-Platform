import { describe, expect, it } from 'vitest'
import { cosineSimilarity, findTopSimilarChunks } from '../similarity'

describe('cosineSimilarity', () => {
  it('相同向量相似度为 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })

  it('正交向量相似度为 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('反向向量相似度为 -1', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1)
  })

  it('零向量相似度为 0（避免除零）', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0)
  })

  it('维度不一致时抛错', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow()
  })

  it('与向量长度无关（归一化）', () => {
    expect(cosineSimilarity([1, 1], [10, 10])).toBeCloseTo(1)
  })
})

describe('findTopSimilarChunks', () => {
  const chunks = [
    { item: 'a', embedding: [1, 0, 0] },
    { item: 'b', embedding: [0.9, 0.1, 0] },
    { item: 'c', embedding: [0, 1, 0] },
    { item: 'd', embedding: [0, 0, 1] },
  ]

  it('按相似度降序返回 topK', () => {
    const result = findTopSimilarChunks([1, 0, 0], chunks, 2)

    expect(result).toHaveLength(2)
    expect(result[0].item).toBe('a')
    expect(result[1].item).toBe('b')
    expect(result[0].similarity).toBeGreaterThanOrEqual(result[1].similarity)
  })

  it('minSimilarity 过滤低分结果', () => {
    const result = findTopSimilarChunks([1, 0, 0], chunks, 10, 0.5)
    expect(result.map((r) => r.item)).toEqual(['a', 'b'])
  })

  it('维度不匹配的切片被跳过而不是报错', () => {
    const mixed = [...chunks, { item: 'bad', embedding: [1, 0] }]
    const result = findTopSimilarChunks([1, 0, 0], mixed, 10)
    expect(result.map((r) => r.item)).not.toContain('bad')
  })

  it('空输入返回空数组', () => {
    expect(findTopSimilarChunks([1, 0, 0], [], 5)).toEqual([])
  })
})
