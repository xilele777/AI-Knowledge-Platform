<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import type { ChatMessage } from '../../../types/chat'
import SourceChunks from './SourceChunks.vue'

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
        <div class="avatar">
          <span v-if="item.role === 'user'" class="avatar-icon">👤</span>
          <span v-else class="avatar-icon">🤖</span>
        </div>
        
        <div class="content-wrapper">
          <div class="message-header">
            <span class="role-name">{{ item.role === 'user' ? '你' : 'AI' }}</span>
            <span class="time">{{ formatTime(item.createdAt) }}</span>
          </div>
          
          <div class="message-content">
            <MdPreview :model-value="item.role === 'assistant' ? parseMessageContent(item.content) : item.content" />
          </div>

          <div v-if="item.role === 'assistant' && item.errorMessage" class="error-message">
            {{ item.errorMessage }}
          </div>
          
          <SourceChunks v-if="item.role === 'assistant' && item.sources.length > 0" :chunks="item.sources" />
          
          <div v-else-if="item.role === 'assistant' && item.status === 'done'" class="no-source">
            通用 AI 回答
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 4px;
}

.empty-subtext {
  font-size: 14px;
  color: #9ca3af;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.message {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.message.user .avatar {
  background: #3b82f6;
}

.message.assistant .avatar {
  background: #f3f4f6;
}

.content-wrapper {
  flex: 1;
  min-width: 0;
  max-width: 100%;
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
  margin-bottom: 6px;
}

.message.user .message-header {
  flex-direction: row-reverse;
}

.role-name {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.time {
  font-size: 12px;
  color: #9ca3af;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  font-size: 15px;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.message.user .message-content {
  background: white;
  color: #111827;
  border-radius: 12px 12px 4px 12px;
  border: 1px solid #e5e7eb;
}

.message.assistant .message-content {
  background: #f9fafb;
  color: #111827;
  border-radius: 12px 12px 12px 4px;
  border: 1px solid #e5e7eb;
}

:deep(.message-content .md-preview) {
  font-size: 15px;
  line-height: 1.7;
}

:deep(.message-content .md-preview p) {
  margin: 8px 0;
}

:deep(.message-content .md-preview p:first-child) {
  margin-top: 0;
}

:deep(.message-content .md-preview p:last-child) {
  margin-bottom: 0;
}

:deep(.message-content .md-preview code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 14px;
}

.message.user :deep(.message-content .md-preview code) {
  background: rgba(0, 0, 0, 0.06);
}

:deep(.message-content .md-preview pre) {
  background: #1f2937;
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  overflow-x: auto;
}

:deep(.message-content .md-preview pre code) {
  background: transparent;
  color: #e5e7eb;
  padding: 0;
}

:deep(.message-content .md-preview blockquote) {
  border-left: 3px solid #3b82f6;
  padding-left: 12px;
  margin: 12px 0;
  color: #6b7280;
}

.message.user :deep(.message-content .md-preview blockquote) {
  border-left-color: rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.9);
}

:deep(.message-content .md-preview ul),
:deep(.message-content .md-preview ol) {
  padding-left: 20px;
  margin: 10px 0;
}

:deep(.message-content .md-preview li) {
  margin: 4px 0;
}

:deep(.message-content .md-preview h1),
:deep(.message-content .md-preview h2),
:deep(.message-content .md-preview h3) {
  margin: 16px 0 8px 0;
  font-weight: 600;
}

:deep(.message-content .md-preview h1) {
  font-size: 20px;
}

:deep(.message-content .md-preview h2) {
  font-size: 18px;
}

:deep(.message-content .md-preview h3) {
  font-size: 16px;
}

.error-message {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
}

.no-source {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}

.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
