<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { useUserStore } from '@/stores/user'
import {
  adminCreateUser,
  adminDeleteUser,
  adminSetUserBan,
  adminUpdateUserRole,
  getAdminProfiles,
  type AdminProfileItem,
  type AdminProfileStats,
} from '../../api/admin'

const userStore = useUserStore()

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminProfileItem[]>([])
const updatingUserId = ref('')
const searchKeyword = ref('')
const roleFilter = ref<'all' | 'user' | 'admin'>('all')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const stats = ref<AdminProfileStats>({ total: 0, admins: 0, users: 0, banned: 0 })
const createDialogVisible = ref(false)
const creatingUser = ref(false)

const createForm = reactive({
  fullName: '',
  email: '',
  password: '',
  role: 'user' as 'user' | 'admin',
})

const roleTabs = [
  { label: '全部用户', value: 'all' },
  { label: '普通用户', value: 'user' },
  { label: '管理员', value: 'admin' },
] as const

const currentUserId = computed(() => userStore.user?.id ?? '')
const hasFilter = computed(() => Boolean(searchKeyword.value.trim()) || roleFilter.value !== 'all')

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

const loadUsers = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminProfiles({
    page: page.value,
    pageSize: pageSize.value,
    search: searchKeyword.value.trim() || undefined,
    role: roleFilter.value === 'all' ? undefined : roleFilter.value,
  })

  if (!result.success || !result.data) {
    rows.value = []
    total.value = 0
    errorMessage.value = result.error || '获取用户列表失败'
    loading.value = false
    return
  }

  rows.value = result.data.items
  total.value = result.data.total

  // 筛选后可能返回空页，此时保留上一次的全局统计
  if (result.data.items.length > 0 || !hasFilter.value) {
    stats.value = result.data.stats
  }

  loading.value = false
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchKeyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 300)
})

watch(roleFilter, reloadFromFirstPage)

// 翻页由 watcher 统一驱动，避免 el-pagination 事件与手动调用重复加载
watch(page, () => {
  void loadUsers()
})

watch(pageSize, reloadFromFirstPage)

function reloadFromFirstPage() {
  if (page.value === 1) {
    void loadUsers()
  } else {
    page.value = 1
  }
}

