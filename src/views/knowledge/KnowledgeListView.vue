<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { createKnowledgeBase, deleteKnowledgeBase, getMyKnowledgeBases } from '../../api/knowledge'
import type { CreateKnowledgeBaseInput, KnowledgeBaseListItem } from '../../types/knowledge'
import PageContainer from '@/components/shared/PageContainer.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import KnowledgeCard from './components/KnowledgeCard.vue'
import SkeletonCard from '@/components/shared/SkeletonCard.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

interface CreateKbForm {
  name: string
  description: string
}

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const deleting = ref(false)
const creating = ref(false)
const createDialogVisible = ref(false)
const errorMessage = ref('')
const knowledgeBases = ref<KnowledgeBaseListItem[]>([])
const searchKeyword = ref('')

const createFormRef = ref<FormInstance>()
const createForm = reactive<CreateKbForm>({
  name: '',
  description: '',
})

const createRules: FormRules<CreateKbForm> = {
  name: [
    { required: true, message: '请输入知识库名称', trigger: 'blur' },
    { min: 2, max: 80, message: '名称长度需为 2-80 个字符', trigger: 'blur' },
  ],
}

const filteredKnowledgeBases = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()

  if (!keyword) {
    return knowledgeBases.value
  }

  return knowledgeBases.value.filter((item) => {
    const name = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()
    return name.includes(keyword) || desc.includes(keyword)
  })
})

async function loadKnowledgeBases() {
  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getMyKnowledgeBases()

    if (!result.success) {
      knowledgeBases.value = []
      errorMessage.value = result.error || '获取知识库列表失败'
      return
    }

    knowledgeBases.value = result.data || []
  } catch (error) {
    knowledgeBases.value = []
    errorMessage.value = error instanceof Error ? error.message : '获取知识库列表失败'
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  createForm.name = ''
  createForm.description = ''
  createDialogVisible.value = true
}

async function handleCreateKnowledgeBase() {
  if (!createFormRef.value) {
    return
  }

  const valid = await createFormRef.value.validate().catch(() => false)

  if (!valid) {
    return
  }

  creating.value = true

  try {
    const payload: CreateKnowledgeBaseInput = {
      name: createForm.name,
      description: createForm.description ?? null,
      status: 'active',
    }

    const result = await createKnowledgeBase(payload)

    if (!result.success || !result.data) {
      ElMessage.error(result.error || '创建知识库失败')
      return
    }

    ElMessage.success('知识库创建成功')
    void track(ANALYTICS_EVENTS.KNOWLEDGE_BASE_CREATE, {
      knowledge_base_id: result.data.id,
      name: result.data.name,
      status: result.data.status,
    })
    createDialogVisible.value = false
    await loadKnowledgeBases()
    router.push('/knowledge/' + result.data.id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '创建知识库失败')
  } finally {
    creating.value = false
  }
}

async function handleDeleteKnowledgeBase(id: string) {
  try {
    await ElMessageBox.confirm('删除后不可恢复,确认删除该知识库吗?', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })

    deleting.value = true
    const result = await deleteKnowledgeBase(id)

    if (!result.success) {
      ElMessage.error(result.error || '删除失败')
      return
    }

    ElMessage.success('删除成功')
    await loadKnowledgeBases()
  } catch (error) {
    if (error instanceof Error && error.message) {
      if (error.message.includes('cancel')) {
        return
      }
      ElMessage.error(error.message)
    }
  } finally {
    deleting.value = false
  }
}

function handleEnterDetail(id: string) {
  router.push('/knowledge/' + id)
}

if (route.query.create === '1') {
  openCreateDialog()
  void router.replace({ path: route.path, query: { ...route.query, create: undefined } })
}

void loadKnowledgeBases()
</script>

<template>
  <PageContainer
    width="default"
    title="知识库"
    description="管理你的知识库，上传文档并开启 AI 智能问答"
  >
    <template #actions>
      <SearchInput v-model="searchKeyword" placeholder="搜索知识库..." />
      <el-button @click="loadKnowledgeBases">刷新</el-button>
      <el-button type="primary" @click="openCreateDialog">新建知识库</el-button>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div class="content-wrapper">
      <SkeletonCard v-if="loading" :count="6" variant="card" />

      <EmptyStateActionable
        v-else-if="!loading && filteredKnowledgeBases.length === 0"
        icon="knowledge"
        :title="knowledgeBases.length === 0 ? '还没有知识库' : '没有匹配的知识库'"
        :description="knowledgeBases.length === 0 ? '创建知识库，上传文档并开启 AI 智能问答' : ''"
        :action-text="knowledgeBases.length === 0 ? '新建知识库' : ''"
        :show-action="knowledgeBases.length === 0"
        @action="openCreateDialog"
      />

      <div v-else class="card-grid">
        <KnowledgeCard
          v-for="item in filteredKnowledgeBases"
          :key="item.id"
          :item="item"
          @open="handleEnterDetail"
          @delete="handleDeleteKnowledgeBase"
        />
      </div>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      title="新建知识库"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="知识库名称" prop="name">
          <el-input v-model="createForm.name" placeholder="例如:产品文档知识库" maxlength="80" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            resize="vertical"
            placeholder="可选:描述该知识库的用途"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateKnowledgeBase">创建</el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}

.content-wrapper {
  min-height: 240px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
</style>
