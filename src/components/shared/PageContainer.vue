<script setup lang="ts">
/**
 * PageContainer — 统一页面容器 + 紧凑页头
 *
 * 全站整页滚动页面的唯一骨架：负责内容宽度档位与标题排版。
 * fullBleed 页面（chat / 编辑器）不使用本组件。
 *
 * @example
 * <PageContainer width="default" title="我的文档" description="管理和编辑你的所有文档">
 *   <template #actions><el-button type="primary">新建文档</el-button></template>
 *   ...内容...
 * </PageContainer>
 */
interface Props {
  /** 内容宽度档位：narrow=720（阅读/表单）、default=1120（列表）、full=100%（数据表格） */
  width?: 'narrow' | 'default' | 'full'
  title?: string
  description?: string
  /** 标题附加 class（如 gradient-text） */
  titleClass?: string
}

withDefaults(defineProps<Props>(), {
  width: 'default',
})
</script>

<template>
  <div class="page-container" :class="`page-container--${width}`">
    <header v-if="title || $slots.actions" class="page-head">
      <div class="page-head-text">
        <h1 v-if="title" class="page-head-title" :class="titleClass">{{ title }}</h1>
        <p v-if="description" class="page-head-desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="page-head-actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.page-container {
  margin: 0 auto;
  width: 100%;
}

.page-container--narrow {
  max-width: var(--page-width-narrow);
}

.page-container--default {
  max-width: var(--page-width-default);
}

.page-container--full {
  max-width: none;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 32px;
}

.page-head-text {
  min-width: 0;
}

.page-head-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--md-sys-color-on-background);
  line-height: 1.25;
}

.page-head-desc {
  margin: 4px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
  max-width: 560px;
}

.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }

  .page-head-actions {
    justify-content: flex-end;
  }
}
</style>
