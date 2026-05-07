<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentListItem } from '../../../types/document'

const props = defineProps<{
  item: DocumentListItem
}>()

const emit = defineEmits<{
  open: [id: string]
  remove: [id: string]
}>()

const statusType = computed(() => {
  if (props.item.status === 'published') {
    return 'success'
  }

  if (props.item.status === 'archived') {
    return 'info'
  }

  return 'warning'
})

const statusText = computed(() => {
  if (props.item.status === 'published') {
    return '已发布'
  }

  if (props.item.status === 'archived') {
    return '已归档'
  }

  return '草稿'
})

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

const handleOpen = () => {
  emit('open', props.item.id)
}

const handleRemove = () => {
  emit('remove', props.item.id)
}
</script>

<template>
  <el-card class="doc-card" shadow="hover" @click="handleOpen">
    <div class="doc-header">
      <h3 class="doc-title" :title="item.title">{{ item.title }}</h3>
      <el-tag size="small" :type="statusType">{{ statusText }}</el-tag>
    </div>

    <div class="doc-meta">最近更新：{{ formattedTime }}</div>

    <div class="doc-actions" @click.stop>
      <el-button type="primary" link @click="handleOpen">编辑</el-button>
      <el-button type="danger" link @click="handleRemove">删除</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.doc-card {
  border: 1px solid #e6edf6;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.doc-card:hover {
  transform: translateY(-2px);
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
}

.doc-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
