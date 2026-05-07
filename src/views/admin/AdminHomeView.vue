<script setup lang="ts">
import { computed, ref } from 'vue'
import { getAdminDashboardStats, type AdminDashboardStats } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const stats = ref<AdminDashboardStats | null>(null)

const cards = computed(() => {
  const value = stats.value

  return [
    { label: '用户数', value: value?.userCount ?? 0 },
    { label: '文档数', value: value?.documentCount ?? 0 },
    { label: '文件数', value: value?.fileCount ?? 0 },
    { label: '会话数', value: value?.chatCount ?? 0 },
    { label: '消息数', value: value?.messageCount ?? 0 },
  ]
})

const isAllZero = computed(() => cards.value.every((item) => item.value === 0))

const loadStats = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminDashboardStats()

  if (!result.success || !result.data) {
    stats.value = null
    errorMessage.value = result.error || '获取统计数据失败'
    loading.value = false
    return
  }

  stats.value = result.data
  loading.value = false
}

void loadStats()
</script>

<template>
  <div class="admin-home-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">后台首页</h2>
        <p class="page-subtitle">查看用户、文档、文件和问答基础统计数据。</p>
      </div>
      <el-button :loading="loading" @click="loadStats">刷新</el-button>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div v-loading="loading" class="stats-wrap">
      <el-empty
        v-if="!loading && !errorMessage && isAllZero"
        description="暂无统计数据"
      />

      <el-row v-else :gutter="16">
        <el-col v-for="item in cards" :key="item.label" :xs="24" :sm="12" :lg="8">
          <el-card shadow="hover" class="stat-card">
            <div class="stat-label">{{ item.label }}</div>
            <div class="stat-value">{{ item.value }}</div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.admin-home-page {
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

.stats-wrap {
  min-height: 220px;
}

.stat-card {
  border: 1px solid #e6edf6;
}

.stat-label {
  color: #6b7280;
  font-size: 13px;
}

.stat-value {
  margin-top: 10px;
  font-size: 30px;
  line-height: 1;
  font-weight: 700;
  color: #111827;
}

:deep(.el-col) {
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
