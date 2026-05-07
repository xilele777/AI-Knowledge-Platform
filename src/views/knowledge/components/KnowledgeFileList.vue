<script setup lang="ts">
import type { KnowledgeFileListItem } from '../../../types/knowledge'

const props = defineProps<{
  loading: boolean
  files: KnowledgeFileListItem[]
}>()

const emit = defineEmits<{
  (e: 'remove', fileId: string): void
}>()

function getStatusTagType(status: string): 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'processing') {
    return 'warning'
  }

  if (status === 'done') {
    return 'success'
  }

  if (status === 'failed') {
    return 'danger'
  }

  return 'info'
}

function formatBytes(size: number | null): string {
  if (!size || size < 0) {
    return '-'
  }

  if (size < 1024) {
    return String(size) + ' B'
  }

  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(2) + ' KB'
  }

  if (size < 1024 * 1024 * 1024) {
    return (size / 1024 / 1024).toFixed(2) + ' MB'
  }

  return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function formatDate(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN')
}

function handleRemove(fileId: string) {
  emit('remove', fileId)
}
</script>

<template>
  <div v-loading="props.loading">
    <el-empty v-if="!props.loading && props.files.length === 0" description="暂无文件" :image-size="80" />

    <el-table v-else :data="props.files" border stripe>
      <el-table-column prop="fileName" label="文件名" min-width="220" />
      <el-table-column label="状态" width="120">
        <template #default="scope">
          <el-tag size="small" :type="getStatusTagType(scope.row.status)">{{ scope.row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="mimeType" label="MIME" min-width="170">
        <template #default="scope">
          {{ scope.row.mimeType || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="大小" width="140">
        <template #default="scope">
          {{ formatBytes(scope.row.fileSize) }}
        </template>
      </el-table-column>
      <el-table-column label="上传时间" min-width="180">
        <template #default="scope">
          {{ formatDate(scope.row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="scope">
          <el-button type="danger" link @click="handleRemove(scope.row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
