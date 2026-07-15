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
  /** 骨架屏/loading 延迟出现时间(ms)，默认 120ms；在此之前返回则不显示骨架 */
  delayLoadingMs?: number
  /** 骨架屏一旦出现后的最短展示时间(ms)，默认 80ms */
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
  /** 是否展示骨架屏（延迟出现 + 最短存在） */
  showSkeleton: Ref<boolean>
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
  const { initialData = null, delayLoadingMs = 120, minLoadingMs = 80 } = options

  const status = ref<AsyncStatus>('idle')
  const data = ref<T | null>(initialData) as Ref<T | null>
  const error = ref<string | null>(null)
  const showSkeleton = ref(false)
  let loadingDelayTimer: ReturnType<typeof setTimeout> | null = null
  let skeletonShownAt = 0

  const state = computed<AsyncState<T>>(() => ({
    status: status.value,
    data: data.value,
    error: error.value,
  }))

  const isLoading = computed(() => status.value === 'loading' || status.value === 'streaming')

  function clearLoadingDelayTimer() {
    if (loadingDelayTimer) {
      clearTimeout(loadingDelayTimer)
      loadingDelayTimer = null
    }
  }

  function beginLoadingVisual(streaming = false) {
    clearLoadingDelayTimer()
    showSkeleton.value = false
    skeletonShownAt = 0

    if (streaming) {
      return
    }

    if (delayLoadingMs <= 0) {
      showSkeleton.value = true
      skeletonShownAt = Date.now()
      return
    }

    loadingDelayTimer = setTimeout(() => {
      showSkeleton.value = true
      skeletonShownAt = Date.now()
      loadingDelayTimer = null
    }, delayLoadingMs)
  }

  async function finishLoadingVisual(streaming = false) {
    clearLoadingDelayTimer()

    if (streaming || !showSkeleton.value) {
      showSkeleton.value = false
      skeletonShownAt = 0
      return
    }

    const elapsed = Date.now() - skeletonShownAt
    if (elapsed < minLoadingMs) {
      await new Promise((resolve) => setTimeout(resolve, minLoadingMs - elapsed))
    }

    showSkeleton.value = false
    skeletonShownAt = 0
  }

  async function execute(
    fn: () => Promise<T>,
    opts?: { streaming?: boolean },
  ): Promise<T | null> {
    if (opts?.streaming) {
      status.value = 'streaming'
    } else {
      status.value = 'loading'
    }
    error.value = null
    beginLoadingVisual(Boolean(opts?.streaming))

    try {
      const result = await fn()
      await finishLoadingVisual(Boolean(opts?.streaming))

      status.value = 'success'
      data.value = result
      return result
    } catch (err) {
      await finishLoadingVisual(Boolean(opts?.streaming))

      status.value = 'error'
      error.value = err instanceof Error ? err.message : '未知错误'
      return null
    }
  }

  function setStreamingData(newData: T) {
    data.value = newData
  }

  function reset() {
    clearLoadingDelayTimer()
    status.value = 'idle'
    data.value = initialData as T | null
    error.value = null
    showSkeleton.value = false
    skeletonShownAt = 0
  }

  return {
    state,
    status,
    data,
    error,
    isLoading,
    showSkeleton,
    execute,
    setStreamingData,
    reset,
  }
}