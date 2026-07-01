<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentListItem } from '../../../types/document'

const props = defineProps<{
  item: DocumentListItem
}>()

const emit = defineEmits<{
  open: [id: string]
}>()

const formattedTime = computed(() => {
  const date = new Date(props.item.updatedAt)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const formattedSharedTime = computed(() => {
  if (!props.item.sharedAt) return ''
  const date = new Date(props.item.sharedAt)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
})

const handleOpen = () => {
  emit('open', props.item.id)
}
</script>

<template>
  <el-card class="shared-doc-card" shadow="hover" @click="handleOpen">
    <div class="doc-header">
      <h3 class="doc-title" :title="item.title">{{ item.title }}</h3>
      <el-tag size="small" type="success">共享</el-tag>
    </div>

    <div class="doc-meta">
      <span v-if="item.ownerName">作者: {{ item.ownerName }}</span>
      <span>最近更新: {{ formattedTime }}</span>
    </div>

    <div v-if="formattedSharedTime" class="shared-time">
      共享于: {{ formattedSharedTime }}
    </div>

    <div class="view-hint">
      <el-button type="primary" link size="small" @click.stop="handleOpen">
        查看详情 →
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
.shared-doc-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.shared-doc-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--md-sys-color-primary);
  opacity: 0;
  transition: opacity var(--md-sys-transition-medium) ease;
  border-radius: 0 2px 2px 0;
}

.shared-doc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
  border-color: var(--md-sys-color-outline);
}

.shared-doc-card:hover::before {
  opacity: 1;
}

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.doc-title {
  margin: 0;
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shared-time {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-outline);
  font-size: var(--md-sys-typescale-label-medium);
}

.view-hint {
  margin-top: 12px;
  text-align: right;
}
</style>
