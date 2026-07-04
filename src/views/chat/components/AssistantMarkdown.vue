<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import { closeUnbalancedFence, splitStreamingMarkdown } from '@/utils/streamingMarkdown'

interface Props {
  content: string
  streaming?: boolean
}

const props = defineProps<Props>()

// 流式期间切为「已完成段落 / 进行中尾段」两个 MdPreview 分别渲染：
// stable 的 modelValue 仅在新段落完成时变化，md-editor-v3 内部 watch 不触发，
// 不会随每帧 chunk 重新解析全文；每帧真正重渲染的只有小体积的 tail。
// 流式结束后合回单个 MdPreview，与历史消息渲染路径一致。
const parts = computed(() => {
  if (!props.streaming) {
    return { stable: props.content, tail: '' }
  }

  const { stable, tail } = splitStreamingMarkdown(props.content)
  return { stable, tail: closeUnbalancedFence(tail) }
})
</script>

<template>
  <div class="assistant-markdown">
    <MdPreview v-if="parts.stable" :model-value="parts.stable" />
    <MdPreview v-if="parts.tail" :model-value="parts.tail" />
  </div>
</template>

<style scoped>
/* 两段 MdPreview 之间的接缝：抵消前段尾部/后段头部的默认外边距，视觉上无缝 */
.assistant-markdown :deep(.md-editor-preview-wrapper) {
  padding: 0;
}
</style>
