<script setup lang="ts">
/**
 * GradientTitle — 大渐变文字标题 + 英文副标题
 *
 * 参考 csustar.com 页面头部设计：
 * - 大号渐变文字标题（使用 background-clip: text）
 * - 英文副标题（小字、大写、跟踪字间距）
 * - 可选的中文描述文案
 *
 * @example
 * <GradientTitle
 *   title="文档管理"
 *   subtitle="Documents"
 *   description="创建、编辑和管理你的知识文档"
 *   gradient="var(--gradient-blue)"
 * />
 */
interface Props {
  /** 中文标题 */
  title: string
  /** 英文副标题 */
  subtitle: string
  /** 中文描述 */
  description?: string
  /** 渐变 CSS 值 */
  gradient?: string
}

withDefaults(defineProps<Props>(), {
  gradient: 'var(--gradient-warm)',
})
</script>

<template>
  <div class="gradient-title-wrapper">
    <p class="gradient-subtitle">{{ subtitle }}</p>
    <h2
      class="gradient-heading"
      :style="{
        background: gradient,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }"
    >
      {{ title }}
    </h2>
    <p v-if="description" class="gradient-description">{{ description }}</p>
  </div>
</template>

<style scoped>
.gradient-title-wrapper {
  margin-bottom: 40px;
}

.gradient-subtitle {
  font-size: var(--md-sys-typescale-label-small);
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0 0 8px 0;
}

.gradient-heading {
  font-size: var(--md-sys-typescale-display-medium);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -1px;
  margin: 0;
  display: inline-block;
}

.gradient-description {
  margin: 12px 0 0;
  font-size: var(--md-sys-typescale-body-large);
  color: var(--md-sys-color-on-surface-variant);
  max-width: 560px;
}

@media (max-width: 768px) {
  .gradient-heading {
    font-size: var(--md-sys-typescale-display-small);
  }
}
</style>