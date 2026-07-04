import { describe, expect, it } from 'vitest'
import { fuseRetrievedChunks } from '../fuseRetrieval'
import type { RetrievedChunk } from '../retrieveChunks'

function chunk(
  id: string,
  score: number,
  extra: Partial<RetrievedChunk> = {},
): RetrievedChunk {
  return {
    id,
    content: `content-${id}`,
    score,
    hitCount: 0,
    matchedKeywords: [],
    ...extra,
  }
}

describe('fuseRetrievedChunks', () => {
  it('两路都空返回空', () => {
    expect(fuseRetrievedChunks([], [])).toEqual([])
  })

  it('单路有值时退化为该路排名', () => {
    const vector = [chunk('a', 0.9), chunk('b', 0.8)]
    const fused = fuseRetrievedChunks(vector, [])
    expect(fused.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('双路都命中的切片排到最前', () => {
    const vector = [chunk('a', 0.9), chunk('b', 0.8), chunk('c', 0.7)]
    const keyword = [chunk('x', 5), chunk('b', 4)]
    const fused = fuseRetrievedChunks(vector, keyword)
    // b: 1/(60+2) + 1/(60+2) > a: 1/(60+1) > x: 1/(60+1) —— a 与 x 并列时向量排名優先
    expect(fused[0]!.id).toBe('b')
  })

  it('归一化分数落在 0~1，双路第一为 1', () => {
    const both = [chunk('a', 0.9)]
    const fused = fuseRetrievedChunks(both, [chunk('a', 3)])
    expect(fused[0]!.score).toBeCloseTo(1, 10)

    const single = fuseRetrievedChunks([chunk('b', 0.9)], [])
    expect(single[0]!.score).toBeGreaterThan(0)
    expect(single[0]!.score).toBeLessThan(1)
  })

  it('合并关键词路的 hitCount 与 matchedKeywords', () => {
    const vector = [chunk('a', 0.9)]
    const keyword = [chunk('a', 4, { hitCount: 3, matchedKeywords: ['向量', '检索'] })]
    const fused = fuseRetrievedChunks(vector, keyword)
    expect(fused[0]!.hitCount).toBe(3)
    expect(fused[0]!.matchedKeywords).toEqual(['向量', '检索'])
  })

  it('纯向量命中的切片 matchedKeywords 为空数组', () => {
    const fused = fuseRetrievedChunks([chunk('a', 0.9, { matchedKeywords: ['残留'] })], [])
    expect(fused[0]!.matchedKeywords).toEqual([])
    expect(fused[0]!.hitCount).toBe(0)
  })

  it('topK 截断融合结果', () => {
    const vector = [chunk('a', 0.9), chunk('b', 0.8), chunk('c', 0.7)]
    const keyword = [chunk('d', 5), chunk('e', 4)]
    const fused = fuseRetrievedChunks(vector, keyword, { topK: 2 })
    expect(fused).toHaveLength(2)
  })

  it('数字 id 与字符串 id 视为同一切片', () => {
    const vector = [chunk('1', 0.9)]
    const keyword = [{ ...chunk('x', 4), id: 1 }]
    const fused = fuseRetrievedChunks(vector, keyword)
    expect(fused).toHaveLength(1)
  })
})
