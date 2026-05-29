<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import {
  createChat,
  createChatMessage,
  getChatMessages,
  getKnowledgeChunksForQa,
  getMyChats,
  deleteChat,
} from '../../api/chat'
import {
  getMyKnowledgeBases,
  normalizeKnowledgeQaConfig,
  updateKnowledgeBaseQaConfig,
} from '../../api/knowledge'

import { useAiConfigStore } from '../../stores/aiConfig'
import type {
  ChatAnswerMode,
  ChatListItem,
  ChatMessage,
  ChatMessageStatus,
  ChatSourceChunk,
  KnowledgeChunkForQa,
} from '../../types/chat'
import type { KnowledgeBaseListItem, KnowledgeQaConfig } from '../../types/knowledge'
import {
  hasValuableRetrievedChunks,
  retrieveRelevantChunks,
  type RetrieveChunkInput,
  type RetrievedChunk,
} from '../../utils/retrieveChunks'
import { createEmbedding, findTopSimilarChunks, type SimilarChunk } from '../../utils/vectorEmbedding'
import { buildGeneralAiPrompt, buildKnowledgeEnhancedPrompt } from '../../utils/buildQaPrompt'
import ChatInput from './components/ChatInput.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'
import { generateAiTextStream } from '../../api/ai'

const route = useRoute()
const aiConfigStore = useAiConfigStore()

const loadingChats = ref(false)
const loadingMessages = ref(false)
const sending = ref(false)
const savingQaConfig = ref(false)
const errorText = ref('')
const showQaConfigDrawer = ref(false)

const knowledgeBases = ref<KnowledgeBaseListItem[]>([])
const chats = ref<ChatListItem[]>([])
const messages = ref<ChatMessage[]>([])

const activeChatId = ref('')
const selectedKnowledgeBaseId = ref('')
const lastQuestion = ref('')
const lastQuestionChatId = ref('')

const qaConfigForm = reactive<KnowledgeQaConfig>(normalizeKnowledgeQaConfig(null))

const hasChats = computed(() => chats.value.length > 0)
const canRegenerate = computed(() => Boolean(lastQuestion.value && lastQuestionChatId.value))

const activeChat = computed(() => chats.value.find((item) => item.id === activeChatId.value) || null)

const selectedKnowledgeBaseName = computed(() => {
  const found = knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value)
  return found?.name || '未选择知识库'
})

const qaSummaryText = computed(() => {
  const modeText = qaConfigForm.useKnowledgeEnhanced ? '知识增强优先' : '纯 AI 回答'
  return modeText
})

const canSaveQaConfig = computed(() => Boolean(selectedKnowledgeBaseId.value))

function applyQaConfig(config: KnowledgeQaConfig) {
  const normalized = normalizeKnowledgeQaConfig(config)
  qaConfigForm.systemPrompt = normalized.systemPrompt
  qaConfigForm.answerStyle = normalized.answerStyle
  qaConfigForm.useKnowledgeEnhanced = normalized.useKnowledgeEnhanced
  qaConfigForm.aiProvider = 'custom'
  qaConfigForm.customAi.baseUrl = ''
  qaConfigForm.customAi.apiKey = ''
  qaConfigForm.customAi.model = ''
}

function applyQaConfigFromSelectedKnowledgeBase() {
  const selected = knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value)
  applyQaConfig(selected?.qaConfig ? selected.qaConfig : normalizeKnowledgeQaConfig(null))
}

function getQaConfigRuntimeSnapshot(): KnowledgeQaConfig {
  return normalizeKnowledgeQaConfig({
    systemPrompt: qaConfigForm.systemPrompt,
    answerStyle: qaConfigForm.answerStyle,
    useKnowledgeEnhanced: qaConfigForm.useKnowledgeEnhanced,
    aiProvider: 'custom',
    customAi: {
      baseUrl: '',
      apiKey: '',
      model: '',
    },
  })
}

function getQaConfigSaveSnapshot(): KnowledgeQaConfig {
  return normalizeKnowledgeQaConfig({
    systemPrompt: qaConfigForm.systemPrompt,
    answerStyle: qaConfigForm.answerStyle,
    useKnowledgeEnhanced: qaConfigForm.useKnowledgeEnhanced,
    aiProvider: 'custom',
    customAi: {
      baseUrl: '',
      apiKey: '',
      model: '',
    },
  })
}

watch(
  () => selectedKnowledgeBaseId.value,
  () => {
    applyQaConfigFromSelectedKnowledgeBase()
  },
)

