<script setup lang="ts">
/**
 * Sparkline — 极简微型趋势折线图
 *
 * 无坐标轴、无标签，仅展示数据趋势。
 * 适用于 Dashboard 统计卡片中"本周趋势"等场景。
 *
 * @example
 * <Sparkline :data="[10, 15, 12, 20, 18, 25, 30]" color="var(--accent-emerald)" />
 */
import { computed } from 'vue'

interface Props {
  /** 数据点数组 */
  data: number[]
  /** 折线颜色 */
  color?: string
  /** SVG 高度 */
  height?: number
  /** 是否填充下方区域 */
  fill?: boolean
  /** 线宽 */
  strokeWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: 'var(--md-sys-color-primary)',
  height: 40,
  fill: false,
  strokeWidth: 1.5,
})

const width = 80

const path = computed(() => {
  const points = props.data
  if (points.length < 2) return ''

  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const h = props.height
  const stepX = width / (points.length - 1)

  let d = `M 0 ${h - ((points[0] - min) / range) * h}`

  for (let i = 1; i < points.length; i++) {
    const x = i * stepX
    const y = h - ((points[i] - min) / range) * h
    d += ` L ${x} ${y}`
  }

  return d
})

const fillPath = computed(() => {
  if (!props.fill) return ''
  const linePath = path.value
  if (!linePath) return ''
  return `${linePath} L ${width} ${props.height} L 0 ${props.height} Z`
})

const viewBox = computed(() => `0 0 ${width} ${props.height}`)
</script>

<template>
  <svg
    class="sparkline"
    :viewBox="viewBox"
    :width="width"
    :height="height"
    preserveAspectRatio="none"
  >
    <path
      v-if="fill && fillPath"
      :d="fillPath"
      :fill="color"
      fill-opacity="0.1"
    />
    <path
      :d="path"
      :stroke="color"
      :stroke-width="strokeWidth"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  overflow: visible;
}
</style>