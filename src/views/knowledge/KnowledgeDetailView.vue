<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteKnowledgeBase,
  deleteKnowledgeFile,
  getKnowledgeBaseById,
  getKnowledgeDocumentSources,
  getKnowledgeFiles,
  removeDocumentFromKnowledgeBase,
} from '../../api/knowledge'
import type { KnowledgeBase, KnowledgeDocumentSource, KnowledgeFileListItem } from '../../types/knowledge'
import KnowledgeFileList from './components/KnowledgeFileList.vue'
import KnowledgeDocumentSourceList from './components/KnowledgeDocumentSourceList.vue'
import FileUpload from '../../components/knowledge/FileUpload.vue'
import PageContainer from '../../components/shared/PageContainer.vue'
import { ArrowLeft } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const deleting = ref(false)
const filesLoading = ref(false)
const documentSourcesLoading = ref(false)
const errorMessage = ref('')

const knowledgeBase = ref<KnowledgeBase | null>(null)
const files = ref<KnowledgeFileListItem[]>([])
const documentSources = ref<KnowledgeDocumentSource[]>([])
let statusPollTimer: number | null = null

const knowledgeBaseId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? id : ''
})

const statusTagType = computed(() => {
  return knowledgeBase.value?.status === 'active' ? 'success' : 'info'
})

function formatDate(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN')
}

async function loadKnowledgeBaseDetail() {
  if (!knowledgeBaseId.value) {
    errorMessage.value = '知识库 ID 无效'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getKnowledgeBaseById(knowledgeBaseId.value)

    if (!result.success || !result.data) {
      knowledgeBase.value = null
      errorMessage.value = result.error || '获取知识库详情失败'
      return
    }

    knowledgeBase.value = result.data
  } catch (error) {
    knowledgeBase.value = null
    errorMessage.value = error instanceof Error ? error.message : '获取知识库详情失败'
  } finally {
    loading.value = false
  }
}

async function loadKnowledgeFiles() {
  if (!knowledgeBaseId.value) {
    return
  }

  filesLoading.value = true

  try {
    const result = await getKnowledgeFiles({
      knowledgeBaseId: knowledgeBaseId.value,
      limit: 100,
      offset: 0,
    })

    if (!result.success) {
      files.value = []
      ElMessage.error(result.error || '获取文件列表失败')
      return
    }

    files.value = result.data || []
  } catch (error) {
    files.value = []
    ElMessage.error(error instanceof Error ? error.message : '获取文件列表失败')
  } finally {
    filesLoading.value = false
    syncStatusPolling()
  }
}

async function loadKnowledgeDocumentSourceList() {
  if (!knowledgeBaseId.value) {
    documentSources.value = []
    return
  }

  documentSourcesLoading.value = true

  try {
    const result = await getKnowledgeDocumentSources(knowledgeBaseId.value)

    if (!result.success) {
      documentSources.value = []
      ElMessage.error(result.error || '获取文档来源失败')
      return
    }

    documentSources.value = result.data || []
  } catch (error) {
    documentSources.value = []
    ElMessage.error(error instanceof Error ? error.message : '获取文档来源失败')
  } finally {
    documentSourcesLoading.value = false
  }
}