function formatDate(text: string): string {
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

function toSourceChunks(items: RetrievedChunk<RetrieveChunkInput>[]): ChatSourceChunk[] {
  return items.map((item) => ({
    chunkId: String(item.id ?? ''),
    fileId: typeof item.fileId === 'string' ? item.fileId : null,
    documentId: typeof item.documentId === 'string' ? item.documentId : null,
    sourceType: item.sourceType === 'document' ? 'document' : 'file',
    sourceName: typeof item.sourceName === 'string' ? item.sourceName : null,
    chunkIndex: typeof item.chunkIndex === 'number' ? item.chunkIndex : null,
    content: String(item.content ?? ''),
    score: item.score,
    matchedKeywords: item.matchedKeywords,
  }))
}

function prependOrUpdateChat(chat: ChatListItem) {
  const without = chats.value.filter((item) => item.id !== chat.id)
  chats.value = [chat, ...without]
}

function updateMessageById(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
  messages.value = messages.value.map((item) => (item.id === messageId ? updater(item) : item))
}

function appendLocalMessage(message: ChatMessage) {
  messages.value = [...messages.value, message]
}

function buildLocalPendingMessage(input: {
  role: ChatMessage['role']
  content: string
  chatId: string
  status?: ChatMessageStatus
  sources?: ChatSourceChunk[]
  answerMode?: ChatAnswerMode | null
  errorMessage?: string | null
}): ChatMessage {
  const now = new Date().toISOString()
  return {
    id: 'pending-' + String(Date.now()) + '-' + String(Math.random()),
    chatId: input.chatId,
    ownerId: 'pending-owner',
    role: input.role,
    content: input.content,
    sources: input.sources ?? [],
    answerMode: input.answerMode ?? null,
    status: input.status ?? 'done',
    errorMessage: input.errorMessage ?? null,
    createdAt: now,
  }
}

function mapChunksToRetrieveInputs(chunks: KnowledgeChunkForQa[]): RetrieveChunkInput[] {
  return chunks.map((item) => ({
    id: item.id,
    fileId: item.fileId,
    documentId: item.documentId,
    sourceType: item.sourceType,
    sourceName: item.sourceName,
    chunkIndex: item.chunkIndex,
    content: item.content,
  }))
}

interface PreparedQaRun {
  mode: ChatAnswerMode
  prompt: string
  sources: ChatSourceChunk[]
  contextChunks: ChatSourceChunk[]
}

async function prepareSmartQa(
  question: string,
  knowledgeBaseId: string | null,
  qaConfig: KnowledgeQaConfig,
): Promise<PreparedQaRun> {
  let retrieved: RetrievedChunk<RetrieveChunkInput>[] = []
  const shouldRetrieveKnowledge = qaConfig.useKnowledgeEnhanced && Boolean(knowledgeBaseId)

  if (shouldRetrieveKnowledge && knowledgeBaseId) {
    const chunkResult = await getKnowledgeChunksForQa(knowledgeBaseId, 500)

    if (!chunkResult.success || !chunkResult.data) {
      throw new Error(chunkResult.error || '查询知识切片失败')
    }

    const chunks = chunkResult.data
    const chunksWithEmbeddings = chunks.filter((chunk) => chunk.embedding !== null)

    if (chunksWithEmbeddings.length > 0 && aiConfigStore.isComplete) {
      try {
        const config = await aiConfigStore.ensureConfig()
        const embeddingResult = await createEmbedding(question, config)

        const similarChunks = findTopSimilarChunks(
          embeddingResult.embedding,
          chunksWithEmbeddings.map((chunk) => ({
            item: chunk,
            embedding: chunk.embedding as number[],
          })),
          5,
          0.1,
        )

        retrieved = similarChunks.map((result: SimilarChunk<KnowledgeChunkForQa>) => ({
          id: result.item.id,
          fileId: result.item.fileId,
          documentId: result.item.documentId,
          sourceType: result.item.sourceType,
          sourceName: result.item.sourceName,
          chunkIndex: result.item.chunkIndex,
          content: result.item.content,
          score: result.similarity,
          hitCount: 0,
          matchedKeywords: [],
        }))
      } catch (error) {
        console.warn('[chat.prepareSmartQa] embedding retrieval failed, fallback to keyword retrieval:', error)
      }
    }

    if (retrieved.length === 0) {
      retrieved = retrieveRelevantChunks(question, mapChunksToRetrieveInputs(chunks), {
        topK: 5,
        minScore: 0.03,
      })
    }
  }

  const hasValuableSources = hasValuableRetrievedChunks(retrieved, {
    minTopScore: 0.1,
    minHitCount: 2,
    minAverageScore: 0.06,
  })

  const useKnowledgeEnhancedMode = shouldRetrieveKnowledge && hasValuableSources
  const mode: ChatAnswerMode = useKnowledgeEnhancedMode ? 'knowledge-enhanced' : 'general-ai'
  const usedChunks = hasValuableSources ? retrieved : []

  const prompt =
    mode === 'knowledge-enhanced'
      ? buildKnowledgeEnhancedPrompt(question, usedChunks, {
          systemInstruction: qaConfig.systemPrompt || undefined,
          answerStyle: qaConfig.answerStyle || undefined,
        })
      : buildGeneralAiPrompt(question, {
          systemInstruction: qaConfig.systemPrompt || undefined,
          answerStyle: qaConfig.answerStyle || undefined,
        })

  const sources = toSourceChunks(usedChunks)

  return {
    mode,
    prompt,
    sources,
    contextChunks: sources,
  }
}

async function loadKnowledgeBases() {
  const result = await getMyKnowledgeBases()

  if (!result.success || !result.data) {
    throw new Error(result.error || '获取知识库失败')
  }

  knowledgeBases.value = result.data
}

async function loadChats() {
  loadingChats.value = true

  try {
    const result = await getMyChats(100)

    if (!result.success) {
      throw new Error(result.error || '获取会话列表失败')
    }

    chats.value = result.data || []

    if (!activeChatId.value && chats.value.length > 0) {
      activeChatId.value = chats.value[0].id
    }
  } finally {
    loadingChats.value = false
  }
}

async function loadMessages(chatId: string) {
  if (!chatId) {
    messages.value = []
    return
  }

  loadingMessages.value = true

  try {
    const result = await getChatMessages(chatId)

    if (!result.success) {
      throw new Error(result.error || '获取消息失败')
    }

    messages.value = result.data || []
  } finally {
    loadingMessages.value = false
  }
}

function resetDraftSession() {
  activeChatId.value = ''
  messages.value = []
  errorText.value = ''
}

async function switchChat(chat: ChatListItem) {
  activeChatId.value = chat.id
  if (chat.knowledgeBaseId) {
    selectedKnowledgeBaseId.value = chat.knowledgeBaseId
  }
  await loadMessages(chat.id)
}

async function ensureActiveChat(question: string): Promise<string> {
  if (activeChatId.value) {
    return activeChatId.value
  }

  const created = await createChat({
    knowledgeBaseId: selectedKnowledgeBaseId.value || null,
    title: question,
  })

  if (!created.success || !created.data) {
    throw new Error(created.error || '创建会话失败')
  }

  activeChatId.value = created.data.id

  prependOrUpdateChat({
    id: created.data.id,
    knowledgeBaseId: created.data.knowledgeBaseId,
    title: created.data.title,
    createdAt: created.data.createdAt,
    updatedAt: created.data.updatedAt,
  })

  return created.data.id
}

async function persistAssistantFinal(input: {
  chatId: string
  localMessageId: string
  content: string
  mode: ChatAnswerMode
  sources: ChatSourceChunk[]
  status: ChatMessageStatus
  errorMessage: string | null
}) {
  const contentToSave = input.content.trim() || (input.status === 'error' ? '生成未完成' : '')

  if (!contentToSave) {
    return null
  }

  const assistantSaved = await createChatMessage({
    chatId: input.chatId,
    role: 'assistant',
    content: contentToSave,
    sources: input.sources,
    answerMode: input.mode,
    status: input.status,
    errorMessage: input.errorMessage,
  })

  if (!assistantSaved.success || !assistantSaved.data) {
    throw new Error(assistantSaved.error || '保存 AI 消息失败')
  }

  messages.value = messages.value.map((item) =>
    item.id === input.localMessageId ? assistantSaved.data! : item,
  )

  return assistantSaved.data
}

async function callAssistantAnswer(input: {
  chatId: string
  question: string
  qaConfig: KnowledgeQaConfig
  trackQuestionLength?: number
}) {
  const prepared = await prepareSmartQa(
    input.question,
    selectedKnowledgeBaseId.value || null,
    input.qaConfig,
  )

  const localAssistantMessage = buildLocalPendingMessage({
    role: 'assistant',
    content: '',
    chatId: input.chatId,
    status: 'streaming',
    sources: prepared.sources,
    answerMode: prepared.mode,
  })

  appendLocalMessage(localAssistantMessage)

  let finalText = ''
  let finalStatus: ChatMessageStatus = 'done'
  let finalErrorMessage: string | null = null

  try {
    const config = await aiConfigStore.ensureConfig()
    if (!aiConfigStore.isComplete) {
      throw new Error(`请先在个人中心配置 AI API 信息：${aiConfigStore.missingFields.join('、')}`)
    }

    const result = await generateAiTextStream(
      { userPrompt: prepared.prompt },
      config,
      (chunk) => {
        finalText += chunk
        updateMessageById(localAssistantMessage.id, (message) => ({
          ...message,
          content: finalText,
        }))
      }
    )

    if (!result.success) {
      finalStatus = 'error'
      finalErrorMessage = result.error || 'AI 回答失败'
    } else {
      finalStatus = 'done'
    }
  } catch (error) {
    finalStatus = 'error'
    finalErrorMessage = error instanceof Error ? error.message : 'AI 回答失败'
  }

  if (finalStatus === 'error' && !finalText.trim()) {
    finalText = 'AI 回答失败，请检查配置或稍后重试。'
  }

  updateMessageById(localAssistantMessage.id, (message) => ({
    ...message,
    content: finalText,
    status: finalStatus,
    errorMessage: finalErrorMessage,
  }))

  const savedAssistant = await persistAssistantFinal({
    chatId: input.chatId,
    localMessageId: localAssistantMessage.id,
    content: finalText,
    mode: prepared.mode,
    sources: prepared.sources,
    status: finalStatus,
    errorMessage: finalErrorMessage,
  })

  const title = input.question.length <= 20 ? input.question : input.question.slice(0, 20) + '...'
  const updatedAt = savedAssistant?.createdAt || new Date().toISOString()

  prependOrUpdateChat({
    id: input.chatId,
    knowledgeBaseId: selectedKnowledgeBaseId.value,
    title,
    createdAt: activeChat.value?.createdAt || updatedAt,
    updatedAt,
  })

  if (finalStatus === 'done') {
    void track(ANALYTICS_EVENTS.QA_SEND, {
      chat_id: input.chatId,
      knowledge_base_id: selectedKnowledgeBaseId.value || null,
      question_length: input.trackQuestionLength ?? input.question.length,
      qa_mode: prepared.mode,
      qa_ai_provider: input.qaConfig.aiProvider,
      qa_use_knowledge_enhanced: input.qaConfig.useKnowledgeEnhanced,
      source_count: prepared.sources.length,
      answer_length: finalText.length,
      model: '',
      total_tokens: null,
    })
  }

  if (finalStatus === 'error') {
    ElMessage.error(finalErrorMessage || 'AI 回答失败')
  }
}

async function handleSend(question: string) {
  if (sending.value) {
    return
  }

  sending.value = true
  errorText.value = ''

  try {
    const chatId = await ensureActiveChat(question)

    const localUserMessage = buildLocalPendingMessage({
      role: 'user',
      content: question,
      chatId,
      status: 'done',
    })
    appendLocalMessage(localUserMessage)

    const userSaved = await createChatMessage({
      chatId,
      role: 'user',
      content: question,
      status: 'done',
    })

    if (!userSaved.success || !userSaved.data) {
      throw new Error(userSaved.error || '保存用户消息失败')
    }

    messages.value = messages.value.map((item) => (item.id === localUserMessage.id ? userSaved.data! : item))

    lastQuestion.value = question
    lastQuestionChatId.value = chatId

    const qaConfigSnapshot = getQaConfigRuntimeSnapshot()
    await callAssistantAnswer({
      chatId,
      question,
      qaConfig: qaConfigSnapshot,
      trackQuestionLength: question.length,
    })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '发送失败，请稍后重试'
    ElMessage.error(errorText.value)
  } finally {
    sending.value = false
  }
}

async function handleRegenerate() {
  if (sending.value) {
    return
  }

  if (!lastQuestion.value || !lastQuestionChatId.value) {
    ElMessage.warning('暂无可重新生成的问题')
    return
  }

  const chatId = activeChatId.value || lastQuestionChatId.value
  if (!chatId) {
    ElMessage.warning('当前无可用会话')
    return
  }

  sending.value = true
  errorText.value = ''

  try {
    const qaConfigSnapshot = getQaConfigRuntimeSnapshot()
    await callAssistantAnswer({
      chatId,
      question: lastQuestion.value,
      qaConfig: qaConfigSnapshot,
    })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '重新生成失败'
    ElMessage.error(errorText.value)
  } finally {
    sending.value = false
  }
}

async function handleSaveQaConfigAsDefault() {
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请先选择知识库')
    return
  }

  savingQaConfig.value = true

  try {
    const config = getQaConfigSaveSnapshot()
    const result = await updateKnowledgeBaseQaConfig(selectedKnowledgeBaseId.value, config)

    if (!result.success || !result.data) {
      throw new Error(result.error || '保存问答配置失败')
    }

    const savedConfig = normalizeKnowledgeQaConfig(result.data)

    knowledgeBases.value = knowledgeBases.value.map((item) => {
      if (item.id !== selectedKnowledgeBaseId.value) {
        return item
      }
      return {
        ...item,
        qaConfig: savedConfig,
      }
    })

    ElMessage.success('已保存为当前知识库默认问答配置')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存问答配置失败')
  } finally {
    savingQaConfig.value = false
  }
}

