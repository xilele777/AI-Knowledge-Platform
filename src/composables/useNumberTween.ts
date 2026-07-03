import { ref, watch, type Ref } from 'vue'

/**
 * 数字滚动动画 composable
 *
 * 使用 requestAnimationFrame + easeOutExpo 缓动，
 * 实现数字从当前值平滑过渡到目标值。
 *
 * @example
 * ```ts
 * const target = ref(0)
 * const { displayValue } = useNumberTween(target, 800)
 * // 当 target.value 变化时，displayValue 从旧值平滑滚动到新值
 * ```
 */
export function useNumberTween(
  target: Ref<number>,
  duration = 800,
) {
  const displayValue = ref(0)
  let animationId: ReturnType<typeof requestAnimationFrame> | null = null
  let currentValue = 0

  function easeOutExpo(t: number): number {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
  }

  function animate(from: number, to: number) {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
    }

    const startTime = performance.now()
    const diff = to - from

    function step(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)
      currentValue = from + diff * eased
      displayValue.value = Math.round(currentValue)

      if (progress < 1) {
        animationId = requestAnimationFrame(step)
      }
    }

    animationId = requestAnimationFrame(step)
  }

  watch(
    target,
    (newVal) => {
      animate(currentValue, newVal)
    },
    { immediate: true },
  )

  return { displayValue }
}