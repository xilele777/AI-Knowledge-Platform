<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { createKnowledgeBase, getMyKnowledgeBases } from '../../api/knowledge'
import type { CreateKnowledgeBaseInput, KnowledgeBaseListItem } from '../../types/knowledge'
import KnowledgeCard from './components/KnowledgeCard.vue'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

interface CreateKbForm {
  name: string
  description: string
}

const router = useRouter()

const loading = ref(false)
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
      description: createForm.description || null,
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

function handleEnterDetail(id: string) {
  router.push('/knowledge/' + id)
}

void loadKnowledgeBases()
</script>

<template>
  <div class="knowledge-list-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">知识库列表</h2>
        <p class="page-subtitle">集中管理你的知识库，支持快速创建和进入详情。</p>
      </div>

      <div class="page-actions">
        <el-button @click="loadKnowledgeBases">刷新</el-button>
        <el-button type="primary" @click="openCreateDialog">新建知识库</el-button>
      </div>
    </div>

    <el-card class="toolbar-card" shadow="never">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索知识库名称或描述"
        clearable
      />
    </el-card>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div v-loading="loading" class="content-wrapper">
      <el-empty
        v-if="!loading && filteredKnowledgeBases.length === 0"
        :description="knowledgeBases.length === 0 ? '暂无知识库，点击右上角创建' : '没有匹配的知识库'"
      />

      <el-row v-else :gutter="16">
        <el-col
          v-for="item in filteredKnowledgeBases"
          :key="item.id"
          :xs="24"
          :sm="12"
          :lg="8"
        >
          <KnowledgeCard :item="item" @open="handleEnterDetail" />
        </el-col>
      </el-row>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      title="新建知识库"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="知识库名称" prop="name">
          <el-input v-model="createForm.name" placeholder="例如：产品文档知识库" maxlength="80" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            resize="vertical"
            placeholder="可选：描述该知识库的用途"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateKnowledgeBase">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-list-page {
  padding: 4px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: #1f2a37;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-card {
  border: 1px solid #e7edf7;
}

.error-alert {
  margin-top: 12px;
}

.content-wrapper {
  margin-top: 16px;
  min-height: 240px;
}

:deep(.el-col) {
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-actions {
    justify-content: flex-end;
  }
}
</style>
