<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Grid, List } from '@element-plus/icons-vue'
import SharedDocumentCard from './components/SharedDocumentCard.vue'
import { getSharedDocuments } from '../../api/documents'
import type { DocumentListItem } from '../../types/document'
import GradientTitle from '@/components/shared/GradientTitle.vue'
import CapsuleTabs from '@/components/shared/CapsuleTabs.vue'
import RankBadge from '@/components/shared/RankBadge.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'

const router = useRouter()
const loading = ref(false)
const docs = ref<DocumentListItem[]>([])
const searchKeyword = ref('')
const errorMessage = ref('')
const sortBy = ref<'latest' | 'hottest' | 'comprehensive'>('latest')
const viewMode = ref<'grid' | 'list'>('grid')

const sortTabs = [
  { label: '最新', value: 'latest' },
  { label: '最热', value: 'hottest' },
  { label: '综合', value: 'comprehensive' },
]

const sortedDocs = computed(() => {
  const list = [...docs.value]
  switch (sortBy.value) {
    case 'latest':
      return list.sort((a, b) => new Date(b.sharedAt || b.updatedAt).getTime() - new Date(a.sharedAt || a.updatedAt).getTime())
    case 'hottest':
      return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    case 'comprehensive':
    default:
      return list.sort((a, b) => {
        const scoreA = new Date(a.sharedAt || a.updatedAt).getTime()
        const scoreB = new Date(b.sharedAt || b.updatedAt).getTime()
        return scoreB - scoreA
      })
  }
})

const loadDocuments = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const query = searchKeyword.value.trim() ? { searchTitle: searchKeyword.value } : {}
    const result = await getSharedDocuments(query)

    if (!result.success) {
      errorMessage.value = result.error || '获取共享文档列表失败'
      docs.value = []
      return
    }

    docs.value = result.data || []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '获取共享文档列表失败'
    docs.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  void loadDocuments()
}

const handleOpenDoc = (id: string) => {
  router.push(`/shared/${id}`)
}

void loadDocuments()
</script>

<template>
  <div class="shared-page">
    <!-- 头部 -->
    <div class="shared-header">
      <GradientTitle
        title="共享广场"
        subtitle="Share Space"
        description="发现和浏览其他用户分享的优质文档"
        :gradient="'var(--gradient-orange)'"
      />
      <div class="header-controls">
        <div class="search-bar">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索共享文档..."
            size="large"
            clearable
            @clear="handleSearch"
            @keyup.enter="handleSearch"
            class="search-input"
          >
            <template #prefix>
              <el-icon><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></el-icon>
            </template>
          </el-input>
        </div>
        <div class="sort-row">
          <CapsuleTabs v-model="sortBy" :tabs="sortTabs" color="var(--module-shared)" />
          <div class="view-toggle">
            <el-button
              circle
              :type="viewMode === 'grid' ? 'primary' : 'default'"
              size="small"
              @click="viewMode = 'grid'"
            >
              <el-icon><Grid /></el-icon>
            </el-button>
            <el-button
              circle
              :type="viewMode === 'list' ? 'primary' : 'default'"
              size="small"
              @click="viewMode = 'list'"
            >
              <el-icon><List /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      class="error-alert"
      :closable="false"
    />

    <div class="shared-content">
      <SkeletonCard v-if="loading" :count="6" variant="card" />

      <EmptyStateActionable
        v-else-if="sortedDocs.length === 0"
        icon="share"
        title="还没有共享文档"
        description="快去创作一篇文档并分享到共享广场吧"
        action-text="去创作"
        @action="$router.push('/docs')"
      />

      <!-- 网格视图 -->
      <div v-else-if="viewMode === 'grid'" class="card-grid">
        <div
          v-for="(item, index) in sortedDocs"
          :key="item.id"
          class="card-wrapper"
        >
          <RankBadge v-if="index < 3" :rank="index + 1" :size="32" class="card-rank" />
          <SharedDocumentCard
            :item="item"
            :rank="index + 1"
            @open="handleOpenDoc"
          />
        </div>
      </div>

      <!-- 列表视图 -->
      <div v-else class="list-view">
        <div
          v-for="(item, index) in sortedDocs"
          :key="item.id"
          class="list-row"
          @click="handleOpenDoc(item.id)"
        >
          <div class="list-rank">
            <RankBadge v-if="index < 3" :rank="index + 1" :size="28" />
            <span v-else class="list-rank-text">{{ index + 1 }}</span>
          </div>
          <div class="list-body">
            <span class="list-title">{{ item.title }}</span>
            <span class="list-owner">{{ item.ownerName || '匿名用户' }}</span>
          </div>
          <div class="list-meta">
            <span class="list-time">
              {{ new Date(item.sharedAt || item.updatedAt).toLocaleDateString('zh-CN') }}
            </span>
          </div>
          <el-button link type="primary" class="list-action" @click.stop="handleOpenDoc(item.id)">
            查看 →
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shared-page {
  padding: 4px;
}

/* ── 头部 ── */
.shared-header {
  margin-bottom: 32px;
}

.shared-header :deep(.gradient-title-wrapper) {
  margin-bottom: 24px;
}

.header-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  max-width: 520px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 9999px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  transition: box-shadow var(--md-sys-transition-fast) ease,
              border-color var(--md-sys-transition-fast) ease;
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: var(--md-sys-color-outline);
  box-shadow: var(--shadow-md);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--module-shared);
  box-shadow: 0 0 0 3px rgba(255, 109, 1, 0.12), var(--shadow-md);
}

.sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.view-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* ── 内容区 ── */
.error-alert {
  margin-bottom: 16px;
}

.shared-content {
  min-height: 240px;
}

/* ── 网格视图 ── */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.card-wrapper {
  position: relative;
}

.card-rank {
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 2;
}

/* ── 列表视图 ── */
.list-view {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  overflow: hidden;
  background: var(--md-sys-color-surface-container-lowest);
}

.list-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  cursor: pointer;
  transition: background-color var(--md-sys-transition-fast) ease;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.list-row:last-child {
  border-bottom: none;
}

.list-row:hover {
  background: var(--md-sys-color-surface-container);
}

.list-rank {
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.list-rank-text {
  font-size: var(--md-sys-typescale-label-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
}

.list-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-title {
  font-size: var(--md-sys-typescale-body-large);
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-owner {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
}

.list-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
}

.list-action {
  flex-shrink: 0;
  font-weight: 500;
}

/* ── 响应式 ── */
@media (max-width: 768px) {
  .sort-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .list-meta {
    display: none;
  }
}
</style>