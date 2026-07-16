<script setup lang="ts">
import { ref } from 'vue'
import type { UploadProps, UploadRawFile, UploadUserFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import {
  batchInsertKnowledgeChunks,
  createKnowledgeFile,
  updateKnowledgeFileStatus,
} from '../../api/knowledge'
import { useAiConfigStore } from '../../stores/aiConfig'
import { chunkText } from '../../utils/chunkText'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

interface UploadSuccessPayload {
  fileId: string
  fileName: string
  chunkCount: number
}

const props = defineProps<{
  knowledgeBaseId: string
}>()

const emit = defineEmits<{
  (e: 'uploaded', payload: UploadSuccessPayload): void
}>()

const aiConfigStore = useAiConfigStore()
const fileList = ref<UploadUserFile[]>([])
const selectedRawFile = ref<UploadRawFile | null>(null)
const uploading = ref(false)

const ACCEPT_TYPES = '.txt,.md,text/plain,text/markdown'
const MAX_FILE_SIZE = 5 * 1024 * 1024

function isAcceptedFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  const validExt = lowerName.endsWith('.txt') || lowerName.endsWith('.md')
  const validType = file.type === 'text/plain' || file.type === 'text/markdown' || file.type === ''
  return validExt || validType
}

function setSelectedFile(rawFile: UploadRawFile) {
  if (!isAcceptedFile(rawFile)) {
    ElMessage.warning('仅支持 txt / md 文件')
    fileList.value = []
    selectedRawFile.value = null
    return
  }

  if (rawFile.size > MAX_FILE_SIZE) {
    ElMessage.warning('文件大小不能超过 5MB')
    fileList.value = []
    selectedRawFile.value = null
    return
  }

  selectedRawFile.value = rawFile
  fileList.value = [
    {
      name: rawFile.name,
      size: rawFile.size,
      status: 'ready',
      raw: rawFile,
    },
  ]
}

const beforeUpload: UploadProps['beforeUpload'] = (rawFile) => {
  setSelectedFile(rawFile)

  return false
}

const handleFileChange: UploadProps['onChange'] = (uploadFile) => {
  if (!uploadFile.raw) {
    return
  }

  setSelectedFile(uploadFile.raw)
}

function clearFiles() {
  fileList.value = []
  selectedRawFile.value = null
}

async function writeChunksInBatches(
  knowledgeBaseId: string,
  fileId: string,
  chunks: Array<{ index: number; content: string; length: number }>,
): Promise<'generated' | 'skipped' | 'failed'> {
  const batchSize = 50
  const aiConfig = await aiConfigStore.ensureConfig()
  const canGenerateEmbeddings = aiConfigStore.isComplete
  let embeddingStatus: 'generated' | 'skipped' | 'failed' = canGenerateEmbeddings ? 'generated' : 'skipped'

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const result = await batchInsertKnowledgeChunks({
      knowledgeBaseId,
      fileId,
      chunks: batch.map((chunk) => ({
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenCount: chunk.length,
        meta: {
          source: 'frontend-parser',
          length: chunk.length,
        },
      })),
    }, {
      generateEmbeddings: canGenerateEmbeddings,
      config: canGenerateEmbeddings ? aiConfig : undefined,
    })

    if (!result.success) {
      throw new Error(result.error || '切片写入失败')
    }

    if (result.data?.embeddingStatus === 'failed') {
      embeddingStatus = 'failed'
    } else if (result.data?.embeddingStatus === 'skipped' && embeddingStatus !== 'failed') {
      embeddingStatus = 'skipped'
    }
  }

  return embeddingStatus
}

async function handleUploadAndParse() {
  if (!props.knowledgeBaseId) {
    ElMessage.error('知识库 ID 无效')
    return
  }

  const firstFile = fileList.value[0]

  if (!firstFile || !selectedRawFile.value) {
    ElMessage.warning('请先选择 txt 或 md 文件')
    return
  }

  uploading.value = true

  let fileId = ''

  try {
    const fileText = await selectedRawFile.value.text()
    const chunks = chunkText(fileText, {
      minLength: 300,
      maxLength: 500,
    })

    if (!chunks.length) {
      ElMessage.warning('文件内容为空，无法切片')
      return
    }

    const createFileResult = await createKnowledgeFile({
      knowledgeBaseId: props.knowledgeBaseId,
      fileName: firstFile.name,
      filePath: 'local/' + firstFile.name,
      fileSize: firstFile.size ?? null,
      mimeType: selectedRawFile.value.type || 'text/plain',
      status: 'processing',
      meta: {
        source: 'frontend-upload',
        parser: 'chunkText',
      },
    })

    if (!createFileResult.success || !createFileResult.data) {
      throw new Error(createFileResult.error || '文件记录创建失败')
    }

    fileId = createFileResult.data.id

    const processingResult = await updateKnowledgeFileStatus({
      fileId,
      status: 'processing',
      meta: {
        parser: 'chunkText',
        chunkTargetMin: 300,
        chunkTargetMax: 500,
      },
    })

    if (!processingResult.success) {
      throw new Error(processingResult.error || '更新 processing 状态失败')
    }

    const embeddingStatus = await writeChunksInBatches(props.knowledgeBaseId, fileId, chunks)

    const doneResult = await updateKnowledgeFileStatus({
      fileId,
      status: 'done',
      meta: {
        chunkCount: chunks.length,
        parser: 'chunkText',
        embeddingStatus,
      },
    })

    if (!doneResult.success) {
      throw new Error(doneResult.error || '更新 done 状态失败')
    }

    const suffix =
      embeddingStatus === 'generated'
        ? '，已生成语义向量'
        : '，未生成语义向量，将使用关键词检索'
    ElMessage.success('上传成功，完成切片并入库，共 ' + String(chunks.length) + ' 段' + suffix)

    void track(ANALYTICS_EVENTS.FILE_UPLOAD, {
      knowledge_base_id: props.knowledgeBaseId,
      file_id: fileId,
      file_name: firstFile.name,
      file_size: firstFile.size ?? null,
      chunk_count: chunks.length,
    })

    emit('uploaded', {
      fileId,
      fileName: firstFile.name,
      chunkCount: chunks.length,
    })

    clearFiles()
  } catch (error) {
    if (fileId) {
      await updateKnowledgeFileStatus({
        fileId,
        status: 'failed',
        meta: {
          reason: error instanceof Error ? error.message : 'unknown',
        },
      })
    }

    ElMessage.error(error instanceof Error ? error.message : '处理失败')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="file-upload">
    <el-upload
      class="upload-box"
      drag
      :auto-upload="false"
      :limit="1"
      :accept="ACCEPT_TYPES"
      :file-list="fileList"
      :before-upload="beforeUpload"
      :on-change="handleFileChange"
      :on-remove="clearFiles"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽 txt / md 文件到此，或点击选择文件</div>
    </el-upload>

    <div class="upload-actions">
      <el-button :disabled="uploading" @click="clearFiles">清空</el-button>
      <el-button type="primary" :loading="uploading" @click="handleUploadAndParse">
        上传并解析入库
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.upload-box :deep(.el-upload-dragger) {
  padding: 24px 16px;
}

.upload-box :deep(.el-icon--upload) {
  font-size: 48px;
  margin-bottom: 8px;
}

.upload-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
