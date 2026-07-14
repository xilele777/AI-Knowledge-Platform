<script setup lang="ts">
/**
 * StatCard — 统计数字卡片
 *
 * admin 后台首页/统计分析页的指标卡,与 .panel 同一视觉体系。
 *
 * @example
 * <StatCard label="用户数" :value="42" color="var(--google-blue)" />
 */
interface Props {
  label: string
  value: number | string
  /** 数字颜色(CSS 颜色值,通常为 --google-* 品牌色变量) */
  color?: string
}

withDefaults(defineProps<Props>(), {
  color: 'var(--md-sys-color-on-surface)',
})
</script>

<template>
  <div class="stat-card">
    <div class="stat-card-label">{{ label }}</div>
    <div class="stat-card-value" :style="{ color }">{{ value }}</div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 20px;
  transition: all var(--md-sys-transition-medium) var(--md-sys-motion-easing-standard);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
}

.stat-card-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-large);
  font-weight: 500;
}

.stat-card-value {
  margin-top: 12px;
  font-size: var(--md-sys-typescale-display-small);
  line-height: 1;
  font-weight: 600;
  transition: color var(--md-sys-transition-medium);
}
</style>
