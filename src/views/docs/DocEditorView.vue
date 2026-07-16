<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import 'md-editor-v3/lib/style.css'
import type { ToolbarNames } from 'md-editor-v3'
const MdEditor = defineAsyncComponent(() =>
  import('md-editor-v3').then((m) => m.MdEditor),
)
import {
  addDocumentToKnowledgeBase,
  deleteDocument,
  getDocumentById,
  updateDocument,
} from '../../api/documents'
import { getMyKnowledgeBases } from '../../api/knowledge'
import AIAssistantPanel from '../../components/document/AIAssistantPanel.vue'
import { clearDocumentDraft, readDocumentDraft, writeDocumentDraft } from '../../utils/documentDraft'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'
import { useAiConfigStore } from '../../stores/aiConfig'
import { useListCacheStore } from '@/stores/listCache'
import type { KnowledgeBaseListItem } from '../../types/knowledge'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// 相比 md-editor-v3 默认全量工具栏，仅去掉 github 跳转和手动保存（页面 800ms 自动保存）
const editorToolbars: ToolbarNames[] = [
  'bold',
  'underline',
  'italic',
  'strikeThrough',
  'sub',
  'sup',
  '-',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'mermaid',
  'katex',
  '-',
  'revoke',
  'next',
  '=',
  'pageFullscreen',
  'fullscreen',
  'preview',
  'previewOnly',
  'htmlPreview',
  'catalog',
]

const route = useRoute()
const router = useRouter()
const aiConfigStore = useAiConfigStore()
const listCacheStore = useListCacheStore()
const docId = computed(() => String(route.params.id || ''))

const pageLoading = ref(false)
const deleting = ref(false)
const pageError = ref('')
const saveStatus = ref<SaveStatus>('idle')
const saveErrorMessage = ref('')
const isLoaded = ref(false)
const localDraftRestored = ref(false)
const joinDialogVisible = ref(false)
const joining = ref(false)
const knowledgeLoading = ref(false)
const knowledgeBases = ref<KnowledgeBaseListItem[]>([])
const selectedKnowledgeBaseId = ref('')
const isShared = ref(false)
const sharing = ref(false)
const showAssistant = ref(false)

const form = reactive({
  title: '',
  content: '',
})

let saveTimer: ReturnType<typeof setTimeout> | null = null

function maybeRestoreLocalDraft(serverTitle: string, serverContent: string): boolean {
  const draft = readDocumentDraft(docId.value)

  if (!draft) {
    return false
  }

  const hasDiff = draft.title !== serverTitle || draft.content !== serverContent

  if (!hasDiff) {
    clearDocumentDraft(docId.value)
    return false
  }

  form.title = draft.title
  form.content = draft.content
  return true
}

const saveStatusText = computed(() => {
  if (saveStatus.value === 'saving') {
    return '保存中…'
  }

  if (saveStatus.value === 'saved') {
    return '已保存'
  }

  if (saveStatus.value === 'error') {
    return saveErrorMessage.value || '保存失败'
  }

  return '编辑中'
})

async function loadDocument() {
  pageLoading.value = true
  pageError.value = ''

  try {
    const result = await getDocumentById(docId.value)

    if (!result.success || !result.data) {
      pageError.value = result.error || '文档加载失败'
      return
    }

    const serverTitle = result.data.title
    const serverContent = result.data.content
    isShared.value = result.data.isShared

    form.title = serverTitle
    form.content = serverContent

    const restored = maybeRestoreLocalDraft(serverTitle, serverContent)
    localDraftRestored.value = restored

    saveStatus.value = restored ? 'idle' : 'saved'
    saveErrorMessage.value = ''
    isLoaded.value = true

    if (restored) {
      ElMessage.info('已恢复本地草稿，等待自动保存')
    }
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '文档加载失败'
  } finally {
    pageLoading.value = false
  }
}

