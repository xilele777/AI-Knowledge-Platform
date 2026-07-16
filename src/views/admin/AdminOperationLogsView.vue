<script setup lang="ts">
import { ref, watch } from 'vue'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { getAnalyticsEventLabel } from '@/constants/analyticsEvents'
import {
  getAdminOperationLogs,
  getAdminOperationLogStats,
  type AdminOperationLogItem,
  type AdminOperationLogStats,
} from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminOperationLogItem[]>([])
const searchKeyword = ref('')
const actionFilter = ref('')
const targetTypeFilter = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const stats = ref<AdminOperationLogStats>({ total: 0, success: 0, failure: 0 })

const actionOptions = [
  { label: '全部动作', value: '' },
  { label: '创建用户', value: 'create_user' },
  { label: '角色变更', value: 'set_user_role' },
  { label: '封禁用户', value: 'ban_user' },
  { label: '解封用户', value: 'unban_user' },
  { label: '删除用户', value: 'delete_user' },
  { label: '删除文档', value: 'delete_document' },
  { label: '共享文档', value: 'set_document_shared' },
  { label: '删除知识文件', value: 'delete_knowledge_file' },
  { label: '删除会话', value: 'delete_chat' },
  { label: '删除消息', value: 'delete_chat_message' },
]

const targetTypeOptions = [
  { label: '全部对象', value: '' },
  { label: '用户', value: 'user' },
  { label: '文档', value: 'document' },
  { label: '知识文件', value: 'knowledge_file' },
  { label: '会话', value: 'chat' },
  { label: '消息', value: 'chat_message' },
]

const statusOptions = [
  { label: '全部结果', value: '' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failure' },
]

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  document: '文档',
  knowledge_file: '知识文件',
  chat: '会话',
  chat_message: '消息',
}

function formatTargetType(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] || targetType
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function formatTargetLabel(row: AdminOperationLogItem): string {
  const label = row.targetLabel?.trim()
  if (label && !isUuid(label)) {
    return label
  }

  const id = label || row.targetId || ''
  return id ? `${id.slice(0, 8)}…` : '-'
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function prettyDetails(details: Record<string, unknown>): string {
  return JSON.stringify(details, null, 2)
}

const loadStats = async () => {
  const result = await getAdminOperationLogStats()
  if (result.success && result.data) {
    stats.value = result.data
  }
}

const loadLogs = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminOperationLogs({
    page: page.value,
    pageSize: pageSize.value,
    action: actionFilter.value || undefined,
    targetType: targetTypeFilter.value || undefined,
    status: statusFilter.value || undefined,
    search: searchKeyword.value.trim() || undefined,
  })

  if (!result.success || !result.data) {
    rows.value = []
    total.value = 0
    errorMessage.value = result.error || '获取操作日志失败'
    loading.value = false
    return
  }

  rows.value = result.data.items
  total.value = result.data.total
  loading.value = false
}

const refresh = async () => {
  await Promise.all([loadLogs(), loadStats()])
}

const reloadFromFirstPage = () => {
  if (page.value === 1) {
    void loadLogs()
  } else {
    page.value = 1
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchKeyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 300)
})

watch([actionFilter, targetTypeFilter, statusFilter], reloadFromFirstPage)

// 翻页由 watcher 统一驱动，避免 el-pagination 事件与手动调用重复加载
watch(page, () => {
  void loadLogs()
})

watch(pageSize, reloadFromFirstPage)

void refresh()
</script>

<template>
  <PageContainer width="full" class="admin-page">
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">日志总数</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">成功操作</span>
        <strong class="stat-value success">{{ stats.success }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">失败操作</span>
        <strong class="stat-value danger">{{ stats.failure }}</strong>
      </div>
    </div>

    <div class="toolbar-card">
      <div class="toolbar-filters">
        <el-select v-model="actionFilter" placeholder="筛选动作" clearable style="width: 180px">
          <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="targetTypeFilter" placeholder="筛选对象类型" clearable style="width: 180px">
          <el-option v-for="item in targetTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="筛选结果" clearable style="width: 160px">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
      <div class="toolbar-actions">
        <SearchInput v-model="searchKeyword" placeholder="搜索操作人、目标或对象 ID" />
        <el-button :loading="loading" @click="refresh">刷新</el-button>
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
      <el-empty v-if="!loading && rows.length === 0" description="暂无操作日志" />

      <el-table v-else :data="rows">
        <el-table-column type="expand">
          <template #default="scope">
            <pre class="detail-json">{{ prettyDetails(scope.row.details) }}</pre>
          </template>
        </el-table-column>
        <el-table-column label="操作时间" min-width="160">
          <template #default="scope">
            <span class="secondary-text">{{ formatDate(scope.row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作人" min-width="180">
          <template #default="scope">
            <span class="primary-text">{{ scope.row.actorEmail || '未知管理员' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" min-width="130">
          <template #default="scope">
            <span class="primary-text">{{ getAnalyticsEventLabel(scope.row.action) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标对象" min-width="200">
          <template #default="scope">
            <div class="target-cell">
              <el-tag size="small" type="info">{{ formatTargetType(scope.row.targetType) }}</el-tag>
              <span class="primary-text" :title="scope.row.targetId || ''">{{ formatTargetLabel(scope.row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="结果" min-width="80">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.status === 'success' ? 'success' : 'danger'">
              {{ scope.row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
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

.stat-value.success {
  color: var(--google-green);
}

.stat-value.danger {
  color: var(--google-red);
}

.toolbar-card {
  margin-bottom: 16px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-filters,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.primary-text {
  color: var(--md-sys-color-on-surface);
  font-weight: 600;
}

.secondary-text {
  color: var(--md-sys-color-on-surface-variant);
}

.target-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-json {
  margin: 0;
  padding: 16px;
  border-radius: 16px;
  background: var(--md-sys-color-surface-container-low);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--md-sys-color-on-surface);
}
</style>
