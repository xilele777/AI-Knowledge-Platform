<script setup lang="ts">
import { computed, ref } from 'vue'
import PageContainer from '@/components/shared/PageContainer.vue'
import StatCard from '@/components/shared/StatCard.vue'
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
  <PageContainer
    width="full"
    class="admin-page"
    title="后台首页"
    description="平台核心数据总览"
  >
    <template #actions>
      <el-button :loading="loading" @click="loadStats">刷新</el-button>
    </template>

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

      <div v-else class="stats-grid">
        <StatCard
          v-for="item in cards"
          :key="item.label"
          :label="item.label"
          :value="item.value"
          :color="item.color"
        />
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}

.stats-wrap {
  min-height: 220px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
</style>