function clearStatusPolling() {
  if (statusPollTimer !== null) {
    window.clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

function syncStatusPolling() {
  const hasProcessing = files.value.some((item) => item.status === 'processing')

  if (hasProcessing && statusPollTimer === null) {
    statusPollTimer = window.setInterval(() => {
      void loadKnowledgeFiles()
    }, 2000)
  }

  if (!hasProcessing) {
    clearStatusPolling()
  }
}

async function handleUploaded() {
  await loadKnowledgeFiles()
  syncStatusPolling()
}

async function handleDeleteFile(fileId: string) {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该文件吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const result = await deleteKnowledgeFile(fileId)

  if (!result.success) {
    ElMessage.error(result.error || '删除失败')
    return
  }

  ElMessage.success('删除成功')
  await loadKnowledgeFiles()
}

async function handleRemoveDocument(knowledgeBaseId: string, documentId: string) {
  try {
    await ElMessageBox.confirm('确认从该知识库中移除该文档吗？', '移除确认', {
      type: 'warning',
      confirmButtonText: '确认移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const result = await removeDocumentFromKnowledgeBase(knowledgeBaseId, documentId)

  if (!result.success) {
    ElMessage.error(result.error || '移除失败')
    return
  }

  ElMessage.success('移除成功')
  await loadKnowledgeDocumentSourceList()
}

async function handleDeleteKnowledgeBase() {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该知识库吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  deleting.value = true
  try {
    const result = await deleteKnowledgeBase(knowledgeBaseId.value)

    if (!result.success) {
      ElMessage.error(result.error || '删除失败')
      return
    }

    ElMessage.success('删除成功')
    router.push('/knowledge')
  } finally {
    deleting.value = false
  }
}

function goChat() {
  if (!knowledgeBaseId.value) {
    ElMessage.error('知识库 ID 无效')
    return
  }

  router.push({
    path: '/chat',
    query: {
      knowledgeBaseId: knowledgeBaseId.value,
      knowledgeBaseName: knowledgeBase.value?.name || '',
    },
  })
}

function goList() {
  router.push('/knowledge')
}

async function loadPageData() {
  await Promise.all([loadKnowledgeBaseDetail(), loadKnowledgeFiles(), loadKnowledgeDocumentSourceList()])
  syncStatusPolling()
}

onBeforeUnmount(() => {
  clearStatusPolling()
})

void loadPageData()
</script>

<template>
  <PageContainer width="default">
    <template v-if="knowledgeBase" #actions>
      <el-button type="danger" text :loading="deleting" @click="handleDeleteKnowledgeBase">删除知识库</el-button>
      <el-button @click="loadPageData">刷新</el-button>
      <el-button type="primary" @click="goChat">进入问答页</el-button>
    </template>

    <div class="detail-head">
      <el-button text :icon="ArrowLeft" class="back-btn" @click="goList">知识库列表</el-button>
      <h1 class="detail-title" v-loading="loading">
        {{ knowledgeBase?.name || '知识库详情' }}
        <el-tag v-if="knowledgeBase" :type="statusTagType" size="small" effect="plain" class="title-tag">
          {{ knowledgeBase.status }}
        </el-tag>
      </h1>
      <p v-if="knowledgeBase" class="detail-desc">
        {{ knowledgeBase.description || '暂无描述' }}
      </p>
      <div v-if="knowledgeBase" class="detail-meta">
        <span>创建于 {{ formatDate(knowledgeBase.createdAt) }}</span>
        <span class="meta-dot">·</span>
        <span>更新于 {{ formatDate(knowledgeBase.updatedAt) }}</span>
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

    <div class="detail-grid">
      <div class="detail-main">
        <section class="panel">
          <h3 class="panel-title">文件列表</h3>
          <KnowledgeFileList :loading="filesLoading" :files="files" @remove="handleDeleteFile" />
        </section>

        <section class="panel">
          <h3 class="panel-title">站内文档来源</h3>
          <KnowledgeDocumentSourceList
            :loading="documentSourcesLoading"
            :items="documentSources"
            @remove="handleRemoveDocument"
          />
        </section>
      </div>

      <aside class="detail-side">
        <section class="panel">
          <h3 class="panel-title">上传文件</h3>
          <FileUpload :knowledge-base-id="knowledgeBaseId" @uploaded="handleUploaded" />
        </section>
      </aside>
    </div>
  </PageContainer>
</template>

<style scoped>
.detail-head {
  margin-bottom: 24px;
}

.back-btn {
  margin: 0 0 8px -8px;
}

.detail-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--md-sys-color-on-background);
  line-height: 1.25;
}

.title-tag {
  flex-shrink: 0;
}

.detail-desc {
  margin: 8px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

.detail-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--md-sys-typescale-body-small);
  color: var(--md-sys-color-on-surface-variant);
}

.meta-dot {
  color: var(--md-sys-color-outline-variant);
}

.error-alert {
  margin-bottom: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}

.detail-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.detail-side {
  position: sticky;
  top: 0;
}

@media (max-width: 900px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-side {
    position: static;
    order: -1;
  }
}
</style>
