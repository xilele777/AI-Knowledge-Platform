<script setup lang="ts">
/**
 * SkeletonCard — 骨架屏卡片
 *
 * 替代 v-loading 指令，提供更精细的加载态占位。
 * 配合 useAsyncState 的 minLoadingMs 机制，可避免接口过快导致的闪烁。
 *
 * 三种变体：
 * - card: 卡片网格布局（文档列表、知识库列表）
 * - list: 行列表布局（文件列表、会话列表）
 * - table-row: 表格行布局（管理后台表格）
 *
 * @example
 * <SkeletonCard :count="6" variant="card" />
 * <SkeletonCard :count="3" variant="list" />
 */
interface Props {
  /** 骨架数量 */
  count?: number
  /** 是否播放脉冲动画 */
  animated?: boolean
  /** 变体 */
  variant?: 'card' | 'list' | 'table-row'
}

withDefaults(defineProps<Props>(), {
  count: 3,
  animated: true,
  variant: 'card',
})
</script>

<template>
  <div class="skeleton-container" :class="`skeleton-variant-${variant}`">
    <div
      v-for="i in count"
      :key="i"
      class="skeleton-item"
      :class="{ 'is-animated': animated }"
    >
      <!-- Card 变体 -->
      <template v-if="variant === 'card'">
        <div class="skeleton-block skeleton-card-image" />
        <div class="skeleton-card-body">
          <div class="skeleton-line skeleton-line-title" />
          <div class="skeleton-line skeleton-line-text" />
          <div class="skeleton-line skeleton-line-text skeleton-line-short" />
        </div>
      </template>

      <!-- List 变体 -->
      <template v-else-if="variant === 'list'">
        <div class="skeleton-block skeleton-avatar" />
        <div class="skeleton-list-body">
          <div class="skeleton-line skeleton-line-title" />
          <div class="skeleton-line skeleton-line-text" />
        </div>
      </template>

      <!-- Table-row 变体 -->
      <template v-else-if="variant === 'table-row'">
        <div class="skeleton-line skeleton-cell" />
        <div class="skeleton-line skeleton-cell" />
        <div class="skeleton-line skeleton-cell skeleton-cell-short" />
        <div class="skeleton-line skeleton-cell skeleton-cell-action" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.skeleton-container {
  display: flex;
  flex-direction: column;
}

/* === Card 变体 === */
.skeleton-variant-card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.skeleton-variant-card .skeleton-item {
  display: flex;
  flex-direction: column;
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid var(--md-sys-color-outline-variant);
  overflow: hidden;
  background: var(--md-sys-color-surface-container-lowest);
}

.skeleton-card-image {
  height: 140px;
  border-radius: 0;
}

.skeleton-card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* === List 变体 === */
.skeleton-variant-list {
  gap: 4px;
}

.skeleton-variant-list .skeleton-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--md-sys-shape-corner-small);
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--md-sys-shape-corner-full);
  flex-shrink: 0;
}

.skeleton-list-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* === Table-row 变体 === */
.skeleton-variant-table-row .skeleton-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--md-sys-color-surface-container);
}

.skeleton-cell {
  flex: 1;
  min-width: 0;
  height: 16px;
}

.skeleton-cell-short {
  flex: 0.5;
}

.skeleton-cell-action {
  flex: 0 0 80px;
  height: 28px;
}

/* === 骨架基础样式 === */
.skeleton-block {
  background: var(--md-sys-color-surface-container-highest);
}

.skeleton-line {
  height: 12px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  background: var(--md-sys-color-surface-container-highest);
}

.skeleton-line-title {
  height: 16px;
  width: 60%;
}

.skeleton-line-text {
  width: 100%;
}

.skeleton-line-short {
  width: 40%;
}

/* === 脉冲动画 === */
.is-animated .skeleton-block,
.is-animated .skeleton-line {
  animation: skeleton-pulse 1.8s ease-in-out infinite;
}

.is-animated .skeleton-block:nth-child(2),
.is-animated .skeleton-line:nth-child(2) {
  animation-delay: 0.1s;
}

.is-animated .skeleton-block:nth-child(3),
.is-animated .skeleton-line:nth-child(3) {
  animation-delay: 0.2s;
}

.is-animated .skeleton-block:nth-child(4),
.is-animated .skeleton-line:nth-child(4) {
  animation-delay: 0.3s;
}

@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}
</style>