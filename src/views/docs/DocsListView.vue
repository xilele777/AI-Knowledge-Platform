<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import DocumentCard from './components/DocumentCard.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'
import GradientTitle from '@/components/shared/GradientTitle.vue'
import CapsuleTabs from '@/components/shared/CapsuleTabs.vue'
import {
  createDocument,
  deleteDocument,
  getMyDocuments,
  searchDocumentsByTitle,
} from '../../api/documents'
import type { DocumentListItem } from '../../types/document'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

interface CreateForm {
  title: string
}

const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const statusFilter = ref<string>('all')

const statusTabs = [
  { label: '全部', value: 'all' },
  { label: '已发布', value: 'published' },
  { label: '草稿', value: 'draft' },
]

const filteredDocs = computed(() => {
  if (statusFilter.value === 'all') return docs.value
  return docs.value.filter((d) => d.status === statusFilter.value)
})
const docs = ref<DocumentListItem[]>([])
const searchKeyword = ref('')
const errorMessage = ref('')
const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive<CreateForm>({
  title: '',
})

const createRules: FormRules<CreateForm> = {
  title: [
    { required: true, message: '请输入文档标题', trigger: 'blur' },
    { min: 2, max: 100, message: '标题长度需为 2-100 个字符', trigger: 'blur' },
  ],
}

const loadDocuments = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const keyword = searchKeyword.value.trim()
    const result = keyword
      ? await searchDocumentsByTitle(keyword)
      : await getMyDocuments()

    if (!result.success) {
      errorMessage.value = result.error || '获取文档列表失败'
      docs.value = []
      return
    }

    docs.value = result.data || []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '获取文档列表失败'
    docs.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  void loadDocuments()
}

const openCreateDialog = () => {
  createForm.title = ''
  createDialogVisible.value = true
}

const handleCreate = async () => {
  if (!createFormRef.value) {
    return
  }

  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }

  submitting.value = true

  try {
    const result = await createDocument({
      title: createForm.title,
      content: '',
      status: 'draft',
    })

    if (!result.success || !result.data) {
      ElMessage.error(result.error || '创建文档失败')
      return
    }

    ElMessage.success('文档创建成功')
    void track(ANALYTICS_EVENTS.DOCUMENT_CREATE, {
      document_id: result.data.id,
      title: result.data.title,
      status: result.data.status,
    })
    createDialogVisible.value = false
    router.push(`/docs/${result.data.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建文档失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}

const handleOpenDoc = (id: string) => {
  router.push(`/docs/${id}`)
}

const handleDeleteDoc = async (id: string) => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该文档吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })

    const result = await deleteDocument(id)

    if (!result.success) {
      ElMessage.error(result.error || '删除失败')
      return
    }

    ElMessage.success('删除成功')
    void track(ANALYTICS_EVENTS.DOCUMENT_DELETE, {
      document_id: id,
      from: 'docs_list',
    })
    await loadDocuments()
  } catch (error) {
    if (error instanceof Error && error.message) {
      if (error.message.includes('cancel')) {
        return
      }
      ElMessage.error(error.message)
    }
  }
}

void loadDocuments()
</script>

<template>
  <div class="docs-page">
    <div class="docs-header">
      <GradientTitle
        title="我的文档"
        subtitle="Documents"
        description="创建、编辑和管理你的知识文档"
        :gradient="'var(--gradient-blue)'"
      />
      <div class="header-row">
        <CapsuleTabs v-model="statusFilter" :tabs="statusTabs" color="var(--module-docs)" />
        <div class="header-actions">
          <div class="search-bar">
            <el-input
              v-model="searchKeyword"
              placeholder="按标题搜索..."
              size="large"
              clearable
              @clear="handleSearch"
              @keyup.enter="handleSearch"
              class="search-input"
            >
              <template #prefix>
                <el-icon><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></el-icon>
              </template>
            </el-input>
          </div>
          <el-button type="primary" size="large" @click="openCreateDialog">新建文档</el-button>
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

    <div class="docs-content">
      <SkeletonCard v-if="loading" :count="6" variant="card" />

      <EmptyStateActionable
        v-else-if="!loading && filteredDocs.length === 0"
        icon="empty-doc"
        title="还没有文档"
        description="创建你的第一篇文档，AI 助手会帮你润色和总结"
        action-text="新建文档"
        @action="openCreateDialog"
      />

      <div v-else class="card-grid">
        <DocumentCard
          v-for="item in filteredDocs"
          :key="item.id"
          :item="item"
          @open="handleOpenDoc"
          @remove="handleDeleteDoc"
          @update="loadDocuments"
        />
      </div>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      title="新建文档"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="文档标题" prop="title">
          <el-input v-model="createForm.title" placeholder="例如：AI 产品需求草案" maxlength="100" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">创建并进入编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.docs-page {
  padding: 4px;
}

/* ── 头部 ── */
.docs-header {
  margin-bottom: 32px;
}

.docs-header :deep(.gradient-title-wrapper) {
  margin-bottom: 20px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.search-bar {
  width: 240px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 9999px;
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  box-shadow: var(--shadow-sm);
  transition: all var(--md-sys-transition-fast) ease;
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: var(--md-sys-color-outline);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--module-docs);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12), var(--shadow-md);
}

.error-alert {
  margin-top: 12px;
}

.docs-content {
  margin-top: 16px;
  min-height: 240px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

@media (max-width: 768px) {
  .docs-topbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
