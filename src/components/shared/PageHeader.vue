<script setup lang="ts">
/**
 * PageHeader — 统一页面标题栏
 *
 * 替代各页面手写的 <div class="page-header">，
 * 保证标题、副标题、操作区的一致排版。
 *
 * @example
 * <PageHeader title="我的文档" subtitle="管理和编辑你的所有文档">
 *   <el-button type="primary">新建文档</el-button>
 * </PageHeader>
 */
interface Props {
  title: string
  subtitle?: string
}

defineProps<Props>()
</script>

<template>
  <div class="page-header">
    <div class="page-header-text">
      <h1 class="page-header-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-header-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="page-header-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 32px;
}

.page-header-text {
  min-width: 0;
}

.page-header-title {
  margin: 0;
  font-size: var(--md-sys-typescale-display-small);
  font-weight: 500;
  letter-spacing: -0.5px;
  color: var(--md-sys-color-on-background);
  line-height: 1.2;
}

.page-header-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-large);
  max-width: 560px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-header-title {
    font-size: var(--md-sys-typescale-headline-medium);
  }

  .page-header-actions {
    justify-content: flex-end;
  }
}
</style>