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
  <div class="knowledge-detail-page">
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="goList">返回列表</el-button>
        <div>
          <h2 class="page-title">知识库详情</h2>
          <p class="page-subtitle">查看知识库信息、管理文件，并快速进入问答。</p>
        </div>
      </div>

      <div class="page-actions">
        <el-button type="danger" text :loading="deleting" @click="handleDeleteKnowledgeBase">删除知识库</el-button>
        <el-button @click="loadPageData">刷新</el-button>
        <el-button type="primary" @click="goChat">进入问答页</el-button>
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

    <div class="page-content">
      <el-card shadow="never" class="kb-info-card" v-loading="loading">
        <template #header>
          <div class="card-header">知识库信息</div>
        </template>

        <el-empty v-if="!knowledgeBase" description="暂无知识库信息" />

        <div v-else class="info-grid">
          <div class="info-item">
            <span class="label">名称</span>
            <span class="value">{{ knowledgeBase.name }}</span>
          </div>
          <div class="info-item">
            <span class="label">状态</span>
            <span class="value">
              <el-tag :type="statusTagType" size="small">{{ knowledgeBase.status }}</el-tag>
            </span>
          </div>
          <div class="info-item full">
            <span class="label">描述</span>
            <span class="value">{{ knowledgeBase.description || '暂无描述' }}</span>
          </div>
          <div class="info-item">
            <span class="label">创建时间</span>
            <span class="value">{{ formatDate(knowledgeBase.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="label">更新时间</span>
            <span class="value">{{ formatDate(knowledgeBase.updatedAt) }}</span>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="upload-card">
        <template #header>
          <div class="upload-header">上传文件入口</div>
        </template>
        <FileUpload :knowledge-base-id="knowledgeBaseId" @uploaded="handleUploaded" />
      </el-card>

      <el-card shadow="never" class="files-card">
        <template #header>
          <div class="files-header">文件列表</div>
        </template>

        <KnowledgeFileList :loading="filesLoading" :files="files" @remove="handleDeleteFile" />
      </el-card>

      <el-card shadow="never" class="files-card">
        <template #header>
          <div class="files-header">站内文档来源</div>
        </template>

        <KnowledgeDocumentSourceList
          :loading="documentSourcesLoading"
          :items="documentSources"
          @remove="handleRemoveDocument"
        />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.knowledge-detail-page {
  padding: 4px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: var(--md-sys-typescale-headline-small);
  color: var(--md-sys-color-on-surface);
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-alert {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kb-info-card,
.upload-card,
.files-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  flex-shrink: 0;
}

.upload-card,
.files-card {
  margin-top: 0;
}

.card-header,
.upload-header,
.files-header {
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item.full {
  grid-column: 1 / -1;
}

.label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
}

.value {
  color: var(--md-sys-color-on-surface);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-left {
    flex-direction: column;
  }

  .page-actions {
    justify-content: flex-end;
  }

  .info-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
