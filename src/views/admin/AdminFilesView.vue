<script setup lang="ts">
import { ref } from 'vue'
import PageContainer from '@/components/shared/PageContainer.vue'
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
  <PageContainer
    width="full"
    class="admin-page"
    title="文件管理"
    description="查看全站知识库上传的文件"
  >
    <template #actions>
      <el-button :loading="loading" @click="loadFiles">刷新</el-button>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div class="panel">
      <div v-loading="loading">
        <el-empty v-if="!loading && rows.length === 0" description="暂无文件数据" />

        <el-table v-else :data="rows">
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
    </div>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}
</style>
