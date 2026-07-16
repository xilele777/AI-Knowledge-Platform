<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import DocumentCard from './components/DocumentCard.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { useAsyncState } from '@/composables/useAsyncState'
import { useListCacheStore } from '@/stores/listCache'
import { apiDedupe } from '@/utils/apiDedupe'
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
const route = useRoute()
const docsState = useAsyncState<DocumentListItem[]>({ initialData: [] })
const listCacheStore = useListCacheStore()
const submitting = ref(false)
const docs = computed(() => docsState.data.value ?? [])
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

const loadDocuments = async (opts?: { silent?: boolean; preferCache?: boolean }) => {
  errorMessage.value = ''

  if (opts?.preferCache && !searchKeyword.value.trim() && listCacheStore.documents) {
    docsState.data.value = listCacheStore.getData(listCacheStore.documents) ?? []
  }

  const runner = async () => {
    const keyword = searchKeyword.value.trim()
    const result = keyword
      ? await apiDedupe.dedupe(`documents:search:${keyword}`, () => searchDocumentsByTitle(keyword))
      : await apiDedupe.dedupe('documents:list', () => getMyDocuments())

    if (!result.success) {
      errorMessage.value = result.error || '获取文档列表失败'
      throw new Error(errorMessage.value)
    }

    const next = result.data || []
    if (!keyword) {
      listCacheStore.setDocuments(next)
    }
    return next
  }

  if (opts?.silent && docsState.data.value?.length) {
    try {
      docsState.data.value = await runner()
    } catch {
      // 静默刷新失败时保留旧数据，仅展示错误提示
    }
    return
  }

  await docsState.execute(runner)
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
    listCacheStore.invalidate('documents')
    void track(ANALYTICS_EVENTS.DOCUMENT_CREATE, {
      document_id: result.data.id,
      title: result.data.title,
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
    listCacheStore.removeDocument(id)
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

const isLoading = computed(() => docsState.isLoading.value)
const showSkeleton = computed(() => docsState.showSkeleton.value)

listCacheStore.registerRevalidator('documents', () => loadDocuments({ silent: true }))

if (route.query.create === '1') {
  openCreateDialog()
  void router.replace({ path: route.path, query: { ...route.query, create: undefined } })
}

void loadDocuments({
  preferCache: true,
  silent: Boolean(listCacheStore.isFresh(listCacheStore.documents)),
})
</script>

<template>
  <PageContainer
    width="default"
    title="我的文档"
    description="创建、编辑和管理你的知识文档"
  >
    <template #actions>
      <SearchInput
        v-model="searchKeyword"
        placeholder="按标题搜索..."
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-button type="primary" @click="openCreateDialog">新建文档</el-button>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      class="error-alert"
      :closable="false"
    />

    <div class="docs-content">
      <SkeletonCard v-if="showSkeleton" :count="6" variant="card" />

      <EmptyStateActionable
        v-else-if="!isLoading && docs.length === 0"
        icon="empty-doc"
        title="还没有文档"
        description="创建你的第一篇文档，AI 助手会帮你润色和总结"
        action-text="新建文档"
        @action="openCreateDialog"
      />

      <div v-else class="card-grid">
        <DocumentCard
          v-for="item in docs"
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
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}

.docs-content {
  min-height: 240px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
</style>
