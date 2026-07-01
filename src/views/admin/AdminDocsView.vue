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
          <el-table-column prop="title" label="标题" min-width="240" />
          <el-table-column label="状态" min-width="100">
            <template #default="scope">
              <el-tag size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="作者" min-width="140">
            <template #default="scope">
              {{ scope.row.authorName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="作者邮箱" min-width="180">
            <template #default="scope">
              {{ scope.row.authorEmail || '-' }}
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
  font-size: var(--md-sys-typescale-headline-small);
  color: var(--md-sys-color-on-surface);
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
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
