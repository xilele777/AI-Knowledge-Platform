<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SharedDocumentCard from './components/SharedDocumentCard.vue'
import { getSharedDocuments } from '../../api/documents'
import type { DocumentListItem } from '../../types/document'

const router = useRouter()
const loading = ref(false)
const docs = ref<DocumentListItem[]>([])
const searchKeyword = ref('')
const errorMessage = ref('')

const loadDocuments = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const query = searchKeyword.value.trim() ? { searchTitle: searchKeyword.value } : {}
    const result = await getSharedDocuments(query)

    if (!result.success) {
      errorMessage.value = result.error || '获取共享文档列表失败'
      docs.value = []
      return
    }

    docs.value = result.data || []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '获取共享文档列表失败'
    docs.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  void loadDocuments()
}

const handleOpenDoc = (id: string) => {
  router.push(`/shared/${id}`)
}

void loadDocuments()
</script>

<template>
  <div class="shared-page">
    <div class="shared-topbar">
      <div>
        <h2 class="page-title">共享广场</h2>
      </div>
    </div>

    <div class="search-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索共享文档"
        clearable
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      >
        <template #append>
          <el-button @click="handleSearch">搜索</el-button>
        </template>
      </el-input>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      class="error-alert"
      :closable="false"
    />

    <div v-loading="loading" class="shared-content">
      <el-empty
        v-if="!loading && docs.length === 0"
        description="暂无共享文档，来做第一个分享者吧！"
      />

      <el-row v-else :gutter="16">
        <el-col v-for="item in docs" :key="item.id" :xs="24" :sm="12" :lg="8">
          <SharedDocumentCard :item="item" @open="handleOpenDoc" />
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.shared-page {
  padding: 4px;
}

.shared-topbar {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: var(--md-sys-typescale-headline-small);
  color: var(--md-sys-color-on-surface);
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

.search-bar {
  margin-bottom: 16px;
}

.error-alert {
  margin-top: 12px;
}

.shared-content {
  margin-top: 16px;
  min-height: 240px;
}

:deep(.el-col) {
  margin-bottom: 16px;
}
</style>
