<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance } from 'vue'
import type { ChatSourceChunk } from '../../../types/chat'

interface Props {
  chunks: ChatSourceChunk[]
  /** 被回答引用的片段序号（1-based），用于展示「被引用」标记 */
  citedIndices?: number[]
  /** 需要定位高亮的片段序号（1-based），变化时滚动到对应卡片并闪烁 */
  highlightIndex?: number | null
}

const props = defineProps<Props>()

const displayedChunks = computed(() => props.chunks || [])
const citedSet = computed(() => new Set(props.citedIndices ?? []))

const cardRefs = ref<Map<number, HTMLElement>>(new Map())
const flashingIndex = ref<number | null>(null)

function setCardRef(index: number, el: unknown) {
  const dom = el && typeof el === 'object' && '$el' in el ? (el as ComponentPublicInstance).$el : el
  if (dom instanceof HTMLElement) {
    cardRefs.value.set(index, dom)
  } else {
    cardRefs.value.delete(index)
  }
}

let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.highlightIndex,
  (index) => {
    if (!index) {
      return
    }

    const el = cardRefs.value.get(index)
    if (!el) {
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    flashingIndex.value = index
    if (flashTimer) {
      clearTimeout(flashTimer)
    }
    flashTimer = setTimeout(() => {
      flashingIndex.value = null
    }, 1500)
  },
)

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
      <el-card
        v-for="(item, index) in displayedChunks"
        :key="item.chunkId"
        :ref="(el: unknown) => setCardRef(index + 1, el)"
        shadow="never"
        class="source-item"
        :class="{ 'is-flashing': flashingIndex === index + 1 }"
      >
        <div class="source-item-title">
          <span>
            片段 {{ index + 1 }}
            <el-tag v-if="citedSet.has(index + 1)" size="small" type="success" class="cited-tag">
              被引用
            </el-tag>
          </span>
          <span class="score">相关度 {{ item.score.toFixed(4) }}</span>
        </div>
        <div class="source-item-meta">
          <span v-if="item.chunkIndex !== null">#{{ item.chunkIndex }}</span>
          <span>{{ resolveSourceTypeLabel(item.sourceType) }} {{ resolveSourceName(item) }}</span>
          <span v-if="item.matchedKeywords.length" class="keywords">
            命中：{{ item.matchedKeywords.slice(0, 6).join('、') }}
          </span>
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
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.source-item.is-flashing {
  animation: source-flash 1.5s ease;
}

@keyframes source-flash {
  0%, 60% {
    border-color: var(--md-sys-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent);
  }
  100% {
    border-color: var(--md-sys-color-outline-variant);
    box-shadow: none;
  }
}

.cited-tag {
  margin-left: 6px;
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
  flex-wrap: wrap;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 6px;
}

.keywords {
  color: var(--md-sys-color-outline);
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
