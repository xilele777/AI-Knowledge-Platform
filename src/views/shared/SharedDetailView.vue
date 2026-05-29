<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { getSharedDocumentById } from '../../api/documents'
import type { Document } from '../../types/document'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const doc = ref<Document | null>(null)
const errorMessage = ref('')

const loadDocument = async () => {
  const id = route.params.id as string
  if (!id) {
    router.push('/shared')
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getSharedDocumentById(id)

    if (!result.success || !result.data) {
      errorMessage.value = result.error || '文档不存在或未共享'
      return
    }

    doc.value = result.data
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '获取文档失败'
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push('/shared')
}

const formattedTime = computed(() => {
  if (!doc.value) return ''
  const date = new Date(doc.value.updatedAt)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})

onMounted(() => {
  void loadDocument()
})
</script>

<template>
  <div class="shared-detail-page" v-loading="loading">
    <div v-if="errorMessage" class="error-container">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
      <el-button type="primary" style="margin-top: 16px" @click="goBack">返回共享广场</el-button>
    </div>

    <div v-else-if="doc" class="doc-container">
      <div class="doc-header">
        <div class="header-left">
          <el-button link @click="goBack">← 返回共享广场</el-button>
        </div>
        <div class="header-right">
          <el-tag type="success">共享文档</el-tag>
        </div>
      </div>

      <div class="doc-title-section">
        <h1 class="doc-title">{{ doc.title }}</h1>
        <div class="doc-meta">
          <span>更新于: {{ formattedTime }}</span>
        </div>
      </div>

      <el-card class="doc-content-card" shadow="never">
        <MdPreview :model-value="doc.content" theme="light" language="zh-CN" />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.shared-detail-page {
  padding: 4px;
}

.error-container {
  padding: 24px;
  text-align: center;
}

.doc-container {
  max-width: 900px;
  margin: 0 auto;
}

.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.doc-title-section {
  margin-bottom: 16px;
}

.doc-title {
  margin: 0 0 12px 0;
  font-size: 28px;
  color: #1f2a37;
}

.doc-meta {
  color: #909399;
  font-size: 14px;
}

.doc-content-card {
  border: 1px solid #e6edf6;
}

:deep(.md-editor-preview-wrapper) {
  padding: 20px;
}
</style>
