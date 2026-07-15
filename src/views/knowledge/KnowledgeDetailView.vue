<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useListCacheStore } from '@/stores/listCache'
import {
  deleteKnowledgeBase,
  deleteKnowledgeFile,
  getKnowledgeBaseById,
  getKnowledgeDocumentSources,
  getKnowledgeFiles,
  removeDocumentFromKnowledgeBase,
} from '../../api/knowledge'
import type {
  KnowledgeBase,
  KnowledgeBaseListItem,
  KnowledgeDocumentSource,
  KnowledgeFileListItem,
} from '../../types/knowledge'
import KnowledgeFileList from './components/KnowledgeFileList.vue'
import KnowledgeDocumentSourceList from './components/KnowledgeDocumentSourceList.vue'
import FileUpload from '../../components/knowledge/FileUpload.vue'
import PageContainer from '../../components/shared/PageContainer.vue'
import { ArrowLeft } from '@element-plus/icons-vue'

type KnowledgeBaseDisplay = Pick<
  KnowledgeBase,
  'id' | 'name' | 'description' | 'status' | 'qaConfig' | 'createdAt' | 'updatedAt'
>

function toKnowledgeBaseDisplay(item: KnowledgeBase | KnowledgeBaseListItem): KnowledgeBaseDisplay {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status,
    qaConfig: item.qaConfig,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

const route = useRoute()
const router = useRouter()
const listCacheStore = useListCacheStore()

const loading = ref(false)
const deleting = ref(false)
const filesLoading = ref(false)
const documentSourcesLoading = ref(false)
const errorMessage = ref('')

const knowledgeBase = ref<KnowledgeBaseDisplay | null>(null)
const files = ref<KnowledgeFileListItem[]>([])
const documentSources = ref<KnowledgeDocumentSource[]>([])
let statusPollTimer: number | null = null

const knowledgeBaseId = computed(() => {
  const id = route.params.id
  return typeof id === 'string' ? id : ''
})

function formatDate(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadKnowledgeBaseDetail() {
  if (!knowledgeBaseId.value) {
    errorMessage.value = '知识库 ID 无效'
    return
  }

  const cachedList = listCacheStore.getData(listCacheStore.knowledgeBases)
  const cachedItem = cachedList?.find((item: KnowledgeBaseListItem) => item.id === knowledgeBaseId.value)
  if (cachedItem) {
    errorMessage.value = ''
    knowledgeBase.value = toKnowledgeBaseDisplay(cachedItem)

    if (listCacheStore.isFresh(listCacheStore.knowledgeBases)) {
      return
    }
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

    knowledgeBase.value = toKnowledgeBaseDisplay(result.data)
    if (cachedItem) {
      listCacheStore.patchKnowledgeBase({
        id: result.data.id,
        name: result.data.name,
        description: result.data.description,
        status: result.data.status,
        qaConfig: result.data.qaConfig,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
      })
    }
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
    listCacheStore.removeKnowledgeBase(knowledgeBaseId.value)
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
    <div class="detail-hero" v-loading="loading">
      <div class="hero-row">
        <div class="hero-title-wrap">
          <el-button text circle :icon="ArrowLeft" class="back-btn" title="返回知识库列表" @click="goList" />
          <h1 class="detail-title">{{ knowledgeBase?.name || '知识库详情' }}</h1>
        </div>
        <div v-if="knowledgeBase" class="hero-actions">
          <el-button @click="loadPageData">刷新</el-button>
          <el-button type="primary" @click="goChat">进入问答页</el-button>
          <el-button type="danger" text :loading="deleting" @click="handleDeleteKnowledgeBase">
            删除知识库
          </el-button>
        </div>
      </div>
      <div v-if="knowledgeBase" class="hero-meta">
        <span v-if="knowledgeBase.description">{{ knowledgeBase.description }}</span>
        <span>创建于 {{ formatDate(knowledgeBase.createdAt) }}</span>
        <span>更新于 {{ formatDate(knowledgeBase.updatedAt) }}</span>
        <span>文件 {{ files.length }}</span>
        <span>来源文档 {{ documentSources.length }}</span>
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
        <section class="panel upload-panel">
          <div class="section-header">
            <h3 class="panel-title">上传文件</h3>
            <span class="section-meta">支持 txt / md，单个不超过 5MB</span>
          </div>
          <FileUpload :knowledge-base-id="knowledgeBaseId" @uploaded="handleUploaded" />
        </section>

        <section class="panel">
          <div class="section-header">
            <h3 class="panel-title">文件列表</h3>
            <span class="section-meta">共 {{ files.length }} 个文件</span>
          </div>
          <KnowledgeFileList :loading="filesLoading" :files="files" @remove="handleDeleteFile" />
        </section>

        <section class="panel">
          <div class="section-header">
            <h3 class="panel-title">站内文档来源</h3>
            <span class="section-meta">共 {{ documentSources.length }} 篇文档</span>
          </div>
          <KnowledgeDocumentSourceList
            :loading="documentSourcesLoading"
            :items="documentSources"
            @remove="handleRemoveDocument"
          />
        </section>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.detail-hero {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 16px 24px 18px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  background: linear-gradient(
    135deg,
    var(--md-sys-color-surface-container-lowest),
    var(--md-sys-color-surface-container-low)
  );
}

.hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.back-btn {
  margin-left: -8px;
  flex-shrink: 0;
}

.detail-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--md-sys-color-on-background);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 4px;
  font-size: var(--md-sys-typescale-body-small);
  color: var(--md-sys-color-on-surface-variant);
}

.hero-meta span + span::before {
  content: '·';
  margin: 0 8px;
  color: var(--md-sys-color-outline-variant);
}

.error-alert {
  margin-bottom: 16px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.detail-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.upload-panel {
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-header .panel-title {
  margin-bottom: 0;
}

.section-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
}

@media (max-width: 640px) {
  .detail-hero {
    padding: 14px 16px 16px;
  }

  .hero-row {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions {
    justify-content: flex-end;
  }
}
</style>
