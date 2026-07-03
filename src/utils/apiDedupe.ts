/**
 * API 请求去重工具
 *
 * 同一 key 的请求在飞行中（in-flight）不会重复发送，
 * 所有调用者共享同一个 Promise 结果。
 *
 * @example
 * ```ts
 * import { apiDedupe } from '@/utils/apiDedupe'
 *
 * // 即使快速连续调用 3 次，也只发送 1 次请求
 * await apiDedupe.dedupe('get-my-docs', () => getMyDocuments())
 * ```
 */

export function createApiDedupe() {
  const inflight = new Map<string, Promise<unknown>>()

  function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    const promise = fn().finally(() => {
      inflight.delete(key)
    })

    inflight.set(key, promise)
    return promise
  }

  /** 清除所有飞行中的请求（一般不需要） */
  function clear() {
    inflight.clear()
  }

  return { dedupe, clear }
}

/** 全局单例 */
export const apiDedupe = createApiDedupe()