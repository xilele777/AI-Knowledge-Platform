<script setup lang="ts">
import { computed } from 'vue'
import type { ChatSourceChunk } from '../../../types/chat'

interface Props {
  chunks: ChatSourceChunk[]
}

const props = defineProps<Props>()

const displayedChunks = computed(() => props.chunks || [])

function resolveSourceTypeLabel(type: ChatSourceChunk['sourceType']): string {
  return type === 'document' ? '文档' : '文件'
}

function resolveSourceName(item: ChatSourceChunk): string {
  if (item.sourceName) {
    return item.sourceName
  }

  if (item.sourceType === 'document') {
    return item.documentId || '-'
  }

  return item.fileId || '-'
}

function trimContent(content: string): string {
  const value = content.trim()
  if (value.length <= 260) {
    return value
  }

  return value.slice(0, 260) + '...'
}
</script>

<template>
  <div class="source-chunks" v-if="displayedChunks.length > 0">
    <div class="source-header">知识库参考来源</div>
    <div class="source-list">
      <el-card v-for="(item, index) in displayedChunks" :key="item.chunkId" shadow="never" class="source-item">
        <div class="source-item-title">
          <span>片段 {{ index + 1 }}</span>
          <span class="score">相关度 {{ item.score.toFixed(4) }}</span>
        </div>
        <div class="source-item-meta">
          <span v-if="item.chunkIndex !== null">#{{ item.chunkIndex }}</span>
          <span>{{ resolveSourceTypeLabel(item.sourceType) }} {{ resolveSourceName(item) }}</span>
        </div>
        <p class="source-item-content">{{ trimContent(item.content) }}</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.source-chunks {
  margin-top: 10px;
  background: var(--md-sys-color-surface-container-low);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 10px;
  padding: 10px;
}

.source-header {
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 8px;
}

.source-list {
  display: grid;
  gap: 8px;
}

.source-item {
  border-radius: 8px;
}

.source-item-title {
  display: flex;
  justify-content: space-between;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface);
  margin-bottom: 4px;
}

.source-item-meta {
  display: flex;
  gap: 10px;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 6px;
}

.source-item-content {
  margin: 0;
  font-size: var(--md-sys-typescale-body-small);
  line-height: 1.6;
  color: var(--md-sys-color-on-surface);
  white-space: pre-wrap;
}

.score {
  color: var(--md-sys-color-primary);
}
</style>
