<script setup lang="ts">
import { ref } from 'vue'
import PageContainer from '@/components/shared/PageContainer.vue'
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
  <PageContainer
    width="full"
    class="admin-page"
    title="用户管理"
    description="查看平台全部注册用户与角色信息"
  >
    <template #actions>
      <el-button :loading="loading" @click="loadUsers">刷新</el-button>
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
        <el-empty v-if="!loading && rows.length === 0" description="暂无用户数据" />

        <el-table v-else :data="rows">
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
    </div>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}
</style>
