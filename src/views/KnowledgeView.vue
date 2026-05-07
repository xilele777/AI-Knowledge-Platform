<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createKnowledgeBase,
  createKnowledgeFile,
  deleteKnowledgeFile,
  getKnowledgeBaseById,
  getKnowledgeFiles,
  getMyKnowledgeBases,
} from '../api/knowledge'
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeFileInput,
  KnowledgeBase,
  KnowledgeBaseListItem,
  KnowledgeFileListItem,
} from '../types/knowledge'

interface CreateKbForm {
  name: string
  description: string
}

interface CreateFileForm {
  fileName: string
  filePath: string
  fileSize: number | null
  mimeType: string
  status: string
}

const loading = ref(false)
const detailLoading = ref(false)
const filesLoading = ref(false)
const createKbSubmitting = ref(false)
const createFileSubmitting = ref(false)

const errorMessage = ref('')
const fileErrorMessage = ref('')

const knowledgeBases = ref<KnowledgeBaseListItem[]>([])
const selectedKnowledgeBaseId = ref('')
const selectedKnowledgeBaseDetail = ref<KnowledgeBase | null>(null)
const files = ref<KnowledgeFileListItem[]>([])

const createKbDialogVisible = ref(false)
const createFileDialogVisible = ref(false)
const createKbFormRef = ref<FormInstance>()
const createFileFormRef = ref<FormInstance>()

const createKbForm = reactive<CreateKbForm>({
  name: '',
  description: '',
})

const createFileForm = reactive<CreateFileForm>({
  fileName: '',
  filePath: '',
  fileSize: null,
  mimeType: '',
  status: 'pending',
})

const createKbRules: FormRules<CreateKbForm> = {
  name: [
    { required: true, message: '请输入知识库名称', trigger: 'blur' },
    { min: 2, max: 80, message: '名称长度需为 2-80 个字符', trigger: 'blur' },
  ],
}

const createFileRules: FormRules<CreateFileForm> = {
  fileName: [{ required: true, message: '请输入文件名', trigger: 'blur' }],
}

const selectedKnowledgeBase = computed(() => {
  return knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value) || null
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

    if (!knowledgeBases.value.length) {
      selectedKnowledgeBaseId.value = ''
      selectedKnowledgeBaseDetail.value = null
      files.value = []
      return
    }

    if (!selectedKnowledgeBaseId.value) {
      selectedKnowledgeBaseId.value = knowledgeBases.value[0].id
    }
  } catch (error) {
    knowledgeBases.value = []
    errorMessage.value = error instanceof Error ? error.message : '获取知识库列表失败'
  } finally {
    loading.value = false
  }
}

async function loadKnowledgeBaseDetail(id: string) {
  if (!id) {
    selectedKnowledgeBaseDetail.value = null
    return
  }

  detailLoading.value = true

  try {
    const result = await getKnowledgeBaseById(id)

    if (!result.success || !result.data) {
      selectedKnowledgeBaseDetail.value = null
      errorMessage.value = result.error || '获取知识库详情失败'
      return
    }

    selectedKnowledgeBaseDetail.value = result.data
  } catch (error) {
    selectedKnowledgeBaseDetail.value = null
    errorMessage.value = error instanceof Error ? error.message : '获取知识库详情失败'
  } finally {
    detailLoading.value = false
  }
}

async function loadKnowledgeFiles(knowledgeBaseId: string) {
  if (!knowledgeBaseId) {
    files.value = []
    return
  }

  filesLoading.value = true
  fileErrorMessage.value = ''

  try {
    const result = await getKnowledgeFiles({
      knowledgeBaseId,
      limit: 100,
      offset: 0,
    })

    if (!result.success) {
      files.value = []
      fileErrorMessage.value = result.error || '获取文件列表失败'
      return
    }

    files.value = result.data || []
  } catch (error) {
    files.value = []
    fileErrorMessage.value = error instanceof Error ? error.message : '获取文件列表失败'
  } finally {
    filesLoading.value = false
  }
}

function openCreateKnowledgeBaseDialog() {
  createKbForm.name = ''
  createKbForm.description = ''
  createKbDialogVisible.value = true
}