const handleRoleChange = async (row: AdminProfileItem, nextRole: 'user' | 'admin') => {
  updatingUserId.value = row.id

  try {
    const result = await adminUpdateUserRole({
      userId: row.id,
      role: nextRole,
    })

    if (!result.success) {
      throw new Error(result.error || '角色更新失败')
    }

    row.role = nextRole
    ElMessage.success('角色更新成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '角色更新失败')
  } finally {
    updatingUserId.value = ''
  }
}

const handleToggleBan = async (row: AdminProfileItem) => {
  updatingUserId.value = row.id
  try {
    const result = await adminSetUserBan({
      userId: row.id,
      banned: !row.isBanned,
    })

    if (!result.success) {
      throw new Error(result.error || (row.isBanned ? '解封失败' : '封禁失败'))
    }

    row.isBanned = !row.isBanned
    ElMessage.success(row.isBanned ? '已封禁该用户' : '已解除封禁')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败')
  } finally {
    updatingUserId.value = ''
  }
}

const handleDeleteUser = async (row: AdminProfileItem) => {
  try {
    await ElMessageBox.confirm(
      `删除后该用户的账号及其文档、知识库、会话等数据将一并清除，且不可恢复。确认删除「${row.email || row.fullName || row.id}」吗？`,
      '删除用户',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  updatingUserId.value = row.id
  try {
    const result = await adminDeleteUser(row.id)

    if (!result.success) {
      throw new Error(result.error || '删除用户失败')
    }

    ElMessage.success('用户已删除')
    if (rows.value.length === 1 && page.value > 1) {
      page.value -= 1
    } else {
      await loadUsers()
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除用户失败')
  } finally {
    updatingUserId.value = ''
  }
}

const openCreateDialog = () => {
  createForm.fullName = ''
  createForm.email = ''
  createForm.password = ''
  createForm.role = 'user'
  createDialogVisible.value = true
}

const handleCreateUser = async () => {
  creatingUser.value = true
  try {
    const result = await adminCreateUser({
      fullName: createForm.fullName,
      email: createForm.email,
      password: createForm.password,
      role: createForm.role,
    })

    if (!result.success) {
      throw new Error(result.error || '添加用户失败')
    }

    createDialogVisible.value = false
    ElMessage.success('用户添加成功')
    reloadFromFirstPage()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '添加用户失败')
  } finally {
    creatingUser.value = false
  }
}

void loadUsers()
</script>

<template>
  <PageContainer width="full" class="admin-page">
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">用户总数</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">管理员</span>
        <strong class="stat-value">{{ stats.admins }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">普通用户</span>
        <strong class="stat-value">{{ stats.users }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">已封禁</span>
        <strong class="stat-value">{{ stats.banned }}</strong>
      </div>
    </div>

    <div class="toolbar-card">
      <el-segmented v-model="roleFilter" :options="roleTabs" />
      <div class="toolbar-actions">
        <SearchInput v-model="searchKeyword" placeholder="搜索姓名或邮箱" />
        <el-button type="primary" @click="openCreateDialog">添加用户</el-button>
        <el-button :loading="loading" @click="loadUsers">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div class="table-card" v-loading="loading">
      <el-empty v-if="!loading && rows.length === 0" description="暂无匹配用户" />

      <el-table v-else :data="rows">
        <el-table-column label="姓名" min-width="130">
          <template #default="scope">
            <span class="primary-text">{{ scope.row.fullName || '未填写' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="邮箱" min-width="190">
          <template #default="scope">
            <span class="secondary-text">{{ scope.row.email || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="185">
          <template #default="scope">
            <div class="role-cell">
              <el-tag size="small" :type="(scope.row.role || 'user') === 'admin' ? 'warning' : 'info'">
                {{ (scope.row.role || 'user') === 'admin' ? '管理员' : '普通用户' }}
              </el-tag>
              <el-select
                :model-value="(scope.row.role as 'user' | 'admin' | null) || 'user'"
                size="small"
                style="width: 100px"
                :loading="updatingUserId === scope.row.id"
                @update:model-value="handleRoleChange(scope.row, $event as 'user' | 'admin')"
              >
                <el-option label="普通用户" value="user" />
                <el-option label="管理员" value="admin" />
              </el-select>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="账号状态" min-width="95">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.isBanned ? 'danger' : 'success'">
              {{ scope.row.isBanned ? '已封禁' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="scope">
            <span class="secondary-text">{{ formatDate(scope.row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" fixed="right">
          <template #default="scope">
            <el-button
              link
              :type="scope.row.isBanned ? 'success' : 'danger'"
              :loading="updatingUserId === scope.row.id"
              @click="handleToggleBan(scope.row)"
            >
              {{ scope.row.isBanned ? '解封' : '封禁' }}
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="scope.row.id === currentUserId"
              :loading="updatingUserId === scope.row.id"
              @click="handleDeleteUser(scope.row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total > 0" class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[5, 10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>

    <el-dialog v-model="createDialogVisible" title="添加用户" width="460px">
      <el-form label-position="top">
        <el-form-item label="姓名 / 昵称">
          <el-input v-model="createForm.fullName" maxlength="32" placeholder="请输入用户姓名" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="createForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="createForm.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingUser" @click="handleCreateUser">确认添加</el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card,
.toolbar-card,
.table-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 24px;
  background: var(--md-sys-color-surface-container-lowest);
}

.stat-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.toolbar-card {
  margin-bottom: 16px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.secondary-text {
  color: var(--md-sys-color-on-surface-variant);
}

.primary-text {
  color: var(--md-sys-color-on-surface);
  font-weight: 600;
}

.error-alert {
  margin-bottom: 16px;
}

.table-card {
  padding: 8px 12px 12px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding: 12px 4px 4px;
}

.role-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
