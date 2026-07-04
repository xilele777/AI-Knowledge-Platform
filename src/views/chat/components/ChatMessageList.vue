<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { ArrowDown, UserFilled } from '@element-plus/icons-vue'
import type { ChatMessage } from '../../../types/chat'
import SvgIcon from '@/components/shared/SvgIcon.vue'
import AssistantMarkdown from './AssistantMarkdown.vue'
import SourceChunks from './SourceChunks.vue'
import { extractCitations } from '@/utils/parseCitations'
import { splitThinkContent, stripLegacyThinkPrefix } from '@/utils/streamingThinkParser'

interface Props {
  messages: ChatMessage[]
  loading?: boolean
}

const props = defineProps<Props>()

const rows = computed(() => props.messages || [])

// ─── 自动滚动与用户手动滚动的冲突处理 ───
// 规则：默认吸附底部跟随流式输出；用户上滑离开底部即解除吸附，
// 手动回到底部（或点击悬浮按钮）后恢复跟随。
const PIN_THRESHOLD_PX = 48

const scrollContainer = ref<HTMLElement | null>(null)
const isPinnedToBottom = ref(true)

const showBackToBottom = computed(() => !isPinnedToBottom.value && rows.value.length > 0)

function handleScroll() {
  const el = scrollContainer.value
  if (!el) {
    return
  }

  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  isPinnedToBottom.value = distanceToBottom <= PIN_THRESHOLD_PX
}

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const el = scrollContainer.value
  if (!el) {
    return
  }

  el.scrollTo({ top: el.scrollHeight, behavior })
}

function backToBottom() {
  isPinnedToBottom.value = true
  scrollToBottom('smooth')
}

// 内容变化（新消息 / 流式追加）时，仅在吸附状态下跟随
watch(
  () => {
    const last = rows.value[rows.value.length - 1]
    return `${rows.value.length}:${last?.id ?? ''}:${last?.content.length ?? 0}`
  },
  async () => {
    if (!isPinnedToBottom.value) {
      return
    }
    await nextTick()
    scrollToBottom()
  },
)

// 会话切换（loading 结束）时重置吸附并滚到底部
watch(
  () => props.loading,
  async (loading, wasLoading) => {
    if (wasLoading && !loading) {
      isPinnedToBottom.value = true
      await nextTick()
      scrollToBottom()
    }
  },
)

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

// ─── 消息内容分流 + 引用溯源 ───
// <think> 推理块流式分流到可折叠面板（思考中实时展开，闭合后自动收起）；
// 回答末尾「参考片段: [片段x,片段y]」解析为可点击角标，
// 点击展开来源面板并定位高亮对应切片，形成检索→生成→溯源的可验证闭环。
interface AssistantView {
  body: string
  citedIndices: number[]
  thinking: string
  thinkOpen: boolean
}

const assistantViews = computed(() => {
  const map = new Map<string, AssistantView>()

  for (const item of rows.value) {
    if (item.role !== 'assistant') {
      continue
    }

    const { thinking, answer, thinkOpen } = splitThinkContent(item.content)
    // 无 <think> 标签时兼容「思考：…回答：…」前缀风格
    const displayAnswer = thinking || thinkOpen ? answer : stripLegacyThinkPrefix(answer)

    if (item.status !== 'done' || !item.sources.length) {
      map.set(item.id, { body: displayAnswer, citedIndices: [], thinking, thinkOpen })
      continue
    }

    const { body, citedIndices } = extractCitations(displayAnswer)
    // 过滤模型幻觉出的越界序号；全部越界时保留原文（不剥离引用行）
    const valid = citedIndices.filter((index) => index <= item.sources.length)
    map.set(
      item.id,
      valid.length
        ? { body, citedIndices: valid, thinking, thinkOpen }
        : { body: displayAnswer, citedIndices: [], thinking, thinkOpen },
    )
  }

  return map
})

function viewFor(item: ChatMessage): AssistantView {
  return (
    assistantViews.value.get(item.id) ?? {
      body: item.content,
      citedIndices: [],
      thinking: '',
      thinkOpen: false,
    }
  )
}

// 思考面板展开状态：用户手动切换优先；未操作过时跟随思考进行状态
// （流式思考中自动展开，</think> 到达后自动收起）
const thinkExpanded = ref<Record<string, boolean>>({})

function isThinkExpanded(item: ChatMessage): boolean {
  return thinkExpanded.value[item.id] ?? viewFor(item).thinkOpen
}

function toggleThink(item: ChatMessage) {
  thinkExpanded.value[item.id] = !isThinkExpanded(item)
}

const expandedSources = ref<Record<string, boolean>>({})
const highlightTarget = ref<{ messageId: string; index: number } | null>(null)

