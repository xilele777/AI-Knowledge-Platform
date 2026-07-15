<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import {
  adminDeleteKnowledgeFile,
  getAdminKnowledgeFiles,
  getAdminKnowledgeFileStats,
  type AdminKnowledgeFileItem,
  type AdminKnowledgeFileStats,
} from '../../api/admin'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminKnowledgeFileItem[]>([])
const searchKeyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const stats = ref<AdminKnowledgeFileStats>({ total: 0, processing: 0, ready: 0 })

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(size: number | null): string {
  if (size === null || size < 0) return '-'
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(2)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

const loadStats = async () => {
  const result = await getAdminKnowledgeFileStats()
  if (result.success && result.data) {
    stats.value = result.data
  }
}

const loadFiles = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminKnowledgeFiles({
    page: page.value,
    pageSize: pageSize.value,
    search: searchKeyword.value.trim() || undefined,
  })

  if (!result.success || !result.data) {
    rows.value = []
    total.value = 0
    errorMessage.value = result.error || '获取文件列表失败'
    loading.value = false
    return
  }

  rows.value = result.data.items
  total.value = result.data.total
  loading.value = false
}

const refresh = async () => {
  await Promise.all([loadFiles(), loadStats()])
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchKeyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 300)
})

// 翻页由 watcher 统一驱动，避免 el-pagination 事件与手动调用重复加载
watch(page, () => {
  void loadFiles()
})

watch(pageSize, reloadFromFirstPage)

function reloadFromFirstPage() {
  if (page.value === 1) {
    void loadFiles()
  } else {
    page.value = 1
  }
}

const handleDeleteFile = async (fileId: string) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该知识文件吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })

    const result = await adminDeleteKnowledgeFile(fileId)
    if (!result.success) {
      throw new Error(result.error || '删除失败')
    }

    ElMessage.success('知识文件已删除')
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

const handleOpenKnowledgeBase = (knowledgeBaseId: string) => {
  window.open(`/knowledge/${knowledgeBaseId}`, '_blank')
}

void refresh()
</script>

<template>
  <PageContainer width="full" class="admin-page">
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">文件总数</span>
        <strong class="stat-value">{{ stats.total }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">处理中</span>
        <strong class="stat-value">{{ stats.processing }}</strong>
      </div>
      <div class="stat-card">
        <span class="stat-label">已就绪</span>
        <strong class="stat-value">{{ stats.ready }}</strong>
      </div>
    </div>

    <div class="toolbar-card">
      <SearchInput v-model="searchKeyword" placeholder="搜索文件名" />
      <el-button :loading="loading" @click="refresh">刷新</el-button>
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
      <el-empty v-if="!loading && rows.length === 0" description="暂无匹配文件" />

      <el-table v-else :data="rows">
        <el-table-column label="文件名" min-width="200">
          <template #default="scope">
            <span class="primary-text">{{ scope.row.fileName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="90">
          <template #default="scope">
            <el-tag size="small" :type="scope.row.status === 'ready' ? 'success' : 'info'">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="大小" min-width="90">
          <template #default="scope">
            <span class="secondary-text">{{ formatSize(scope.row.fileSize) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" min-width="140">
          <template #default="scope">
            <span class="secondary-text">{{ scope.row.mimeType || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="160">
          <template #default="scope">
            <span class="secondary-text">{{ formatDate(scope.row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="165" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="handleOpenKnowledgeBase(scope.row.knowledgeBaseId)">
              所属知识库
            </el-button>
            <el-button link type="danger" @click="handleDeleteFile(scope.row.id)">删除</el-button>
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

.toolbar-card {
  margin-bottom: 16px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
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

.secondary-text {
  color: var(--md-sys-color-on-surface-variant);
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
</style>
