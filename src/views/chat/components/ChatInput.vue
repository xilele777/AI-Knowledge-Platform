<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  loading?: boolean
  canRegenerate?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'send', value: string): void
  (event: 'stop'): void
  (event: 'regenerate'): void
}>()

const text = ref('')

function send() {
  const value = text.value.trim()
  if (!value || props.loading) {
    return
  }

  emit('send', value)
  text.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}

watch(
  () => props.loading,
  (loading) => {
    if (loading) {
      return
    }
  },
)
</script>

<template>
  <div class="chat-input">
    <el-input
      v-model="text"
      type="textarea"
      :rows="3"
      resize="none"
      placeholder="输入你的问题，按 Enter 发送，Shift + Enter 换行"
      :disabled="loading"
      @keydown="onKeydown"
    />
    <div class="chat-input-footer">
      <span class="tip">已启用流式输出，回答会边生成边显示。</span>
      <div class="actions">
        <el-button :disabled="loading || !canRegenerate" @click="emit('regenerate')">重新生成</el-button>
        <el-button type="danger" plain :disabled="!loading" @click="emit('stop')">停止生成</el-button>
        <el-button type="primary" :loading="loading" @click="send">发送</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  border-top: 1px solid #e8edf4;
  padding: 12px;
  background: #fff;
}

.chat-input-footer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tip {
  color: #8492a6;
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