async function handleToggleShare() {
  try {
    const action = isShared.value ? '取消共享' : '共享'
    await ElMessageBox.confirm(
      `确定要${action}该文档吗？${isShared.value ? '取消后其他用户将无法访问。' : '共享后其他用户可以在共享广场查看此文档。'}`,
      `${action}确认`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    sharing.value = true

    const result = await updateDocument(docId.value, {
      isShared: !isShared.value,
    })

    if (!result.success) {
      ElMessage.error(result.error || `${action}失败`)
      return
    }

    isShared.value = !isShared.value
    ElMessage.success(`${action}成功`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return
    }
  } finally {
    sharing.value = false
  }
}

async function doSave() {
  if (!isLoaded.value) {
    return
  }

  if (!form.title.trim()) {
    saveStatus.value = 'error'
    saveErrorMessage.value = '标题不能为空'
    return
  }

  saveStatus.value = 'saving'
  saveErrorMessage.value = ''

  const result = await updateDocument(docId.value, {
    title: form.title,
    content: form.content,
  })

  if (!result.success) {
    saveStatus.value = 'error'
    saveErrorMessage.value = result.error || '保存失败'
    return
  }

  clearDocumentDraft(docId.value)
  localDraftRestored.value = false
  saveStatus.value = 'saved'
  void track(ANALYTICS_EVENTS.DOCUMENT_SAVE, {
    document_id: docId.value,
    title: form.title,
    content_length: form.content.length,
  })
}

function scheduleSave() {
  if (!isLoaded.value) {
    return
  }

  saveStatus.value = 'idle'
  saveErrorMessage.value = ''

  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  saveTimer = setTimeout(() => {
    void doSave()
  }, 800)
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该文档吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  deleting.value = true

  try {
    const result = await deleteDocument(docId.value)

    if (!result.success) {
      ElMessage.error(result.error || '删除失败')
      return
    }

    clearDocumentDraft(docId.value)
    ElMessage.success('文档已删除')
    void track(ANALYTICS_EVENTS.DOCUMENT_DELETE, {
      document_id: docId.value,
      from: 'doc_editor',
    })
    router.replace('/docs')
  } finally {
    deleting.value = false
  }
}

function goBack() {
  router.push('/docs')
}

function handleReplaceContent(nextContent: string) {
  form.content = nextContent
  ElMessage.success('已替换为 AI 结果')
}

function handleAppendContent(nextContent: string) {
  const trimmed = nextContent.trim()

  if (!trimmed) {
    return
  }

  form.content = form.content.trim() ? `${form.content}\n\n${trimmed}` : trimmed
  ElMessage.success('已插入到文档末尾')
}

async function ensureKnowledgeBasesLoaded() {
  if (knowledgeBases.value.length > 0) {
    return
  }

  const cached = listCacheStore.getData(listCacheStore.knowledgeBases)
  if (cached?.length) {
    knowledgeBases.value = cached
    selectedKnowledgeBaseId.value = cached[0]?.id || ''

    if (listCacheStore.isFresh(listCacheStore.knowledgeBases)) {
      return
    }
  }

  knowledgeLoading.value = true

  try {
    const result = await getMyKnowledgeBases()
    if (!result.success) {
      throw new Error(result.error || '获取知识库失败')
    }

    knowledgeBases.value = result.data || []
    listCacheStore.setKnowledgeBases(knowledgeBases.value)
    selectedKnowledgeBaseId.value = knowledgeBases.value[0]?.id || ''
  } finally {
    knowledgeLoading.value = false
  }
}

async function handleOpenJoinDialog() {
  try {
    await ensureKnowledgeBasesLoaded()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '获取知识库失败')
    return
  }

  if (!knowledgeBases.value.length) {
    ElMessage.warning('请先创建知识库')
    return
  }

  joinDialogVisible.value = true
}

async function handleJoinKnowledgeBase() {
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请选择知识库')
    return
  }

  joining.value = true

  try {
    const aiConfig = await aiConfigStore.ensureConfig()
    const result = await addDocumentToKnowledgeBase({
      documentId: docId.value,
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      aiConfig: aiConfigStore.isComplete ? aiConfig : null,
    })

    if (!result.success || !result.data) {
      ElMessage.error(result.error || '加入知识库失败')
      return
    }

    joinDialogVisible.value = false
    const suffix =
      result.data.embeddingStatus === 'generated'
        ? '，已生成语义向量'
        : '，未生成语义向量，将使用关键词检索'
    ElMessage.success('加入成功，已写入 ' + String(result.data.chunkCount) + ' 个文档切片' + suffix)
  } finally {
    joining.value = false
  }
}

watch(
  () => [form.title, form.content],
  () => {
    if (!isLoaded.value) {
      return
    }

    writeDocumentDraft(docId.value, form.title, form.content)
    scheduleSave()
  },
)

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
})

void loadDocument()
</script>

