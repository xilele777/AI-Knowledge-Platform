import { describe, it } from 'vitest'
import { splitStreamingMarkdown } from '../streamingMarkdown'
import { findTopSimilarIndices, packEmbeddingMatrix } from '../similarity'

const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const runPerfBench = runtimeEnv?.RUN_PERF_BENCH === '1'
const describePerf = runPerfBench ? describe : describe.skip

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function randomVector(dim: number, seed: number): Float32Array {
  const vector = new Float32Array(dim)
  let state = seed || 1
  for (let i = 0; i < dim; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    vector[i] = state / 0xffffffff
  }
  return vector
}

function buildLongMarkdown(blocks: number): string {
  return Array.from({ length: blocks }, (_, index) => [
    `## 模块 ${index + 1}`,
    '',
    '这是一段用于模拟 AI 长回答的 Markdown 内容，包含普通段落、列表和代码块。',
    '',
    '- 关键结论一',
    '- 关键结论二',
    '- 关键结论三',
    '',
    '```ts',
    `const value${index} = ${index}`,
    'console.log(value)',
    '```',
    '',
  ].join('\n')).join('\n')
}

describePerf('manual frontend performance benchmarks', () => {
  it('vector matrix similarity benchmark', () => {
    const dim = 1536
    const counts = [100, 500, 1000, 2000]
    const repeats = 5
    const rows: Array<Record<string, number>> = []

    for (const count of counts) {
      const packRuns: number[] = []
      const searchRuns: number[] = []
      const totalRuns: number[] = []
      const embeddings = Array.from({ length: count }, (_, index) => randomVector(dim, index + 1))
      const query = randomVector(dim, 999)

      for (let run = 0; run < repeats; run += 1) {
        const t0 = performance.now()
        const matrix = packEmbeddingMatrix(embeddings, dim)
        const t1 = performance.now()
        findTopSimilarIndices(query, matrix, dim, 8, 0.1)
        const t2 = performance.now()

        packRuns.push(t1 - t0)
        searchRuns.push(t2 - t1)
        totalRuns.push(t2 - t0)
      }

      rows.push({
        count,
        dim,
        pack_ms_median: Math.round(median(packRuns)),
        search_ms_median: Math.round(median(searchRuns)),
        total_ms_median: Math.round(median(totalRuns)),
      })
    }

    console.table(rows)
  })

  it('streaming markdown split benchmark', () => {
    const blockCounts = [50, 150, 300]
    const repeats = 5
    const rows: Array<Record<string, number>> = []

    for (const blocks of blockCounts) {
      const markdown = buildLongMarkdown(blocks)
      const step = 240
      const snapshots: string[] = []
      for (let i = 0; i < markdown.length; i += step) {
        snapshots.push(markdown.slice(0, i + step))
      }

      const runs: number[] = []
      for (let run = 0; run < repeats; run += 1) {
        const t0 = performance.now()
        for (const snapshot of snapshots) {
          splitStreamingMarkdown(snapshot)
        }
        const t1 = performance.now()
        runs.push(t1 - t0)
      }

      const total = median(runs)
      rows.push({
        blocks,
        chars: markdown.length,
        updates: snapshots.length,
        total_ms_median: Math.round(total),
        avg_update_ms: Number((total / snapshots.length).toFixed(3)),
      })
    }

    console.table(rows)
  })
})
