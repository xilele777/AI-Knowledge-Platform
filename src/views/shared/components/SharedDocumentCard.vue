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
  border: 1px solid #e6edf6;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.shared-doc-card:hover {
  transform: translateY(-2px);
  border-color: #409eff;
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
  font-size: 16px;
  color: #1f2a37;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  color: #6b7280;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shared-time {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e6edf6;
  color: #909399;
  font-size: 12px;
}

.view-hint {
  margin-top: 12px;
  text-align: right;
}
</style>
