import { onUnmounted } from 'vue'

/**
 * 通用防抖 composable
 *
 * 用于搜索输入、窗口 resize 等高频触发场景。
 * 支持手动 cancel 和 flush。
 *
 * @example
 * ```ts
 * const { debouncedFn, cancel } = useDebounce((keyword: string) => {
 *   search(keyword)
 * }, 300)
 *
 * // 在模板中
 * <input @input="e => debouncedFn(e.target.value)" />
 * ```
 */
export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay = 300,
) {
  let timer: ReturnType<typeof setTimeout> | null = null

  /** 缓存最后一次调用参数，用于 flush */
  let lastArgs: Parameters<T> | null = null

  function debouncedFn(...args: Parameters<T>) {
    lastArgs = args
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      fn(...args)
      timer = null
      lastArgs = null
    }, delay)
  }

  /** 取消防抖，不执行 */
  function cancel() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    lastArgs = null
  }

  /** 立即执行最后一次被防抖的调用 */
  function flush() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (lastArgs !== null) {
      fn(...lastArgs)
      lastArgs = null
    }
  }

  /** 组件卸载时自动清理 */
  onUnmounted(() => {
    cancel()
  })

  return { debouncedFn, cancel, flush }
}