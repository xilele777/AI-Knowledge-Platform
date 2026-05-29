<script setup lang="ts">
import { ref } from 'vue'
import { getAdminProfiles, type AdminProfileItem } from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminProfileItem[]>([])

function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('zh-CN')
}

const loadUsers = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminProfiles(200)

  if (!result.success) {
    rows.value = []
    errorMessage.value = result.error || '获取用户列表失败'
    loading.value = false
    return
  }

  rows.value = result.data || []
  loading.value = false
}

void loadUsers()
</script>

<template>
  <div class="admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">用户管理</h2>
      </div>
      <el-button :loading="loading" @click="loadUsers">刷新</el-button>
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
        <el-empty v-if="!loading && rows.length === 0" description="暂无用户数据" />

        <el-table v-else :data="rows" border stripe>
          <el-table-column label="姓名" min-width="140">
            <template #default="scope">
              {{ scope.row.fullName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="邮箱" min-width="200">
            <template #default="scope">
              {{ scope.row.email || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="角色" min-width="100">
            <template #default="scope">
              <el-tag size="small" type="info">{{ scope.row.role || 'user' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="160">
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
