<script setup lang="ts">
import { ref } from 'vue'
import { getAdminDocuments, type AdminDocumentItem } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminDocumentItem[]>([])

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

const loadDocs = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminDocuments(200)

  if (!result.success) {
    rows.value = []
    errorMessage.value = result.error || '获取文档列表失败'
    loading.value = false
    return
  }

  rows.value = result.data || []
  loading.value = false
}

void loadDocs()
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">文档管理</h2>
        <p class="page-subtitle">展示 documents，并尽量附带作者信息。</p>
      </div>
      <el-button :loading="loading" @click="loadDocs">刷新</el-button>
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
        <el-empty v-if="!loading && rows.length === 0" description="暂无文档数据" />

        <el-table v-else :data="rows" border stripe>
          <el-table-column prop="id" label="文档ID" min-width="220" />
          <el-table-column prop="title" label="标题" min-width="220" />
          <el-table-column label="状态" min-width="120">
            <template #default="scope">
              <el-tag size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="作者" min-width="180">
            <template #default="scope">
              {{ scope.row.authorName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="作者邮箱" min-width="200">
            <template #default="scope">
              {{ scope.row.authorEmail || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="ownerId" label="owner_id" min-width="220" />
          <el-table-column label="更新时间" min-width="180">
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