<template>
  <div class="editor-page" v-loading="pageLoading">
    <div class="editor-topbar">
      <div class="topbar-left">
        <el-button text :icon="ArrowLeft" @click="goBack">文档列表</el-button>
        <el-input
          v-model="form.title"
          class="title-input"
          maxlength="100"
          placeholder="无标题文档"
        />
      </div>
      <div class="topbar-right">
        <span
          class="save-status"
          :class="{
            'save-status--error': saveStatus === 'error',
            'save-status--saved': saveStatus === 'saved',
          }"
        >
          {{ saveStatusText }}
        </span>
        <el-button @click="handleOpenJoinDialog">加入知识库</el-button>
        <el-button :loading="sharing" @click="handleToggleShare">
          {{ isShared ? '取消共享' : '共享' }}
        </el-button>
        <el-button type="primary" plain @click="showAssistant = true">AI 助手</el-button>
        <el-button type="danger" text :loading="deleting" @click="handleDelete">删除</el-button>
      </div>
    </div>

    <el-alert
      v-if="pageError"
      :title="pageError"
      type="error"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <div v-else class="editor-layout">
      <div class="md-editor-wrapper">
        <MdEditor
          v-model="form.content"
          language="zh-CN"
          :preview="false"
          :auto-detect-code="true"
          :toolbars="editorToolbars"
        />
      </div>
    </div>

    <!-- AI 助手抽屉 -->
    <el-drawer
      v-model="showAssistant"
      title="AI 写作助手"
      direction="rtl"
      size="420px"
      :destroy-on-close="false"
      class="ai-assistant-drawer"
    >
      <AIAssistantPanel
        :current-content="form.content"
        @replace-content="handleReplaceContent"
        @append-content="handleAppendContent"
      />
    </el-drawer>

    <el-dialog v-model="joinDialogVisible" title="加入知识库" width="520px" :close-on-click-modal="false">
      <el-form label-position="top" v-loading="knowledgeLoading">
        <el-form-item label="选择知识库" required>
          <el-select v-model="selectedKnowledgeBaseId" placeholder="请选择知识库" style="width: 100%" filterable>
            <el-option v-for="item in knowledgeBases" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-alert
          title="加入后会自动切片并建立索引，知识库问答即可引用本文档内容。"
          type="info"
          :closable="false"
          show-icon
        />
      </el-form>

      <template #footer>
        <el-button @click="joinDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="joining" @click="handleJoinKnowledgeBase">确认加入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style>
/* el-drawer body 打通 flex 高度链（drawer 由 teleport 挂载，需非 scoped） */
.ai-assistant-drawer .el-drawer__body {
  display: flex !important;
  flex-direction: column;
  padding: 0;
}
</style>

<style scoped>
.editor-page {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--md-sys-color-surface-container-lowest);
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  flex-shrink: 0;
  background: var(--md-sys-color-surface-container-lowest);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.title-input {
  flex: 1;
  min-width: 0;
  max-width: 640px;
}

.title-input :deep(.el-input__wrapper),
.title-input :deep(.el-input__wrapper:hover),
.title-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: none;
  padding: 0 12px;
  border-radius: var(--md-sys-shape-corner-medium);
}

.title-input :deep(.el-input__wrapper) {
  background: transparent;
}

.title-input :deep(.el-input__wrapper:hover),
.title-input :deep(.el-input__wrapper.is-focus) {
  background: var(--md-sys-color-surface-container);
}

.title-input :deep(.el-input__inner) {
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.topbar-right :deep(.el-button + .el-button) {
  margin-left: 0;
}

.save-status {
  margin-right: 4px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
}

.save-status--saved {
  color: var(--md-sys-color-success);
}

.save-status--error {
  color: var(--md-sys-color-error);
}

.page-alert {
  margin: 16px 28px;
  flex-shrink: 0;
}

.editor-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 20px 20px;
}

.md-editor-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--md-sys-shape-corner-large);
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
}

.md-editor-wrapper :deep(.md-editor) {
  height: 100%;
}

.md-editor-wrapper :deep(.md-editor-toolbar) {
  padding-left: 12px;
  padding-right: 12px;
}

.md-editor-wrapper :deep(.md-editor-input-wrapper) {
  padding: 0 8px 8px;
}

.md-editor-wrapper :deep(.md-editor-preview-wrapper) {
  background: var(--md-sys-color-surface-container-low);
  padding: 24px 28px;
}

/* 编辑器内边距，提升长文阅读质感 */
.md-editor-wrapper :deep(.md-editor-textarea) {
  padding: 24px 28px !important;
}

@media (max-width: 768px) {
  .editor-topbar {
    height: auto;
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px;
  }

  .topbar-right {
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .page-alert {
    margin: 16px;
  }

  .editor-layout {
    padding: 0 12px 12px;
  }

  .md-editor-wrapper :deep(.md-editor-preview-wrapper),
  .md-editor-wrapper :deep(.md-editor-textarea) {
    padding: 18px 18px !important;
  }
}
</style>
