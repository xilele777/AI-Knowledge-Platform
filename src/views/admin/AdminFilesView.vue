<script setup lang="ts">
import { ref } from 'vue'
import { getAdminKnowledgeFiles, type AdminKnowledgeFileItem } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminKnowledgeFileItem[]>([])

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(size: number | null): string {
  if (size === null || size < 0) {
    return '-'
  }

  if (size < 1024) {
    return `${size} B`
  }

  const kb = size / 1024
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`
  }

  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

const loadFiles = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminKnowledgeFiles(200)

  if (!result.success) {
    rows.value = []
    errorMessage.value = result.error || '获取文件列表失败'
    loading.value = false
    return
  }

  rows.value = result.data || []
  loading.value = false
}

void loadFiles()
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">文件管理</h2>
      </div>
      <el-button :loading="loading" @click="loadFiles">刷新</el-button>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <el-card shadow="never">
      <div v-loading="loading">
        <el-empty v-if="!loading && rows.length === 0" description="暂无文件数据" />

        <el-table v-else :data="rows" border stripe>
          <el-table-column prop="fileName" label="文件名" min-width="200" />
          <el-table-column label="状态" min-width="100">
            <template #default="scope">
              <el-tag size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="大小" min-width="100">
            <template #default="scope">
              {{ formatSize(scope.row.fileSize) }}
            </template>
          </el-table-column>
          <el-table-column label="类型" min-width="120">
            <template #default="scope">
              {{ scope.row.mimeType || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="更新时间" min-width="160">
            <template #default="scope">
              {{ formatDate(scope.row.updatedAt) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 4px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: #1f2a37;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.error-alert {
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
