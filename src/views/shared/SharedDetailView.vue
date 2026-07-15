<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { MdPreview, type Themes } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { getSharedDocumentById } from '../../api/documents'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'
import type { Document } from '../../types/document'
import PageContainer from '@/components/shared/PageContainer.vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const doc = ref<Document | null>(null)
const errorMessage = ref('')

const previewTheme = computed<Themes>(() => 'light')

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
    void track(ANALYTICS_EVENTS.SHARED_DOC_VIEW, {
      document_id: result.data.id,
      title: result.data.title,
      shared_at: result.data.sharedAt,
    })
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
  <PageContainer width="default" v-loading="loading">
    <div v-if="errorMessage" class="error-container">
      <el-alert :title="errorMessage" type="error" show-icon :closable="false" />
      <el-button type="primary" class="error-back-btn" @click="goBack">返回共享广场</el-button>
    </div>

    <article v-else-if="doc" class="doc-article">
      <div class="doc-toolbar">
        <el-button text :icon="ArrowLeft" @click="goBack">共享广场</el-button>
        <el-tag type="success" effect="plain" size="small">共享文档</el-tag>
      </div>

      <div class="article-shell">
        <header class="article-head">
          <h1 class="doc-title">{{ doc.title }}</h1>
          <div class="doc-meta-row">
            <span class="doc-meta">作者 {{ doc.ownerName || '未署名用户' }}</span>
            <span class="meta-divider">·</span>
            <span class="doc-meta">更新于 {{ formattedTime }}</span>
          </div>
        </header>

        <div class="doc-content">
          <MdPreview :model-value="doc.content" :theme="previewTheme" language="zh-CN" />
        </div>
      </div>
    </article>
  </PageContainer>
</template>

<style scoped>
.error-container {
  padding: 24px;
  text-align: center;
}

.error-back-btn {
  margin-top: 16px;
}

.doc-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 20px -8px;
}

.doc-article {
  max-width: 980px;
  margin: 0 auto;
}

.article-shell {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-lowest);
  padding: 28px 32px;
  box-shadow: var(--md-sys-elevation-level-1);
}

.article-head {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.doc-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.4px;
  line-height: 1.3;
  color: var(--md-sys-color-on-surface);
}

.doc-meta-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.doc-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
}

.meta-divider {
  color: var(--md-sys-color-outline-variant);
}

.doc-content {
  padding-top: 20px;
}

:deep(.md-editor-preview-wrapper) {
  padding: 12px 0;
}

:deep(.md-editor-previewOnly) {
  background: transparent;
}

@media (max-width: 768px) {
  .article-shell {
    padding: 22px 20px;
  }

  .doc-title {
    font-size: 28px;
  }
}
</style>