function toggleSources(id: string) {
  expandedSources.value[id] = !expandedSources.value[id]
}

function highlightFor(id: string): number | null {
  return highlightTarget.value?.messageId === id ? highlightTarget.value.index : null
}

async function locateSource(messageId: string, index: number) {
  expandedSources.value[messageId] = true
  await nextTick()
  // 先清空再赋值：连续点击同一角标也能重新触发面板内的高亮 watch
  highlightTarget.value = null
  await nextTick()
  highlightTarget.value = { messageId, index }
}
</script>

<template>
  <div class="message-list-wrapper">
    <div ref="scrollContainer" class="message-list" @scroll.passive="handleScroll">
      <div v-if="!rows.length && !loading" class="empty-state">
      <div class="empty-icon">
          <SvgIcon name="empty-chat" :size="48" color="var(--md-sys-color-outline)" />
        </div>
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

          <!-- 思考过程（推理模型 <think> 块）：思考中实时展开，闭合后自动收起 -->
          <div
            v-if="item.role === 'assistant' && (viewFor(item).thinking || viewFor(item).thinkOpen)"
            class="think-block"
          >
            <button type="button" class="think-toggle" @click="toggleThink(item)">
              <el-icon :size="12" class="toggle-icon" :class="{ expanded: isThinkExpanded(item) }">
                <ArrowDown />
              </el-icon>
              <span :class="{ 'think-pulsing': viewFor(item).thinkOpen }">
                {{ viewFor(item).thinkOpen ? '思考中…' : '思考过程' }}
              </span>
            </button>
            <pre v-show="isThinkExpanded(item)" class="think-content">{{ viewFor(item).thinking }}</pre>
          </div>

          <div class="message-content" :class="item.role">
            <AssistantMarkdown
              v-if="item.role === 'assistant'"
              :content="viewFor(item).body"
              :streaming="item.status === 'streaming'"
            />
            <MdPreview v-else :model-value="item.content" />
          </div>

          <!-- 引用角标：点击定位到对应来源切片 -->
          <div
            v-if="item.role === 'assistant' && viewFor(item).citedIndices.length"
            class="citation-row"
          >
            <span class="citation-label">引用</span>
            <button
              v-for="ci in viewFor(item).citedIndices"
              :key="ci"
              type="button"
              class="citation-chip"
              @click="locateSource(item.id, ci)"
            >
              片段{{ ci }}
            </button>
          </div>

          <!-- 参考来源面板 -->
          <template v-if="item.role === 'assistant' && item.sources.length > 0 && item.status !== 'streaming'">
            <button type="button" class="sources-toggle" @click="toggleSources(item.id)">
              <el-icon :size="12" class="toggle-icon" :class="{ expanded: !!expandedSources[item.id] }">
                <ArrowDown />
              </el-icon>
              参考来源（{{ item.sources.length }}）
            </button>
            <SourceChunks
              v-if="expandedSources[item.id]"
              :chunks="item.sources"
              :cited-indices="viewFor(item).citedIndices"
              :highlight-index="highlightFor(item.id)"
            />
          </template>

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

    <Transition name="fade-up">
      <button v-if="showBackToBottom" class="back-to-bottom" type="button" @click="backToBottom">
        <el-icon :size="14"><ArrowDown /></el-icon>
        <span>回到底部</span>
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.message-list-wrapper {
  position: relative;
  height: 100%;
}

.message-list {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
}

/* ---------- 回到底部 ---------- */
.back-to-bottom {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 9999px;
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-primary);
  font-size: var(--md-sys-typescale-label-medium);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.back-to-bottom:hover {
  box-shadow: var(--shadow-lg);
  transform: translateX(-50%) translateY(-1px);
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
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
  margin-bottom: 16px;
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* ---------- 思考过程 ---------- */
.think-block {
  margin-bottom: 6px;
}

.think-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 6px;
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-small);
  cursor: pointer;
  transition: background 0.15s ease;
}

.think-toggle:hover {
  background: var(--md-sys-color-surface-container);
}

.think-pulsing {
  animation: think-pulse 1.2s ease-in-out infinite;
}

@keyframes think-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.think-content {
  margin: 6px 0 0;
  padding: 8px 12px;
  border-left: 2px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-low);
  border-radius: 0 8px 8px 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
  font-family: inherit;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}

/* ---------- 引用溯源 ---------- */
.citation-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.citation-label {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-outline);
}

.citation-chip {
  padding: 2px 10px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 9999px;
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-primary);
  font-size: var(--md-sys-typescale-label-small);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.citation-chip:hover {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-primary);
}

.sources-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
  cursor: pointer;
  transition: background 0.15s ease;
}

.sources-toggle:hover {
  background: var(--md-sys-color-surface-container);
}

.toggle-icon {
  transition: transform 0.2s ease;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
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