async function handleCreateKnowledgeBase() {
  if (!createKbFormRef.value) {
    return
  }

  const valid = await createKbFormRef.value.validate().catch(() => false)

  if (!valid) {
    return
  }

  createKbSubmitting.value = true

  try {
    const payload: CreateKnowledgeBaseInput = {
      name: createKbForm.name,
      description: createKbForm.description || null,
      status: 'active',
    }

    const result = await createKnowledgeBase(payload)

    if (!result.success || !result.data) {
      ElMessage.error(result.error || '创建知识库失败')
      return
    }

    ElMessage.success('知识库创建成功')
    createKbDialogVisible.value = false
    await loadKnowledgeBases()
    selectedKnowledgeBaseId.value = result.data.id
  } finally {
    createKbSubmitting.value = false
  }
}

function openCreateFileDialog() {
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请先选择一个知识库')
    return
  }

  createFileForm.fileName = ''
  createFileForm.filePath = ''
  createFileForm.fileSize = null
  createFileForm.mimeType = ''
  createFileForm.status = 'pending'
  createFileDialogVisible.value = true
}

async function handleCreateFileRecord() {
  if (!createFileFormRef.value) {
    return
  }

  const valid = await createFileFormRef.value.validate().catch(() => false)

  if (!valid || !selectedKnowledgeBaseId.value) {
    return
  }

  createFileSubmitting.value = true

  try {
    const payload: CreateKnowledgeFileInput = {
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      fileName: createFileForm.fileName,
      filePath: createFileForm.filePath || null,
      fileSize: createFileForm.fileSize,
      mimeType: createFileForm.mimeType || null,
      status: createFileForm.status || 'pending',
    }

    const result = await createKnowledgeFile(payload)

    if (!result.success) {
      ElMessage.error(result.error || '创建文件记录失败')
      return
    }

    ElMessage.success('文件记录创建成功')
    createFileDialogVisible.value = false
    await loadKnowledgeFiles(selectedKnowledgeBaseId.value)
  } finally {
    createFileSubmitting.value = false
  }
}

