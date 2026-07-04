/**
 * 前端运行时错误监控。
 *
 * 三处捕获入口：
 * - window 'error'：同步脚本错误
 * - window 'unhandledrejection'：未处理的 Promise 拒绝（异步错误的主要来源）
 * - Vue app.config.errorHandler：组件渲染/生命周期/侦听器错误（附组件名与阶段信息）
 *
 * 复用埋点管道（analytics_events 表）上报 fe_error 事件；
 * 会话内按错误指纹去重限频 + 总量封顶，防止错误风暴刷库。
 * 监控自身绝不能成为新的错误源：所有上报路径静默容错。
 */
import type { App, ComponentPublicInstance } from 'vue'
import { ANALYTICS_EVENTS } from '../constants/analyticsEvents'
import { track } from './tracker'

/** 同一指纹（message 前缀）最多上报次数 */
const MAX_PER_FINGERPRINT = 3
/** 会话总上报上限 */
const MAX_TOTAL = 30

const MESSAGE_LIMIT = 500
const STACK_LINE_LIMIT = 10
const STACK_CHAR_LIMIT = 2000

const fingerprintCounts = new Map<string, number>()
let totalReported = 0

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit) + '…'
}

function normalizeStack(stack: string | undefined | null): string | null {
  if (!stack) {
    return null
  }

  return truncate(stack.split('\n').slice(0, STACK_LINE_LIMIT).join('\n'), STACK_CHAR_LIMIT)
}

function reportError(input: {
  source: 'window_error' | 'unhandled_rejection' | 'vue_error_handler'
  message: string
  stack?: string | null
  component?: string | null
  vueInfo?: string | null
}): void {
  try {
    const message = truncate(input.message || 'unknown error', MESSAGE_LIMIT)
    const fingerprint = `${input.source}:${message.slice(0, 120)}`

    const count = fingerprintCounts.get(fingerprint) ?? 0
    if (count >= MAX_PER_FINGERPRINT || totalReported >= MAX_TOTAL) {
      return
    }
    fingerprintCounts.set(fingerprint, count + 1)
    totalReported += 1

    void track(ANALYTICS_EVENTS.FE_ERROR, {
      source: input.source,
      message,
      stack: normalizeStack(input.stack),
      component: input.component ?? null,
      vue_info: input.vueInfo ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
  } catch {
    // 监控自身异常静默吞掉
  }
}

function resolveComponentName(instance: ComponentPublicInstance | null): string | null {
  if (!instance) {
    return null
  }

  const type = instance.$options as { name?: string; __name?: string; __file?: string }
  return type.name ?? type.__name ?? type.__file ?? null
}

/** 在 main.ts 调用一次；返回值用于测试环境手动解绑（业务代码无需关心） */
export function initErrorMonitor(app: App): void {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('error', (event) => {
    // 资源加载失败（img/script 标签）没有 error 对象，单独标注
    if (event.error || event.message) {
      reportError({
        source: 'window_error',
        message: event.message || String(event.error),
        stack: event.error instanceof Error ? event.error.stack : null,
      })
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportError({
      source: 'unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason ?? 'unknown rejection'),
      stack: reason instanceof Error ? reason.stack : null,
    })
  })

  const previousHandler = app.config.errorHandler
  app.config.errorHandler = (err, instance, info) => {
    reportError({
      source: 'vue_error_handler',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
      component: resolveComponentName(instance),
      vueInfo: info,
    })

    if (previousHandler) {
      previousHandler(err, instance, info)
    } else {
      // 保留默认行为：开发时控制台仍能看到完整错误
      console.error(err)
    }
  }
}
