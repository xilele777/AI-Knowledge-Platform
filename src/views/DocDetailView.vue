<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { deleteDocument, getDocumentById, updateDocument } from '../api/documents'
import { clearDocumentDraft, readDocumentDraft, writeDocumentDraft } from '../utils/documentDraft'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const route = useRoute()
const router = useRouter()
const docId = computed(() => String(route.params.id || ''))

const pageLoading = ref(false)
const deleting = ref(false)
const pageError = ref('')
const saveStatus = ref<SaveStatus>('idle')
const saveErrorMessage = ref('')
const isLoaded = ref(false)
const localDraftRestored = ref(false)

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
    return '保存中...'
  }

  if (saveStatus.value === 'saved') {
    return '已保存'
  }

  if (saveStatus.value === 'error') {
    return '保存失败'
  }

  return '未修改'
})

const saveStatusType = computed(() => {
  if (saveStatus.value === 'saving') {
    return 'warning'
  }

  if (saveStatus.value === 'saved') {
    return 'success'
  }

  if (saveStatus.value === 'error') {
    return 'danger'
  }

  return 'info'
})

async function loadDocument() {
  pageLoading.value = true
  pageError.value = ''

  try {
    const result = await getDocumentById(docId.value)

    if (!result.success || !result.data) {
      const message = result.error || '文档加载失败'
      pageError.value = message
      return
    }

    const serverTitle = result.data.title
    const serverContent = result.data.content

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
    router.replace('/docs')
  } finally {
    deleting.value = false
  }
}

function goBack() {
  router.push('/docs')
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
      <el-button text @click="goBack">返回文档列表</el-button>
      <div class="topbar-right">
        <el-tag :type="saveStatusType">{{ saveStatusText }}</el-tag>
        <el-button type="danger" plain :loading="deleting" @click="handleDelete">删除文档</el-button>
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

    <el-alert
      v-if="saveStatus === 'error' && saveErrorMessage"
      :title="saveErrorMessage"
      type="error"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <el-alert
      v-if="localDraftRestored"
      title="已加载本地草稿，正在自动保存到云端"
      type="warning"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <el-card v-if="!pageError" class="editor-card" shadow="never">
      <el-form label-position="top">
        <el-form-item label="文档标题" required>
          <el-input v-model="form.title" maxlength="100" placeholder="请输入文档标题" />
        </el-form-item>

        <el-form-item label="正文内容">
          <div class="md-editor-wrapper">
            <MdEditor v-model="form.content" language="zh-CN" :preview="true" :auto-detect-code="true" />
          </div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.editor-page {
  padding: 4px;
}

.editor-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-alert {
  margin-bottom: 12px;
}

.editor-card {
  border: 1px solid #e6edf6;
}

.md-editor-wrapper {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

.md-editor-wrapper :deep(.md-editor) {
  height: 68vh;
}

.md-editor-wrapper :deep(.md-editor-preview-wrapper) {
  background: #fafbfc;
}

@media (max-width: 768px) {
  .editor-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .topbar-right {
    justify-content: space-between;
  }

  .md-editor-wrapper :deep(.md-editor) {
    height: 56vh;
  }
}
</style>