async function handleDeleteFile(fileId: string) {
  try {
    await ElMessageBox.confirm('删除文件记录后不可恢复，确认删除吗？', '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const result = await deleteKnowledgeFile(fileId)

  if (!result.success) {
    ElMessage.error(result.error || '删除文件记录失败')
    return
  }

  ElMessage.success('文件记录已删除')
  if (selectedKnowledgeBaseId.value) {
    await loadKnowledgeFiles(selectedKnowledgeBaseId.value)
  }
}

watch(
  () => selectedKnowledgeBaseId.value,
  async (id) => {
    if (!id) {
      selectedKnowledgeBaseDetail.value = null
      files.value = []
      return
    }

    await Promise.all([loadKnowledgeBaseDetail(id), loadKnowledgeFiles(id)])
  },
)

void loadKnowledgeBases()
</script>

<template>
  <div class="knowledge-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">知识库管理</h2>
        <p class="page-subtitle">创建和维护你的知识库与文件记录。</p>
      </div>

      <div class="page-actions">
        <el-button @click="loadKnowledgeBases">刷新</el-button>
        <el-button type="primary" @click="openCreateKnowledgeBaseDialog">新建知识库</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <div class="knowledge-layout">
      <el-card class="base-list-card" shadow="never" v-loading="loading">
        <template #header>
          <div class="card-header">知识库列表</div>
        </template>

        <el-empty
          v-if="!loading && knowledgeBases.length === 0"
          description="暂无知识库，点击右上角“新建知识库”开始"
        />

        <el-scrollbar v-else height="480px">
          <div
            v-for="item in knowledgeBases"
            :key="item.id"
            class="base-item"
            :class="{ active: selectedKnowledgeBaseId === item.id }"
            @click="selectedKnowledgeBaseId = item.id"
          >
            <div class="base-item-title">{{ item.name }}</div>
            <div class="base-item-desc">{{ item.description || '暂无描述' }}</div>
          </div>
        </el-scrollbar>
      </el-card>

      <el-card class="base-detail-card" shadow="never" v-loading="detailLoading || filesLoading">
        <template #header>
          <div class="detail-header">
            <span>知识库详情</span>
            <el-button type="primary" plain size="small" @click="openCreateFileDialog">
              新建文件记录
            </el-button>
          </div>
        </template>

        <el-empty
          v-if="!selectedKnowledgeBase"
          description="请选择左侧知识库查看详情"
          :image-size="80"
        />

        <template v-else>
          <div class="detail-grid">
            <div class="field">
              <span class="label">名称</span>
              <span class="value">{{ selectedKnowledgeBaseDetail?.name || selectedKnowledgeBase.name }}</span>
            </div>
            <div class="field">
              <span class="label">状态</span>
              <el-tag size="small" :type="selectedKnowledgeBase.status === 'active' ? 'success' : 'info'">
                {{ selectedKnowledgeBase.status }}
              </el-tag>
            </div>
            <div class="field block">
              <span class="label">描述</span>
              <span class="value">{{ selectedKnowledgeBaseDetail?.description || '暂无描述' }}</span>
            </div>
          </div>

          <el-divider content-position="left">文件列表</el-divider>

          <el-alert
            v-if="fileErrorMessage"
            :title="fileErrorMessage"
            type="error"
            show-icon
            :closable="false"
            class="page-alert"
          />

          <el-empty v-if="!filesLoading && files.length === 0" description="暂无文件记录" :image-size="70" />

          <el-table v-else :data="files" border stripe>
            <el-table-column prop="fileName" label="文件名" min-width="180" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="mimeType" label="MIME" min-width="160" />
            <el-table-column prop="fileSize" label="大小" width="120">
              <template #default="scope">
                {{ scope.row.fileSize ?? '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button type="danger" link @click="handleDeleteFile(scope.row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-card>
    </div>

    <el-dialog
      v-model="createKbDialogVisible"
      title="新建知识库"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="createKbFormRef" :model="createKbForm" :rules="createKbRules" label-position="top">
        <el-form-item label="名称" prop="name">
          <el-input v-model="createKbForm.name" placeholder="例如：产品文档知识库" maxlength="80" />
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="createKbForm.description"
            type="textarea"
            :rows="3"
            resize="vertical"
            placeholder="可选：描述知识库用途"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createKbDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createKbSubmitting" @click="handleCreateKnowledgeBase">
          创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="createFileDialogVisible"
      title="新建文件记录"
      width="540px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="createFileFormRef"
        :model="createFileForm"
        :rules="createFileRules"
        label-position="top"
      >
        <el-form-item label="文件名" prop="fileName">
          <el-input v-model="createFileForm.fileName" placeholder="例如：用户手册.pdf" />
        </el-form-item>

        <el-form-item label="文件路径">
          <el-input v-model="createFileForm.filePath" placeholder="可选：storage/knowledge/xxx.pdf" />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="文件大小（字节）">
              <el-input-number v-model="createFileForm.fileSize" :min="0" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="createFileForm.status" style="width: 100%">
                <el-option label="pending" value="pending" />
                <el-option label="processing" value="processing" />
                <el-option label="done" value="done" />
                <el-option label="failed" value="failed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="MIME 类型">
          <el-input v-model="createFileForm.mimeType" placeholder="可选：application/pdf" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createFileDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createFileSubmitting" @click="handleCreateFileRecord">
          创建记录
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-page {
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

.page-alert {
  margin-bottom: 12px;
}

.knowledge-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 12px;
}

.base-list-card,
.base-detail-card {
  border: 1px solid #e6edf6;
}

.card-header {
  font-weight: 600;
}

.base-item {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e8eef7;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.base-item:hover {
  border-color: #9bb8e0;
}

.base-item.active {
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.15);
}

.base-item-title {
  font-weight: 600;
  color: #1f2a37;
}

.base-item-desc {
  margin-top: 6px;
  color: #6b7280;
  font-size: 13px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.block {
  grid-column: 1 / -1;
}

.label {
  color: #6b7280;
  font-size: 13px;
}

.value {
  color: #1f2a37;
}

@media (max-width: 992px) {
  .knowledge-layout {
    grid-template-columns: minmax(0, 1fr);
  }
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