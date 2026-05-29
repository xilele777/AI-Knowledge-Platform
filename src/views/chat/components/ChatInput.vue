<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  loading?: boolean
  canRegenerate?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'send', value: string): void
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
</script>

<template>
  <div class="chat-input">
    <div class="input-wrapper">
      <el-input
        v-model="text"
        type="textarea"
        :rows="3"
        resize="none"
        placeholder="输入你的问题，按 Enter 发送，Shift + Enter 换行"
        :disabled="loading"
        @keydown="onKeydown"
        class="text-input"
      />
    </div>
    <div class="chat-input-footer">
      <span class="tip">请先在个人中心配置 AI API 信息。</span>
      <div class="actions">
        <el-button :disabled="loading || !canRegenerate" @click="emit('regenerate')">重新生成</el-button>
        <el-button type="primary" :loading="loading" @click="send">发送</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  padding: 20px 24px;
  background: #ffffff;
}

.input-wrapper {
  margin-bottom: 12px;
}

.text-input :deep(.el-textarea__inner) {
  border-radius: 12px;
  border-color: #e5e7eb;
  font-size: 15px;
  line-height: 1.6;
  padding: 12px 16px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.text-input :deep(.el-textarea__inner:hover) {
  border-color: #3b82f6;
}

.text-input :deep(.el-textarea__inner:focus) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.chat-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.tip {
  color: #9ca3af;
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
