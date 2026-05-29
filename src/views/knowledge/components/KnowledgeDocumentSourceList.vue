<script setup lang="ts">
import type { KnowledgeDocumentSource } from '../../../types/knowledge'

const props = defineProps<{
  loading: boolean
  items: KnowledgeDocumentSource[]
}>()

const emit = defineEmits<{
  (e: 'remove', knowledgeBaseId: string, documentId: string): void
}>()

function formatDate(dateText: string | null): string {
  if (!dateText) {
    return '-'
  }

  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN')
}

function handleRemove(knowledgeBaseId: string, documentId: string) {
  emit('remove', knowledgeBaseId, documentId)
}
</script>

<template>
  <div v-loading="props.loading">
    <el-empty v-if="!props.loading && props.items.length === 0" description="暂无站内文档来源" :image-size="80" />

    <el-table v-else :data="props.items" border stripe>
      <el-table-column prop="title" label="文档标题" min-width="220" />
      <el-table-column label="文档状态" width="120">
        <template #default="scope">
          {{ scope.row.documentStatus || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="切片数" width="100">
        <template #default="scope">
          {{ scope.row.chunkCount }}
        </template>
      </el-table-column>
      <el-table-column label="最后同步" min-width="180">
        <template #default="scope">
          {{ formatDate(scope.row.lastSyncedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="文档ID" min-width="260">
        <template #default="scope">
          <span class="doc-id">{{ scope.row.documentId }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="scope">
          <el-button type="danger" link size="small" @click="handleRemove(scope.row.knowledgeBaseId, scope.row.documentId)">
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.doc-id {
  color: #606266;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
</style>
