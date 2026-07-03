<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Refresh } from '@element-plus/icons-vue'
import { getMyDocuments } from '@/api/documents'
import { getAdminDashboardStats } from '@/api/admin'
import type { AdminDashboardStats } from '@/api/admin'
import type { DocumentListItem } from '@/types/document'
import { useAsyncState } from '@/composables/useAsyncState'
import { useNumberTween } from '@/composables/useNumberTween'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import GradientTitle from '@/components/shared/GradientTitle.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import SvgIcon from '@/components/shared/SvgIcon.vue'

const router = useRouter()
const SearchIcon = Search
const RefreshIcon = Refresh
const searchQuery = ref('')

// ─── 数据获取 ───
const statsState = useAsyncState<AdminDashboardStats>({ initialData: null })
const docsState = useAsyncState<DocumentListItem[]>({ initialData: [] })

const loadAll = async () => {
  await Promise.all([
    statsState.execute(() =>
      getAdminDashboardStats().then((r) => (r.success ? r.data! : Promise.reject(new Error(r.error!)))),
    ),
    docsState.execute(() =>
      getMyDocuments().then((r) => (r.success ? (r.data ?? []) : Promise.reject(new Error(r.error!)))),
    ),
  ])
}

void loadAll()

// ─── 统计卡片数据 ───
const statCards = computed(() => [
  {
    label: '文档',
    icon: 'document' as const,
    value: statsState.data.value?.documentCount ?? 0,
    color: 'var(--md-sys-color-primary)',
    bgClass: 'stat-card-primary',
  },
  {
    label: '知识库',
    icon: 'knowledge' as const,
    value: statsState.data.value?.fileCount ?? 0,
    color: 'var(--accent-emerald)',
    bgClass: 'stat-card-success',
  },
  {
    label: '问答',
    icon: 'chat' as const,
    value: statsState.data.value?.chatCount ?? 0,
    color: 'var(--accent-violet)',
    bgClass: 'stat-card-violet',
  },
  {
    label: '用户',
    icon: 'user' as const,
    value: statsState.data.value?.userCount ?? 0,
    color: 'var(--accent-amber)',
    bgClass: 'stat-card-amber',
  },
])

// ─── 数字滚动动画 ───
const tweenTargets = computed(() => statCards.value.map((c) => c.value))
const tweens = tweenTargets.value.map((_, i) =>
  useNumberTween(
    computed(() => tweenTargets.value[i] ?? 0),
    1000,
  ),
)

// ─── 最近文档 ───
const recentDocs = computed(() => docsState.data.value?.slice(0, 5) ?? [])

const isLoading = computed(
  () => statsState.isLoading.value || docsState.isLoading.value,
)

// ─── 格式化 ───
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function statusText(status: string): string {
  if (status === 'published') return '已发布'
  if (status === 'archived') return '已归档'
  return '草稿'
}

// ─── 快速入口 ───
const quickActions = [
  { label: '新建文档', icon: 'plus' as const, path: '/docs', action: 'create' },
  { label: '知识库', icon: 'knowledge' as const, path: '/knowledge' },
  { label: '开始问答', icon: 'chat' as const, path: '/chat' },
  { label: '共享广场', icon: 'share' as const, path: '/shared' },
]