async function handleDeleteChat(chatId: string, event: Event) {
  event.stopPropagation()
  
  try {
    const confirmed = await new Promise((resolve) => {
      ElMessageBox.confirm('确定要删除这个会话吗？删除后无法恢复。', '删除确认', {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      }).then(() => resolve(true)).catch(() => resolve(false))
    })

    if (!confirmed) {
      return
    }

    const result = await deleteChat(chatId)
    if (!result.success) {
      throw new Error(result.error || '删除失败')
    }

    if (chatId === activeChatId.value) {
      activeChatId.value = ''
      messages.value = []
      lastQuestion.value = ''
      lastQuestionChatId.value = ''
    }

    chats.value = chats.value.filter((chat) => chat.id !== chatId)

    ElMessage.success('会话已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
    }
  }
}

function handleResetQaConfigDraft() {
  applyQaConfigFromSelectedKnowledgeBase()
}

async function bootstrap() {
  try {
    errorText.value = ''
    await Promise.all([loadKnowledgeBases(), loadChats(), aiConfigStore.loadConfig()])

    const queryKb = typeof route.query.knowledgeBaseId === 'string' ? route.query.knowledgeBaseId : ''
    if (queryKb) {
      selectedKnowledgeBaseId.value = queryKb
    } else if (knowledgeBases.value.length > 0) {
      selectedKnowledgeBaseId.value = knowledgeBases.value[0].id
    }

    applyQaConfigFromSelectedKnowledgeBase()

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
          <el-button size="small" @click="resetDraftSession" class="new-chat-btn">
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

        <div class="chat-list">
          <div v-if="!hasChats && !loadingChats" class="empty-chats">
            暂无历史对话
          </div>

          <div
            v-for="chat in chats"
            :key="chat.id"
            class="chat-item"
            :class="{ active: chat.id === activeChatId }"
            @click="switchChat(chat)"
          >
            <div class="chat-item-content">
              <div class="chat-title">{{ chat.title }}</div>
              <div class="chat-date">{{ formatDate(chat.updatedAt) }}</div>
            </div>
            <el-button
              type="danger"
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
            <h2 class="header-title">智能对话</h2>
            <p class="header-subtitle">
              {{ selectedKnowledgeBaseName }} · {{ qaSummaryText }}
            </p>
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
  height: 100vh;
  background: #f3f4f6;
}

.error-banner {
  background: #fee2e2;
  color: #dc2626;
  padding: 12px 24px;
  font-size: 14px;
  text-align: center;
}

.chat-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.new-chat-btn {
  flex-shrink: 0;
}

.kb-selector {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
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
  gap: 4px;
}

.empty-chats {
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
  padding: 24px 12px;
}

.chat-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-item:hover {
  background: #f3f4f6;
}

.chat-item.active {
  background: #eff6ff;
}

.chat-item-content {
  flex: 1;
  min-width: 0;
}

.chat-title {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  line-height: 1.4;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item.active .chat-title {
  color: #1d4ed8;
  font-weight: 600;
}

.chat-date {
  font-size: 12px;
  color: #9ca3af;
}

.delete-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.chat-item:hover .delete-btn {
  opacity: 1;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #ffffff;
}

.chat-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fafafa;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
}

.header-subtitle {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
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
  background: #fafafa;
}

.input-container {
  flex-shrink: 0;
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
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
  background: #d1d5db;
  border-radius: 3px;
}

.chat-list::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
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
