<script setup lang="ts">
import { computed, ref } from 'vue'
import { getAdminDashboardStats, type AdminDashboardStats } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const stats = ref<AdminDashboardStats | null>(null)

const cards = computed(() => {
  const value = stats.value

  return [
    { label: '用户数', value: value?.userCount ?? 0, color: 'var(--google-blue)' },
    { label: '文档数', value: value?.documentCount ?? 0, color: 'var(--google-green)' },
    { label: '文件数', value: value?.fileCount ?? 0, color: 'var(--google-yellow)' },
    { label: '会话数', value: value?.chatCount ?? 0, color: 'var(--google-red)' },
    { label: '消息数', value: value?.messageCount ?? 0, color: 'var(--google-purple)' },
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
          <el-card class="stat-card">
            <div class="stat-label">{{ item.label }}</div>
            <div class="stat-value" :style="{ color: item.color }">{{ item.value }}</div>
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
  color: var(--md-sys-color-on-background);
  font-weight: 400;
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
}

.error-alert {
  margin-bottom: 12px;
}

.stats-wrap {
  min-height: 220px;
}

.stat-card {
  border: none;
  background-color: var(--md-sys-color-surface-container-low);
  transition: all var(--md-sys-transition-medium) var(--md-sys-motion-easing-standard);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
}

.stat-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
  font-weight: 500;
}

.stat-value {
  margin-top: 12px;
  font-size: 36px;
  line-height: 1;
  font-weight: 600;
  transition: color var(--md-sys-transition-medium);
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
