import { describe, expect, it } from 'vitest'
import { diffChunkIds } from '../embeddingCache'
import { findTopSimilarIndices, packEmbeddingMatrix } from '../similarity'

describe('diffChunkIds', () => {
  it('缓存为空时全部缺失', () => {
    const diff = diffChunkIds(['a', 'b', 'c'], [])
    expect(diff.missingIds).toEqual(['a', 'b', 'c'])
    expect(diff.staleIds).toEqual([])
  })

  it('完全命中时无缺失无淘汰', () => {
    const diff = diffChunkIds(['a', 'b'], ['b', 'a'])
    expect(diff.missingIds).toEqual([])
    expect(diff.staleIds).toEqual([])
  })

  it('增量新增与服务端删除同时存在', () => {
    const diff = diffChunkIds(['a', 'c', 'd'], ['a', 'b'])
    expect(diff.missingIds).toEqual(['c', 'd'])
    expect(diff.staleIds).toEqual(['b'])
  })

  it('missingIds 保持服务端顺序', () => {
    const diff = diffChunkIds(['z', 'a', 'm'], [])
    expect(diff.missingIds).toEqual(['z', 'a', 'm'])
  })
})

describe('packEmbeddingMatrix', () => {
  it('按行优先打包', () => {
    const matrix = packEmbeddingMatrix(
      [new Float32Array([1, 2]), new Float32Array([3, 4])],
      2,
    )
    expect(Array.from(matrix)).toEqual([1, 2, 3, 4])
  })

  it('维度不符的向量留为全 0 行', () => {
    const matrix = packEmbeddingMatrix([new Float32Array([1, 2]), new Float32Array([9])], 2)
    expect(Array.from(matrix)).toEqual([1, 2, 0, 0])
  })

  it('接受普通 number[] 输入', () => {
    const matrix = packEmbeddingMatrix([[0.5, -0.5]], 2)
    expect(Array.from(matrix)).toEqual([0.5, -0.5])
  })
})

describe('findTopSimilarIndices', () => {
  const matrix = packEmbeddingMatrix(
    [
      [1, 0], // 与查询同向，相似度 1
      [0, 1], // 正交，相似度 0
      [-1, 0], // 反向，相似度 -1
      [0.9, 0.1],
    ],
    2,
  )

  it('返回按相似度降序的行号', () => {
    const hits = findTopSimilarIndices(new Float32Array([1, 0]), matrix, 2, 4, -Infinity)
    expect(hits.map((h) => h.index)).toEqual([0, 3, 1, 2])
    expect(hits[0].similarity).toBeCloseTo(1)
    expect(hits[2].similarity).toBeCloseTo(0)
    expect(hits[3].similarity).toBeCloseTo(-1)
  })

  it('topK 与 minSimilarity 生效', () => {
    const hits = findTopSimilarIndices(new Float32Array([1, 0]), matrix, 2, 2, 0.5)
    expect(hits).toHaveLength(2)
    expect(hits.every((h) => h.similarity >= 0.5)).toBe(true)
  })

  it('全 0 行（打包时维度不符）不会出现在结果里', () => {
    const withZeroRow = packEmbeddingMatrix([[1, 0], [9]], 2)
    const hits = findTopSimilarIndices(new Float32Array([1, 0]), withZeroRow, 2, 5, -Infinity)
    expect(hits.map((h) => h.index)).toEqual([0])
  })

  it('查询向量维度不匹配时返回空', () => {
    expect(findTopSimilarIndices(new Float32Array([1, 0, 0]), matrix, 2, 5, 0)).toEqual([])
  })

  it('零向量查询返回空', () => {
    expect(findTopSimilarIndices(new Float32Array([0, 0]), matrix, 2, 5, 0)).toEqual([])
  })

  it('与逐条 cosineSimilarity 计算结果一致', () => {
    const embeddings = [
      [0.2, 0.8, 0.1],
      [0.9, 0.05, 0.4],
      [0.3, 0.3, 0.3],
    ]
    const query = new Float32Array([0.5, 0.5, 0.5])
    const hits = findTopSimilarIndices(query, packEmbeddingMatrix(embeddings, 3), 3, 3, -Infinity)
    // Float32 精度下与 float64 逐条计算结果应在 1e-6 内一致
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity)
    expect(hits).toHaveLength(3)
  })
})
