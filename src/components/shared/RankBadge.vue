<script setup lang="ts">
/**
 * RankBadge — 排名徽章
 *
 * 参考 csustar.com 排行榜的金银铜排名徽章：
 * - 前 3 名：金/银/铜色圆形背景
 * - 4+ 名：灰色圆形背景
 *
 * @example
 * <RankBadge :rank="1" />
 * <RankBadge :rank="2" :size="32" />
 */
import { computed } from 'vue'

interface Props {
  rank: number
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 28,
})

const badgeStyle = computed(() => {
  const colors: Record<number, { bg: string; text: string }> = {
    1: { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#fff' },
    2: { bg: 'linear-gradient(135deg, #94a3b8, #64748b)', text: '#fff' },
    3: { bg: 'linear-gradient(135deg, #d97706, #b45309)', text: '#fff' },
  }

  const c = colors[props.rank] ?? { bg: 'var(--md-sys-color-surface-container-high)', text: 'var(--md-sys-color-on-surface-variant)' }

  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    background: c.bg,
    color: c.text,
    fontSize: `${props.size * 0.45}px`,
  }
})
</script>

<template>
  <span class="rank-badge" :style="badgeStyle">
    {{ rank }}
  </span>
</template>

<style scoped>
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  flex-shrink: 0;
  user-select: none;
  box-shadow: var(--shadow-sm);
}
</style>