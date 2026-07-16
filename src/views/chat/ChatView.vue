<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete } from '@element-plus/icons-vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useKeyboardShortcut } from '@/composables/useKeyboardShortcut'
import ChatInput from './components/ChatInput.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import EmptyStateActionable from '@/components/shared/EmptyStateActionable.vue'
import { useChatSession } from './composables/useChatSession'
import { useChatMessages } from './composables/useChatMessages'

const route = useRoute()
const router = useRouter()
const aiConfigStore = useAiConfigStore()

const session = useChatSession()
const chatMessages = useChatMessages(session)

const {
  knowledgeBases,
  chats,
  activeChatId,
  selectedKnowledgeBaseId,
  loadingChats,
  savingQaConfig,
  errorText,
  showQaConfigDrawer,
  hasChats,
  selectedKnowledgeBaseName,
  qaConfigForm,
  qaSummaryText,
  canSaveQaConfig,
  loadKnowledgeBases,
  loadChats,
  switchChat,
  resetDraftSession,
  deleteChatById,
  applyQaConfigFromSelectedKnowledgeBase,
  handleSaveQaConfigAsDefault,
  handleResetQaConfigDraft,
} = session

const {
  messages,
  loadingMessages,
  sending,
  lastQuestion,
  lastQuestionChatId,
  canRegenerate,
  loadMessages,
  handleSend,
  handleRegenerate,
  handleStop,
} = chatMessages

// ─── 切换会话时自动加载消息 ───
const originalSwitchChat = switchChat
function switchChatAndLoad(chat: typeof chats.value[number]) {
  originalSwitchChat(chat)
  void loadMessages(chat.id)
}

// ─── 新建对话：进入空白草稿态，下一次发送时再创建真实会话 ───
function startNewChat() {
  resetDraftSession()
  messages.value = []
  lastQuestion.value = ''
  lastQuestionChatId.value = ''
}

// ─── 删除会话时清理关联状态 ───
async function handleDeleteChat(chatId: string, event: Event) {
  event.stopPropagation()
  const success = await deleteChatById(chatId)
  if (success && chatId === activeChatId.value) {
    messages.value = []
    lastQuestion.value = ''
    lastQuestionChatId.value = ''
  }
}

// ─── 格式化日期 ───
function formatDate(text: string): string {
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ─── 初始化 ───
async function bootstrap() {
  try {
    errorText.value = ''
    await Promise.all([
      loadKnowledgeBases({
        preferCache: true,
        silent: Boolean(session.listCacheStore.isFresh(session.listCacheStore.knowledgeBases)),
      }),
      aiConfigStore.loadConfig(),
    ])

    if (!session.listCacheStore.isFresh(session.listCacheStore.chats)) {
      await loadChats({ preferCache: true })
    } else {
      await loadChats({ preferCache: true, silent: true })
    }

    const queryKb = typeof route.query.knowledgeBaseId === 'string' ? route.query.knowledgeBaseId : ''
    if (queryKb) {
      selectedKnowledgeBaseId.value = queryKb
    } else if (knowledgeBases.value.length > 0) {
      selectedKnowledgeBaseId.value = knowledgeBases.value[0].id
    }

    applyQaConfigFromSelectedKnowledgeBase()

    if (route.query.new === '1') {
      startNewChat()
      void router.replace({ path: route.path, query: { ...route.query, new: undefined } })
      return
    }

    if (activeChatId.value) {
      await loadMessages(activeChatId.value)

      const active = chats.value.find((item) => item.id === activeChatId.value)
      if (active?.knowledgeBaseId) {
        selectedKnowledgeBaseId.value = active.knowledgeBaseId
      }
      applyQaConfigFromSelectedKnowledgeBase()

      const latestUser = [...messages.value].reverse().find((item) => item.role === 'user')
      if (latestUser) {
        lastQuestion.value = latestUser.content
        lastQuestionChatId.value = latestUser.chatId
      }
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '页面初始化失败'
  }
}

onMounted(() => {
  void bootstrap()
})

// ─── 键盘快捷键 ───
useKeyboardShortcut({
  'ctrl+n': () => startNewChat(),
  'escape': () => { showQaConfigDrawer.value = false },
})
</script>

<template>
  <div class="chat-app">
    <div v-if="errorText" class="error-banner">
      {{ errorText }}
    </div>

    <div class="chat-layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">AI 助手</h1>
          <el-button size="small" @click="startNewChat" class="new-chat-btn">
            新建对话
          </el-button>
        </div>

        <div class="kb-selector">
          <el-select v-model="selectedKnowledgeBaseId" placeholder="选择知识库" class="kb-select" filterable>
            <el-option
              v-for="kb in knowledgeBases"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            />
          </el-select>
        </div>

        <div class="chat-list" v-loading="loadingChats">
          <EmptyStateActionable
            v-if="!hasChats && !loadingChats"
            icon="empty-chat"
            title="还没有对话"
            description="选择知识库，输入你的第一个问题"
            action-text="开始对话"
            :show-action="false"
          />

          <div
            v-for="chat in chats"
            :key="chat.id"
            class="chat-item"
            :class="{ active: chat.id === activeChatId }"
            @click="switchChatAndLoad(chat)"
          >
            <div class="chat-item-indicator" />
            <div class="chat-item-content">
              <div class="chat-title">{{ chat.title }}</div>
              <div class="chat-date">{{ formatDate(chat.updatedAt) }}</div>
            </div>
            <el-button
              size="small"
              circle
              @click="handleDeleteChat(chat.id, $event)"
              class="delete-btn"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <header class="chat-header">
          <div class="header-left">
            <span class="header-kb">{{ selectedKnowledgeBaseName || '未选择知识库' }}</span>
            <span class="header-summary">{{ qaSummaryText }}</span>
          </div>
          <el-button size="small" @click="showQaConfigDrawer = true" class="settings-btn">
            设置
          </el-button>
        </header>

        <div class="messages-container">
          <ChatMessageList :messages="messages" :loading="loadingMessages" />
        </div>

        <div class="input-container">
          <ChatInput
            :loading="sending"
            :can-regenerate="canRegenerate"
            @send="handleSend"
            @regenerate="handleRegenerate"
            @stop="handleStop"
          />
        </div>
      </main>
    </div>

    <el-drawer
      v-model="showQaConfigDrawer"
      title="问答配置"
      size="420px"
      :destroy-on-close="false"
      class="config-drawer"
    >
      <el-form label-position="top" class="qa-config-form">
        <el-form-item label="System Prompt">
          <el-input
            v-model="qaConfigForm.systemPrompt"
            type="textarea"
            :rows="4"
            resize="vertical"
            maxlength="4000"
            show-word-limit
            placeholder="可选：用于覆盖默认系统指令"
          />
        </el-form-item>

        <el-form-item label="回答风格">
          <el-input
            v-model="qaConfigForm.answerStyle"
            type="textarea"
            :rows="3"
            resize="vertical"
            maxlength="1000"
            show-word-limit
            placeholder="可选：如 '先结论后依据，控制在 3 条要点内'"
          />
        </el-form-item>

        <el-form-item label="知识库增强">
          <el-switch
            v-model="qaConfigForm.useKnowledgeEnhanced"
            active-text="优先结合知识库参考"
            inactive-text="仅纯 AI 回答"
          />
        </el-form-item>

        <div class="qa-config-actions">
          <el-button @click="handleResetQaConfigDraft">恢复默认</el-button>
          <el-button
            type="primary"
            :disabled="!canSaveQaConfig"
            :loading="savingQaConfig"
            @click="handleSaveQaConfigAsDefault"
          >
            保存为默认
          </el-button>
        </div>
      </el-form>
    </el-drawer>
  </div>
</template>

<style scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--md-sys-color-surface-container);
}

