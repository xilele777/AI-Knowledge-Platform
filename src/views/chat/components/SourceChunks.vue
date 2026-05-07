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
  background: #f7f9fc;
  border: 1px solid #e4e9f2;
  border-radius: 10px;
  padding: 10px;
}

.source-header {
  font-size: 12px;
  color: #55637a;
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
  font-size: 12px;
  color: #2f3b52;
  margin-bottom: 4px;
}

.source-item-meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: #7a879a;
  margin-bottom: 6px;
}

.source-item-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #1f2d3d;
  white-space: pre-wrap;
}

.score {
  color: #409eff;
}
</style>
