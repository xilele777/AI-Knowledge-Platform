import { ref, computed, type Ref, type ComputedRef } from 'vue'

/**
 * 异步操作状态枚举
 *
 * - idle: 初始/重置后
 * - loading: 请求进行中（骨架屏最短展示 200ms 由 execute 内部保证）
 * - success: 请求成功
 * - error: 请求失败（data 可能保留上次成功数据）
 * - streaming: 流式响应中（如 AI 对话），data 持续更新
 */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error' | 'streaming'

export interface AsyncState<T> {
  status: AsyncStatus
  data: T | null
  error: string | null
}

export interface UseAsyncStateOptions<T = unknown> {
  /** 初始数据 */
  initialData?: T | null
  /** 骨架屏/loading 最短展示时间(ms)，防止接口过快导致闪烁。默认 200ms */
  minLoadingMs?: number
}

export interface UseAsyncStateReturn<T> {
  /** 只读状态对象 */
  state: ComputedRef<AsyncState<T>>
  /** 当前状态 */
  status: Ref<AsyncStatus>
  /** 数据 */
  data: Ref<T | null>
  /** 错误信息 */
  error: Ref<string | null>
  /** 是否正在加载（含 streaming） */
  isLoading: ComputedRef<boolean>
  /** 执行异步操作，自动管理状态转换 */
  execute: (fn: () => Promise<T>, opts?: { streaming?: boolean }) => Promise<T | null>
  /** 直接设置流式数据（不改变 status） */
  setStreamingData: (data: T) => void
  /** 重置到 idle */
  reset: () => void
}

/**
 * 统一异步状态管理 composable
 *
 * 替代散落在各组件中的 loading/error/data 布尔值，
 * 内置骨架屏最小展示时间防闪烁机制。
 *
 * @example
 * ```ts
 * const { state, execute, isLoading } = useAsyncState<Document[]>({ initialData: [] })
 *
 * // 基础用法
 * await execute(() => getMyDocuments().then(r => r.data ?? []))
 *
 * // 流式用法
 * execute(() => generateAiText(prompt), { streaming: true })
 * ```
 */
export function useAsyncState<T = unknown>(
  options: UseAsyncStateOptions<T> = {},
): UseAsyncStateReturn<T> {
  const { initialData = null, minLoadingMs = 200 } = options

  const status = ref<AsyncStatus>('idle')
  const data = ref<T | null>(initialData) as Ref<T | null>
  const error = ref<string | null>(null)

  const state = computed<AsyncState<T>>(() => ({
    status: status.value,
    data: data.value,
    error: error.value,
  }))

  const isLoading = computed(() => status.value === 'loading' || status.value === 'streaming')

  async function execute(
    fn: () => Promise<T>,
    opts?: { streaming?: boolean },
  ): Promise<T | null> {
    const startTime = Date.now()

    if (opts?.streaming) {
      status.value = 'streaming'
    } else {
      status.value = 'loading'
    }
    error.value = null

    try {
      const result = await fn()

      // 骨架屏最小展示时间：防止接口过快导致闪烁
      const elapsed = Date.now() - startTime
      if (!opts?.streaming && elapsed < minLoadingMs) {
        await new Promise((resolve) => setTimeout(resolve, minLoadingMs - elapsed))
      }

      status.value = 'success'
      data.value = result
      return result
    } catch (err) {
      // 即使失败也保证最小展示时间
      const elapsed = Date.now() - startTime
      if (!opts?.streaming && elapsed < minLoadingMs) {
        await new Promise((resolve) => setTimeout(resolve, minLoadingMs - elapsed))
      }

      status.value = 'error'
      error.value = err instanceof Error ? err.message : '未知错误'
      return null
    }
  }

  function setStreamingData(newData: T) {
    data.value = newData
  }

  function reset() {
    status.value = 'idle'
    data.value = initialData as T | null
    error.value = null
  }

  return {
    state,
    status,
    data,
    error,
    isLoading,
    execute,
    setStreamingData,
    reset,
  }
}