.error-banner {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-error);
  padding: 12px 24px;
  font-size: var(--md-sys-typescale-body-medium);
  text-align: center;
}

.chat-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: var(--md-sys-color-surface-container-low);
  border-right: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-title {
  font-size: var(--md-sys-typescale-title-large);
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
  margin: 0;
}

.new-chat-btn {
  flex-shrink: 0;
}

.kb-selector {
  padding: 16px 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.kb-select {
  width: 100%;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-chats {
  text-align: center;
  color: var(--md-sys-color-outline);
  font-size: var(--md-sys-typescale-body-medium);
  padding: 24px 12px;
}

.chat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.18s ease;
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.chat-item:hover {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-outline);
  transform: translateY(-1px);
}

.chat-item.active {
  background: color-mix(in srgb, var(--md-sys-color-primary-container) 82%, white 18%);
  border-color: color-mix(in srgb, var(--md-sys-color-primary) 40%, var(--md-sys-color-outline-variant) 60%);
  box-shadow: 0 10px 20px rgba(26, 115, 232, 0.12);
}

.chat-item-indicator {
  width: 4px;
  align-self: stretch;
  border-radius: 999px;
  background: transparent;
  flex-shrink: 0;
}

.chat-item.active .chat-item-indicator {
  background: var(--md-sys-color-primary);
}

.chat-item-content {
  flex: 1;
  min-width: 0;
}

.chat-title {
  font-size: var(--md-sys-typescale-body-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  line-height: 1.4;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item.active .chat-title {
  color: var(--md-sys-color-primary);
}

.chat-date {
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
}

.delete-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  border: none;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.delete-btn:hover {
  color: var(--md-sys-color-error);
  background: var(--md-sys-color-error-container);
}

.chat-item:hover .delete-btn {
  opacity: 1;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--md-sys-color-surface-container-lowest);
}

.chat-header {
  height: 48px;
  padding: 0 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--md-sys-color-surface-container-lowest);
  flex-shrink: 0;
}

.header-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.header-kb {
  font-size: var(--md-sys-typescale-body-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  white-space: nowrap;
}

.header-summary {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-btn {
  flex-shrink: 0;
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--md-sys-color-surface-container-low);
}

.input-container {
  flex-shrink: 0;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
}

.qa-config-form {
  padding-right: 10px;
}

.qa-config-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.chat-list::-webkit-scrollbar {
  width: 6px;
}

.chat-list::-webkit-scrollbar-track {
  background: transparent;
}

.chat-list::-webkit-scrollbar-thumb {
  background: var(--md-sys-color-outline-variant);
  border-radius: 3px;
}

.chat-list::-webkit-scrollbar-thumb:hover {
  background: var(--md-sys-color-outline);
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }
}
</style>