// ─── 键盘快捷键 ───
useKeyboardShortcut({
  'ctrl+n': () => router.push('/docs'),
})
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <div class="dashboard-header">
      <GradientTitle
        title="工作台"
        subtitle="Dashboard"
        description="AI 知识库平台指挥中心"
        :gradient="'var(--gradient-blue)'"
      />
      <div class="header-search">
        <el-input
          v-model="searchQuery"
          placeholder="搜索文档、知识库或问答内容..."
          size="large"
          clearable
          :prefix-icon="SearchIcon"
          class="search-input"
        />
      </div>
      <div class="header-actions">
        <el-button @click="loadAll" :loading="isLoading" :icon="RefreshIcon" round>刷新</el-button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <template v-if="isLoading">
      <SkeletonCard :count="4" variant="card" />
    </template>

    <!-- 统计卡片 -->
    <div v-else class="stats-grid">
      <div
        v-for="(card, i) in statCards"
        :key="card.label"
        class="stat-card"
        :class="card.bgClass"
      >
        <div class="stat-icon">
          <SvgIcon :name="card.icon" :size="24" :color="card.color" />
        </div>
        <div class="stat-body">
          <div class="stat-value" :style="{ color: card.color }">
            {{ tweens[i]?.displayValue.value ?? card.value }}
          </div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="dashboard-content">
      <!-- 最近文档 -->
      <section class="section">
        <div class="section-header">
          <h3 class="section-title">最近文档</h3>
          <el-button text type="primary" @click="router.push('/docs')">
            查看全部
          </el-button>
        </div>

        <div v-if="recentDocs.length === 0" class="empty-hint">
          <SvgIcon name="empty-doc" :size="48" color="var(--md-sys-color-outline)" />
          <p>还没有文档，开始创作吧</p>
        </div>

        <div v-else class="recent-list">
          <div
            v-for="doc in recentDocs"
            :key="doc.id"
            class="recent-item"
            @click="router.push(`/docs/${doc.id}`)"
          >
            <div class="recent-item-icon">
              <SvgIcon name="document" :size="18" />
            </div>
            <div class="recent-item-body">
              <span class="recent-item-title">{{ doc.title }}</span>
              <span class="recent-item-meta">
                {{ formatTime(doc.updatedAt) }}
                <el-tag size="small" :type="doc.status === 'published' ? 'success' : 'info'">
                  {{ statusText(doc.status) }}
                </el-tag>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 快速入口 -->
      <section class="section">
        <h3 class="section-title">快速入口</h3>
        <div class="quick-actions">
          <el-button
            v-for="action in quickActions"
            :key="action.label"
            class="quick-action-btn"
            @click="router.push(action.path)"
          >
            <SvgIcon :name="action.icon" :size="18" />
            {{ action.label }}
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 4px;
}

/* ── 头部 ── */
.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 40px;
  gap: 24px;
  flex-wrap: wrap;
}

.dashboard-header :deep(.gradient-title-wrapper) {
  margin-bottom: 0;
}

.header-search {
  flex: 1;
  max-width: 480px;
  min-width: 240px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 9999px;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  transition: box-shadow var(--md-sys-transition-medium) var(--ease-out-expo),
              border-color var(--md-sys-transition-medium) var(--ease-out-expo);
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: var(--md-sys-color-outline);
  box-shadow: var(--shadow-lg);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--md-sys-color-primary);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12), var(--shadow-lg);
}

.header-actions {
  flex-shrink: 0;
}

/* ── 统计卡片网格 ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: var(--md-sys-shape-corner-large);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  transition: transform var(--md-sys-transition-medium) var(--ease-out-expo),
              box-shadow var(--md-sys-transition-medium) var(--ease-out-expo);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-card-primary {
  border-left: 3px solid var(--md-sys-color-primary);
}

.stat-card-success {
  border-left: 3px solid var(--accent-emerald);
}

.stat-card-violet {
  border-left: 3px solid var(--accent-violet);
}

.stat-card-amber {
  border-left: 3px solid var(--accent-amber);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container);
  flex-shrink: 0;
}

.stat-body {
  min-width: 0;
}

.stat-value {
  font-size: var(--md-sys-typescale-headline-large);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 4px;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
  font-weight: 500;
}

/* ── 内容区 ── */
.dashboard-content {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  align-items: start;
}

.section {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  margin: 0 0 16px 0;
}

.section-header .section-title {
  margin-bottom: 0;
}

/* ── 最近文档列表 ── */
.recent-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  overflow: hidden;
  background: var(--md-sys-color-surface-container-lowest);
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  cursor: pointer;
  transition: background-color var(--md-sys-transition-fast) ease;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-item:hover {
  background: var(--md-sys-color-surface-container);
}

.recent-item-icon {
  flex-shrink: 0;
  color: var(--md-sys-color-on-surface-variant);
}

.recent-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recent-item-title {
  font-size: var(--md-sys-typescale-body-medium);
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 24px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
  border: 1px dashed var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
}

.empty-hint p {
  margin: 0;
  color: var(--md-sys-color-outline);
}

/* ── 快速入口 ── */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
  width: 100%;
  height: 44px;
  padding: 0 16px;
  font-weight: 500;
  font-size: var(--md-sys-typescale-body-medium);
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  transition: all var(--md-sys-transition-fast) ease;
}

.quick-action-btn:hover {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-outline);
  box-shadow: var(--shadow-sm);
}

/* ── 响应式 ── */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .dashboard-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>