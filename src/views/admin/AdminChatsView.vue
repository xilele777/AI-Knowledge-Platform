<script setup lang="ts">
import { ref } from 'vue'
import { getAdminChatRecords, type AdminChatRecordItem } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminChatRecordItem[]>([])

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

const loadChats = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminChatRecords(200)

  if (!result.success) {
    rows.value = []
    errorMessage.value = result.error || '获取问答记录失败'
    loading.value = false
    return
  }

  rows.value = result.data || []
  loading.value = false
}

void loadChats()
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">问答管理</h2>
        <p class="page-subtitle">展示问答会话中的问题与回答记录。</p>
      </div>
      <el-button :loading="loading" @click="loadChats">刷新</el-button>
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
        <el-empty v-if="!loading && rows.length === 0" description="暂无问答记录" />

        <el-table v-else :data="rows" border stripe>
          <el-table-column prop="chatId" label="会话ID" min-width="220" />
          <el-table-column prop="title" label="会话标题" min-width="150" />
          <el-table-column prop="ownerId" label="owner_id" min-width="220" />
          <el-table-column label="问题" min-width="300" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.question }}
            </template>
          </el-table-column>
          <el-table-column label="回答" min-width="360" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.answer || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="时间" min-width="180">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
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
