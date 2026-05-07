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
    return '--'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function roleLabel(role: ChatMessage['role']): string {
  if (role === 'user') {
    return '你'
  }

  if (role === 'assistant') {
    return 'AI'
  }

  return '系统'
}

function modeLabel(mode: ChatMessage['answerMode']): string {
  if (mode === 'knowledge-enhanced') {
    return '知识增强'
  }

  if (mode === 'general-ai') {
    return '通用 AI'
  }

  if (mode === 'strict-knowledge') {
    return '严格知识库'
  }

  return ''
}

function modeTagType(mode: ChatMessage['answerMode']): 'success' | 'info' | 'warning' {
  if (mode === 'knowledge-enhanced') {
    return 'success'
  }

  if (mode === 'strict-knowledge') {
    return 'warning'
  }

  return 'info'
}

function statusText(status: ChatMessage['status']): string {
  if (status === 'streaming') {
    return '生成中'
  }

  if (status === 'error') {
    return '失败'
  }

  return '完成'
}

function statusTagType(status: ChatMessage['status']): 'warning' | 'danger' | 'success' {
  if (status === 'streaming') {
    return 'warning'
  }

  if (status === 'error') {
    return 'danger'
  }

  return 'success'
}

/**
 * 从 AI 回复中分离思考过程和正式输出
 * 支持 <think>...</think> 标签或常见的思考格式
 */
function parseMessageContent(content: string) {
  let thinking = ''
  let answer = content

  // 1. 优先查找 <think> 标签包裹的思考过程
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/)
  if (thinkMatch) {
    thinking = thinkMatch[1].trim()
    answer = content.slice(thinkMatch.index! + thinkMatch[0].length).trim()
  }

  // 2. 查找常见的思考标记
  const thinkRegex = /^(?:思考|思考过程|thinking|reasoning)[:：]\s*([\s\S]*?)(?=\n\s*(?:回答|输出|answer|output)[:：]|$)/i
  const thinkMatch2 = content.match(thinkRegex)
  if (thinkMatch2 && !thinking) {
    thinking = thinkMatch2[1].trim()
    answer = content.slice(thinkMatch2.index! + thinkMatch2[0].length).trim()
  }

  return { thinking, answer }
}
</script>

<template>
  <div class="chat-message-list">
    <el-empty v-if="!rows.length && !loading" description="暂无消息，开始提问吧" />

    <div v-else class="message-rows">
      <div
        v-for="item in rows"
        :key="item.id"
        class="message-row"
        :class="{ user: item.role === 'user', assistant: item.role === 'assistant' }"
      >
        <div class="message-head">
          <span class="role">{{ roleLabel(item.role) }}</span>
          <el-tag
            v-if="item.role === 'assistant' && item.answerMode"
            size="small"
            effect="light"
            :type="modeTagType(item.answerMode)"
            class="mode-tag"
          >
            {{ modeLabel(item.answerMode) }}
          </el-tag>
          <el-tag
            v-if="item.role === 'assistant'"
            size="small"
            effect="plain"
            :type="statusTagType(item.status)"
          >
            {{ statusText(item.status) }}
          </el-tag>
          <span class="time">{{ formatTime(item.createdAt) }}</span>
        </div>

        <div v-if="item.role === 'assistant'" class="message-body">
          <!-- 思考过程（如果有） -->
          <div v-if="parseMessageContent(item.content).thinking" class="thinking-block">
            <div class="thinking-header">
              <span class="thinking-icon">🧠</span>
              <span class="thinking-label">思考过程</span>
            </div>
            <div class="thinking-content">
              <MdPreview :model-value="parseMessageContent(item.content).thinking" />
            </div>
          </div>

          <!-- 正式输出 -->
          <div class="answer-block">
            <MdPreview :model-value="parseMessageContent(item.content).answer || item.content" />
          </div>
        </div>

        <!-- 用户消息直接显示 -->
        <div v-else class="message-body">
          <MdPreview :model-value="item.content" />
        </div>

        <div v-if="item.role === 'assistant' && item.errorMessage" class="error-tip">
          {{ item.errorMessage }}
        </div>
        <SourceChunks v-if="item.role === 'assistant' && item.sources.length > 0" :chunks="item.sources" />
        <div v-else-if="item.role === 'assistant' && item.status === 'done'" class="no-source-tip">本次回答未命中高相关参考，已由通用 AI 直接生成。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-message-list {
  padding: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f7fd 100%);
}

.message-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-row {
  max-width: 88%;
  padding: 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e6edf8;
  box-shadow: 0 2px 8px rgba(15, 34, 66, 0.04);
}

.message-row.user {
  margin-left: auto;
  background: #edf5ff;
  border-color: #cfe1ff;
}

.message-row.assistant {
  margin-right: auto;
}

.message-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.mode-tag {
  margin-left: auto;
}

.role {
  font-size: 12px;
  color: #3a4a5f;
  font-weight: 600;
}

.time {
  font-size: 12px;
  color: #94a0b2;
}

.message-body {
  line-height: 1.7;
  color: #1f2d3d;
}

/* Markdown 样式优化 */
:deep(.md-preview) {
  font-size: 15px;
}

:deep(.md-preview h1),
:deep(.md-preview h2),
:deep(.md-preview h3),
:deep(.md-preview h4),
:deep(.md-preview h5),
:deep(.md-preview h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  color: #1f2d3d;
}

:deep(.md-preview p) {
  margin: 8px 0;
}

:deep(.md-preview code) {
  background-color: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

:deep(.md-preview pre) {
  background-color: #1e1e1e;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 10px 0;
}

:deep(.md-preview pre code) {
  background: transparent;
  color: #d4d4d4;
  padding: 0;
}

/* 思考过程样式 */
.thinking-block {
  margin-bottom: 12px;
  border-left: 4px solid #86909c;
  background: linear-gradient(90deg, #f2f4f7 0%, #ffffff 100%);
  border-radius: 0 8px 8px 0;
  padding: 10px 14px;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.thinking-icon {
  font-size: 16px;
}

.thinking-label {
  font-size: 13px;
  color: #6b7785;
  font-weight: 600;
}

.thinking-content {
  font-size: 14px;
  color: #5a6675;
}

:deep(.thinking-content .md-preview) {
  font-size: 14px;
}

.answer-block {
  margin-top: 6px;
}

.no-source-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #7a879a;
}

.error-tip {
  margin-top: 8px;
  color: #d03050;
  font-size: 12px;
}
</style>
