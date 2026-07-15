<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import {
  adminDeleteDocument,
  adminSetDocumentShared,
  getAdminDocuments,
  getAdminDocumentStats,
  type AdminDocumentItem,
  type AdminDocumentStats,
} from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminDocumentItem[]>([])
const searchKeyword = ref('')
const shareFilter = ref<'all' | 'shared' | 'private'>('all')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const stats = ref<AdminDocumentStats>({ total: 0, shared: 0, private: 0 })

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

const loadStats = async () => {
  const result = await getAdminDocumentStats()
  if (result.success && result.data) {
    stats.value = result.data
  }
}

const loadDocs = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminDocuments({
    page: page.value,
    pageSize: pageSize.value,
    search: searchKeyword.value.trim() || undefined,
    shared: shareFilter.value === 'all' ? undefined : shareFilter.value === 'shared',
  })

  if (!result.success || !result.data) {
    rows.value = []
    total.value = 0
    errorMessage.value = result.error || '获取文档列表失败'
    loading.value = false
    return
  }

  rows.value = result.data.items
  total.value = result.data.total
  loading.value = false
}

const refresh = async () => {
  await Promise.all([loadDocs(), loadStats()])
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchKeyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 300)
})

watch(shareFilter, reloadFromFirstPage)

// 翻页由 watcher 统一驱动，避免 el-pagination 事件与手动调用重复加载
watch(page, () => {
  void loadDocs()
})

watch(pageSize, reloadFromFirstPage)

function reloadFromFirstPage() {
  if (page.value === 1) {
    void loadDocs()
  } else {
    page.value = 1
  }
}

const handleDeleteDoc = async (documentId: string) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该文档吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })

    const result = await adminDeleteDocument(documentId)
    if (!result.success) {
      throw new Error(result.error || '删除失败')
    }

    ElMessage.success('文档已删除')
    if (rows.value.length === 1 && page.value > 1) {
      page.value -= 1
      void loadStats()
    } else {
      await refresh()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败')
    }
  }
}

const handleToggleShare = async (row: AdminDocumentItem) => {
  const nextShared = !row.isShared
  const actionText = nextShared ? '共享' : '取消共享'

  try {
    await ElMessageBox.confirm(`确认要${actionText}该文档吗？`, `${actionText}确认`, {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })

    const result = await adminSetDocumentShared(row.id, nextShared)
    if (!result.success) {
      throw new Error(result.error || `${actionText}失败`)
    }

    row.isShared = nextShared
    ElMessage.success(`${actionText}成功`)
    void loadStats()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : `${actionText}失败`)
    }
  }
}

void refresh()
</script>

<template>
  <PageContainer width="full" class="admin-page">
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">文档总数</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">共享中</span>
        <strong class="stat-value">{{ stats.shared }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">未共享</span>
        <strong class="stat-value">{{ stats.private }}</strong>
      </div>
    </div>

    <div class="toolbar-card">
      <el-segmented
        v-model="shareFilter"
        :options="[
          { label: '全部', value: 'all' },
          { label: '共享中', value: 'shared' },
          { label: '未共享', value: 'private' },
        ]"
      />
      <div class="toolbar-actions">
        <SearchInput v-model="searchKeyword" placeholder="搜索文档标题" />
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
      <el-empty v-if="!loading && rows.length === 0" description="暂无匹配文档" />

      <el-table v-else :data="rows">
        <el-table-column label="标题" min-width="220">
          <template #default="scope">
            <span class="primary-text">{{ scope.row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column label="共享状态" min-width="95">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.isShared ? 'success' : 'info'">
              {{ scope.row.isShared ? '共享中' : '未共享' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="作者" min-width="120">
          <template #default="scope">
            <span class="primary-text">{{ scope.row.authorName || '未填写' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="作者邮箱" min-width="180">
          <template #default="scope">
            <span class="secondary-text">{{ scope.row.authorEmail || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="scope">
            <span class="secondary-text">{{ formatDate(scope.row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="150" fixed="right">
          <template #default="scope">
            <el-button link type="warning" @click="handleToggleShare(scope.row)">
              {{ scope.row.isShared ? '取消共享' : '共享' }}
            </el-button>
            <el-button link type="danger" @click="handleDeleteDoc(scope.row.id)">删除</el-button>
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

.error-alert {
  margin-bottom: 16px;
}

.table-card {
  padding: 8px 12px 12px;
}

.table-card :deep(.el-table .el-table__cell) {
  padding-top: 6px;
  padding-bottom: 6px;
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
</style>
