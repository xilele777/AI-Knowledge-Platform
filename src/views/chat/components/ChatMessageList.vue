<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { UserFilled } from '@element-plus/icons-vue'
import type { ChatMessage } from '../../../types/chat'

interface Props {
  messages: ChatMessage[]
  loading?: boolean
}

const props = defineProps<Props>()

const rows = computed(() => props.messages || [])

function formatTime(text: string): string {
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function parseMessageContent(content: string) {
  let answer = content
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/)
  if (thinkMatch) {
    answer = content.slice(thinkMatch.index! + thinkMatch[0].length).trim()
  }
  const thinkRegex = /^(?:思考|思考过程|thinking|reasoning)[:：]\s*([\s\S]*?)(?=\n\s*(?:回答|输出|answer|output)[:：]|$)/i
  const thinkMatch2 = content.match(thinkRegex)
  if (thinkMatch2 && !thinkMatch) {
    answer = content.slice(thinkMatch2.index! + thinkMatch2[0].length).trim()
  }
  return answer
}
</script>

<template>
  <div class="message-list">
    <div v-if="!rows.length && !loading" class="empty-state">
      <div class="empty-icon">💬</div>
      <div class="empty-text">开始对话</div>
      <div class="empty-subtext">输入问题，AI 将为您解答</div>
    </div>

    <div v-else class="messages">
      <div
        v-for="item in rows"
        :key="item.id"
        class="message"
        :class="item.role"
      >
        <!-- 头像 -->
        <div class="avatar" :class="item.role">
          <el-icon v-if="item.role === 'user'" :size="18"><UserFilled /></el-icon>
          <span v-else class="ai-avatar-text">AI</span>
        </div>

        <div class="content-wrapper">
          <div class="message-header">
            <span class="role-name">{{ item.role === 'user' ? '你' : 'AI 助手' }}</span>
            <span class="time">{{ formatTime(item.createdAt) }}</span>
          </div>

          <div class="message-content" :class="item.role">
            <MdPreview :model-value="item.role === 'assistant' ? parseMessageContent(item.content) : item.content" />
          </div>

          <!-- 生成中状态 -->
          <div v-if="item.role === 'assistant' && item.status === 'streaming'" class="streaming-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>

          <!-- 错误 -->
          <div v-if="item.role === 'assistant' && item.errorMessage" class="error-message">
            {{ item.errorMessage }}
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
}

/* ---------- 空状态 ---------- */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--md-sys-color-outline);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 4px;
}

.empty-subtext {
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-outline);
}

/* ---------- 消息容器 ---------- */
.messages {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 860px;
  margin: 0 auto;
}

.message {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

/* ---------- 头像 ---------- */
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar.user {
  background: var(--md-sys-color-primary);
  color: #fff;
}

.avatar.assistant {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.ai-avatar-text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* ---------- 消息头 ---------- */
.content-wrapper {
  flex: 1;
  min-width: 0;
  max-width: 76%;
}

.message.user .content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message.user .message-header {
  flex-direction: row-reverse;
}

.role-name {
  font-size: var(--md-sys-typescale-label-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
}

.time {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-outline);
}

/* ---------- 气泡 ---------- */
.message-content {
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.65;
  font-size: 14px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.message-content.user {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

/* 强制 MdPreview 内部所有层背景透明，不破坏气泡圆角和色彩整体性 */
.message-content.user :deep(.md-editor-preview-wrapper),
.message-content.user :deep(.md-editor-preview),
.message-content.user :deep(.md-editor),
.message-content.user :deep(.md-editor-preview-wrapper > div) {
  background: transparent !important;
}

.message-content.assistant {
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.message-content.assistant :deep(.md-editor-preview-wrapper),
.message-content.assistant :deep(.md-editor-preview),
.message-content.assistant :deep(.md-editor),
.message-content.assistant :deep(.md-editor-preview-wrapper > div) {
  background: transparent !important;
}

/* AI 气泡里 markdown 的颜色 */
.message-content.assistant :deep(.md-preview) {
  font-size: 14px;
  line-height: 1.7;
  color: var(--md-sys-color-on-surface);
}

.message-content.assistant :deep(.md-preview p) {
  margin: 6px 0;
}

.message-content.assistant :deep(.md-preview p:first-child) {
  margin-top: 0;
}

.message-content.assistant :deep(.md-preview p:last-child) {
  margin-bottom: 0;
}

.message-content.assistant :deep(.md-preview code) {
  background: var(--md-sys-color-surface-container);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.message-content.assistant :deep(.md-preview pre) {
  background: #1e293b;
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  overflow-x: auto;
}

.message-content.assistant :deep(.md-preview pre code) {
  background: transparent;
  color: #e2e8f0;
  padding: 0;
}

.message-content.assistant :deep(.md-preview blockquote) {
  border-left: 3px solid var(--md-sys-color-primary);
  padding-left: 12px;
  margin: 10px 0;
  color: var(--md-sys-color-on-surface-variant);
}

.message-content.assistant :deep(.md-preview ul),
.message-content.assistant :deep(.md-preview ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.message-content.assistant :deep(.md-preview li) {
  margin: 3px 0;
}

.message-content.assistant :deep(.md-preview h1),
.message-content.assistant :deep(.md-preview h2),
.message-content.assistant :deep(.md-preview h3) {
  margin: 14px 0 6px 0;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.message-content.assistant :deep(.md-preview h1) { font-size: 18px; }
.message-content.assistant :deep(.md-preview h2) { font-size: 16px; }
.message-content.assistant :deep(.md-preview h3) { font-size: 15px; }

/* 用户气泡里的文字 */
.message-content.user :deep(.md-preview) {
  font-size: 14px;
  line-height: 1.6;
  color: var(--md-sys-color-on-primary-container);
}

.message-content.user :deep(.md-preview p) {
  margin: 4px 0;
}

.message-content.user :deep(.md-preview code) {
  background: rgba(0, 0, 0, 0.08);
  color: var(--md-sys-color-on-primary-container);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

/* ---------- 流式生成动画 ---------- */
.streaming-indicator {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-left: 4px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--md-sys-color-outline);
  animation: typing-bounce 1.4s ease-in-out infinite;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ---------- 错误 ---------- */
.error-message {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--md-sys-color-error-container);
  border: 1px solid var(--md-sys-color-error);
  border-radius: 8px;
  color: var(--md-sys-color-error);
  font-size: var(--md-sys-typescale-body-small);
}

/* ---------- 滚动条 ---------- */
.message-list::-webkit-scrollbar { width: 6px; }
.message-list::-webkit-scrollbar-track { background: transparent; }

.message-list::-webkit-scrollbar-thumb {
  background: var(--md-sys-color-outline-variant);
  border-radius: 3px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: var(--md-sys-color-outline);
}
</style>
