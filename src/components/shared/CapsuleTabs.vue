<script setup lang="ts">
/**
 * CapsuleTabs — 胶囊形状标签切换
 *
 * 参考 csustar.com 的标签切换设计：
 * - 选中项填充主题色背景
 * - 未选中项透明
 * - 胶囊形状（大圆角）
 *
 * @example
 * <CapsuleTabs
 *   v-model="activeTab"
 *   :tabs="[
 *     { label: '全部', value: 'all' },
 *     { label: '已发布', value: 'published' },
 *     { label: '草稿', value: 'draft' },
 *   ]"
 *   color="var(--module-docs)"
 * />
 */
interface Tab {
  label: string
  value: string
}

interface Props {
  tabs: Tab[]
  modelValue: string
  color?: string
}

withDefaults(defineProps<Props>(), {
  color: 'var(--module-docs)',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <div class="capsule-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="capsule-tab"
      :class="{ active: tab.value === modelValue }"
      :style="tab.value === modelValue
        ? { backgroundColor: color, color: '#fff', borderColor: color }
        : {}"
      @click="emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.capsule-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.capsule-tab {
  padding: 6px 18px;
  height: 34px;
  border-radius: 9999px;
  border: 1px solid var(--md-sys-color-outline-variant);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-large);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--md-sys-transition-fast) ease;
  white-space: nowrap;
}

.capsule-tab:hover:not(.active) {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-outline);
}

.capsule-tab.active {
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}
</style>