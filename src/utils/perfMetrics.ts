/**
 * 运行时性能度量。
 *
 * 两条线：
 * 1. Web Vitals（LCP / CLS / INP 近似值）：PerformanceObserver 采集，
 *    页面首次隐藏时一次性上报——构建产物体积（-44%）只是实验室指标，
 *    这里补上真实用户的现场指标（RUM）。
 * 2. AI 问答链路分段计时：检索耗时 / 首 token 延迟（TTFT）/ 流式总时长，
 *    同时写 performance.mark/measure（DevTools Performance 面板可见）
 *    并经埋点管道入库，供后台分析 P50/P95。
 *
 * 全部防御式实现：PerformanceObserver 不可用（旧浏览器 / 测试环境）时
 * 静默退化为空操作，绝不影响业务流程。
 */
import { ANALYTICS_EVENTS } from '../constants/analyticsEvents'
import { track } from './tracker'

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

interface EventTimingEntry extends PerformanceEntry {
  interactionId?: number
}

function observe(
  type: string,
  callback: (entries: PerformanceEntry[]) => void,
  extraInit: Record<string, unknown> = {},
): PerformanceObserver | null {
  if (typeof PerformanceObserver === 'undefined') {
    return null
  }

  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()))
    observer.observe({ type, buffered: true, ...extraInit } as PerformanceObserverInit)
    return observer
  } catch {
    // 浏览器不支持该 entry type
    return null
  }
}

/**
 * 采集 Web Vitals 并在页面首次隐藏时一次性上报。
 * 在 main.ts 调用一次。
 */
export function initWebVitalsReporting(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  let lcp = 0
  let cls = 0
  let maxInteractionDelay = 0
  let reported = false

  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1]
    if (last) {
      lcp = last.startTime
    }
  })

  observe('layout-shift', (entries) => {
    for (const entry of entries) {
      const shift = entry as LayoutShiftEntry
      if (!shift.hadRecentInput) {
        cls += shift.value
      }
    }
  })

  // INP 近似：取有 interactionId 的事件的最大 duration
  //（标准 INP 是 p98，客户端简化为 max，量级参考足够）
  observe(
    'event',
    (entries) => {
      for (const entry of entries) {
        const timing = entry as EventTimingEntry
        if (timing.interactionId && entry.duration > maxInteractionDelay) {
          maxInteractionDelay = entry.duration
        }
      }
    },
    { durationThreshold: 40 },
  )

  function report() {
    if (reported) {
      return
    }
    reported = true

    // 页面隐藏时上报可能来不及完成网络请求，尽力而为（埋点本身写失败即静默丢弃）
    void track(ANALYTICS_EVENTS.PERF_WEB_VITALS, {
      lcp_ms: Math.round(lcp),
      cls: Number(cls.toFixed(4)),
      inp_approx_ms: Math.round(maxInteractionDelay),
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      report()
    }
  })
  window.addEventListener('pagehide', report)
}

// ─── AI 问答链路分段计时 ───

export type QaPerfStage = 'retrieval_done' | 'first_token' | 'stream_done'

export interface QaPerfTimeline {
  lap(stage: QaPerfStage): void
  /** 结束计时并上报；分段缺失（如出错提前结束）时对应字段为 null */
  finish(extra?: Record<string, unknown>): void
}

let qaSeq = 0

export function startQaTimeline(): QaPerfTimeline {
  qaSeq += 1
  const id = qaSeq
  const start = performance.now()
  const laps = new Map<QaPerfStage, number>()

  function mark(name: string) {
    try {
      performance.mark(`qa:${id}:${name}`)
    } catch {
      // performance.mark 不可用时忽略，不影响耗时统计
    }
  }

  function measure(name: string, fromMark: string, toMark: string) {
    try {
      performance.measure(`qa:${id}:${name}`, `qa:${id}:${fromMark}`, `qa:${id}:${toMark}`)
    } catch {
      // 起止 mark 缺失（分段被跳过）时忽略
    }
  }

  mark('start')

  return {
    lap(stage) {
      if (!laps.has(stage)) {
        laps.set(stage, performance.now())
        mark(stage)
      }
    },
    finish(extra = {}) {
      const retrievalDone = laps.get('retrieval_done') ?? null
      const firstToken = laps.get('first_token') ?? null
      const streamDone = laps.get('stream_done') ?? null

      measure('retrieval', 'start', 'retrieval_done')
      measure('ttft', 'retrieval_done', 'first_token')
      measure('stream', 'first_token', 'stream_done')

      void track(ANALYTICS_EVENTS.QA_PERF, {
        // 检索耗时：提问 → 检索完成（含切片取数 + 向量/关键词评分）
        retrieval_ms: retrievalDone === null ? null : Math.round(retrievalDone - start),
        // 首 token 延迟：检索完成 → 第一个流式 chunk 到达
        ttft_ms:
          firstToken === null
            ? null
            : Math.round(firstToken - (retrievalDone ?? start)),
        // 流式时长：首 token → 流结束
        stream_ms:
          streamDone === null || firstToken === null
            ? null
            : Math.round(streamDone - firstToken),
        total_ms: Math.round(performance.now() - start),
        ...extra,
      })
    },
  }
}
