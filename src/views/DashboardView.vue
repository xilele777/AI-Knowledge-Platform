<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { getMyDocuments } from '@/api/documents'
import type { DocumentListItem } from '@/types/document'
import { useAsyncState } from '@/composables/useAsyncState'
import { useNumberTween } from '@/composables/useNumberTween'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import PageContainer from '@/components/shared/PageContainer.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import SvgIcon from '@/components/shared/SvgIcon.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'

const router = useRouter()
const RefreshIcon = Refresh

// ─── 数据获取 ───
const docsState = useAsyncState<DocumentListItem[]>({ initialData: [] })

const loadAll = async () => {
  await docsState.execute(() =>
    getMyDocuments({ limit: 1000 }).then((r) =>
      r.success ? (r.data ?? []) : Promise.reject(new Error(r.error!)),
    ),
  )
}

void loadAll()

// ─── 统计卡片数据 ───
const statCards = computed(() => [
  {
    label: '总字数',
    icon: 'document' as const,
    value: totalCharacters.value,
    color: 'var(--md-sys-color-primary)',
    bgClass: 'stat-card-primary',
  },
  {
    label: '文档总数',
    icon: 'dashboard' as const,
    value: documents.value.length,
    color: 'var(--accent-emerald)',
    bgClass: 'stat-card-success',
  },
  {
    label: '草稿',
    icon: 'plus' as const,
    value: draftCount.value,
    color: 'var(--accent-violet)',
    bgClass: 'stat-card-violet',
  },
  {
    label: '已发布',
    icon: 'share' as const,
    value: publishedCount.value,
    color: 'var(--accent-amber)',
    bgClass: 'stat-card-amber',
  },
])

// ─── 最近文档 ───
const documents = computed(() => docsState.data.value ?? [])
const recentDocs = computed(() => documents.value.slice(0, 6))
const totalCharacters = computed(() =>
  documents.value.reduce((total, doc) => total + doc.characterCount, 0),
)
const draftCount = computed(() => documents.value.filter((doc) => doc.status === 'draft').length)
const publishedCount = computed(() =>
  documents.value.filter((doc) => doc.status === 'published').length,
)
const averageCharacters = computed(() =>
  documents.value.length ? Math.round(totalCharacters.value / documents.value.length) : 0,
)

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

const todayEditedCount = computed(() => {
  const today = dateKey(new Date())
  return documents.value.filter((doc) => dateKey(new Date(doc.updatedAt)) === today).length
})

const activityDays = computed(() => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const key = dateKey(date)
    const count = documents.value.filter((doc) => dateKey(new Date(doc.updatedAt)) === key).length

    return {
      key,
      label: date.toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', ''),
      count,
    }
  })
  const max = Math.max(...days.map((day) => day.count), 1)
  return days.map((day) => ({ ...day, height: Math.max((day.count / max) * 100, day.count ? 12 : 3) }))
})

const activeDaysCount = computed(() => activityDays.value.filter((day) => day.count > 0).length)

// ─── 数字滚动动画 ───
const tweenTargets = computed(() => statCards.value.map((card) => card.value))
const tweens = tweenTargets.value.map((_, index) =>
  useNumberTween(
    computed(() => tweenTargets.value[index] ?? 0),
    1000,
  ),
)

const isLoading = computed(() => docsState.isLoading.value)

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

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

function openDocument(id: string) {
  void router.push({ name: 'DocDetail', params: { id } })
}

// ─── 键盘快捷键 ───
useKeyboardShortcut({
  'ctrl+n': () => router.push({ path: '/docs', query: { create: '1' } }),
})
</script>

<template>
  <PageContainer
    width="default"
    title="工作台"
    title-class="gradient-text"
    description="AI 知识库平台指挥中心"
  >
    <template #actions>
      <el-button @click="loadAll" :loading="isLoading" :icon="RefreshIcon">刷新</el-button>
    </template>

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
            {{ formatNumber(tweens[i]?.displayValue.value ?? card.value) }}
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

        <EmptyStateActionable
          v-if="recentDocs.length === 0"
          icon="empty-doc"
          title="还没有文档"
          description="开始创作你的第一篇文档"
          action-text="新建文档"
          @action="router.push({ path: '/docs', query: { create: '1' } })"
        />

        <div v-else class="recent-list">
          <button
            v-for="doc in recentDocs"
            :key="doc.id"
            type="button"
            class="recent-item"
            :aria-label="`打开文档：${doc.title}`"
            @click="openDocument(doc.id)"
          >
            <div class="recent-item-icon">
              <SvgIcon name="document" :size="18" />
            </div>
            <div class="recent-item-body">
              <span class="recent-item-title">{{ doc.title }}</span>
              <span class="recent-item-meta">
                <span>{{ formatNumber(doc.characterCount) }} 字</span>
                {{ formatTime(doc.updatedAt) }}
                <el-tag size="small" :type="doc.status === 'published' ? 'success' : 'info'">
                  {{ statusText(doc.status) }}
                </el-tag>
              </span>
            </div>
          </button>
        </div>
      </section>

      <section class="section writing-overview">
        <div class="section-header">
          <h3 class="section-title">近 7 天创作</h3>
          <span class="activity-summary">活跃 {{ activeDaysCount }} 天</span>
        </div>

        <div class="activity-chart" aria-label="近 7 天更新文档数量">
          <div v-for="day in activityDays" :key="day.key" class="activity-day">
            <span class="activity-count">{{ day.count || '' }}</span>
            <div class="activity-track">
              <div class="activity-bar" :style="{ height: `${day.height}%` }" />
            </div>
            <span class="activity-label">{{ day.label }}</span>
          </div>
        </div>

        <div class="writing-metrics">
          <div><span>今日编辑</span><strong>{{ todayEditedCount }} 篇</strong></div>
          <div><span>平均篇幅</span><strong>{{ formatNumber(averageCharacters) }} 字</strong></div>
        </div>

        <el-button
          type="primary"
          class="create-document-btn"
          @click="router.push({ path: '/docs', query: { create: '1' } })"
        >
          <SvgIcon name="plus" :size="18" />
          新建文档
        </el-button>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
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
  grid-template-columns: minmax(0, 1fr) 320px;
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
  width: 100%;
  padding: 14px 20px;
  margin: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  appearance: none;
  color: inherit;
  background: transparent;
  border: 0;
  transition: background-color var(--md-sys-transition-fast) ease;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-item:hover {
  background: var(--md-sys-color-surface-container);
}

.recent-item:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: -2px;
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

/* ── 写作概览 ── */
.writing-overview {
  padding: 20px;
  border-radius: var(--md-sys-shape-corner-medium);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
}

.activity-summary {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
}

.activity-chart {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: 8px;
  height: 150px;
  padding: 8px 0 16px;
}

.activity-day {
  display: grid;
  grid-template-rows: 18px 92px 18px;
  align-items: end;
  justify-items: center;
  gap: 4px;
}

.activity-count,
.activity-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small);
}

.activity-track {
  display: flex;
  align-items: flex-end;
  width: 14px;
  height: 92px;
  border-radius: 999px;
  background: var(--md-sys-color-surface-container);
  overflow: hidden;
}

.activity-bar {
  width: 100%;
  min-height: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--md-sys-color-primary), var(--accent-violet));
  transition: height var(--md-sys-transition-medium) var(--ease-out-expo);
}

.writing-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.writing-metrics > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-surface-container);
}

.writing-metrics span {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small);
}

.writing-metrics strong {
  color: var(--md-sys-color-on-surface);
  font-size: var(--md-sys-typescale-title-medium);
}

.create-document-btn {
  width: 100%;
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
