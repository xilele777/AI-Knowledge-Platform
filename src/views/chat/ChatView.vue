<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  createChat,
  createChatMessage,
  getChatMessages,
  getKnowledgeChunksForQa,
  getMyChats,
} from '../../api/chat'
import {
  getMyKnowledgeBases,
  normalizeKnowledgeQaConfig,
  updateKnowledgeBaseQaConfig,
} from '../../api/knowledge'
import { useAIStream } from '../../composables/useAIStream'
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
import { buildGeneralAiPrompt, buildKnowledgeEnhancedPrompt } from '../../utils/buildQaPrompt'
import ChatInput from './components/ChatInput.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

const route = useRoute()
const stream = useAIStream()

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
const streamingAssistantId = ref('')

const qaConfigForm = reactive<KnowledgeQaConfig>(normalizeKnowledgeQaConfig(null))

const hasChats = computed(() => chats.value.length > 0)
const hasMessages = computed(() => messages.value.length > 0)
const canRegenerate = computed(() => Boolean(lastQuestion.value && lastQuestionChatId.value))

const activeChat = computed(() => chats.value.find((item) => item.id === activeChatId.value) || null)

const selectedKnowledgeBaseName = computed(() => {
  const found = knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value)
  return found?.name || '未选择知识库'
})

const qaSummaryText = computed(() => {
  const modeText = qaConfigForm.useKnowledgeEnhanced ? '知识增强优先' : '纯 AI 回答'
  const providerText = qaConfigForm.aiProvider === 'custom' ? '自定义模型' : '默认模型'
  return modeText + ' / ' + providerText
})

const canSaveQaConfig = computed(() => Boolean(selectedKnowledgeBaseId.value))

function applyQaConfig(config: KnowledgeQaConfig) {
  const normalized = normalizeKnowledgeQaConfig(config)
  qaConfigForm.systemPrompt = normalized.systemPrompt
  qaConfigForm.answerStyle = normalized.answerStyle
  qaConfigForm.useKnowledgeEnhanced = normalized.useKnowledgeEnhanced
  qaConfigForm.aiProvider = normalized.aiProvider
  qaConfigForm.customAi.baseUrl = normalized.customAi.baseUrl
  qaConfigForm.customAi.apiKey = normalized.customAi.apiKey
  qaConfigForm.customAi.model = normalized.customAi.model
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
    aiProvider: qaConfigForm.aiProvider,
    customAi: {
      baseUrl: qaConfigForm.customAi.baseUrl,
      apiKey: qaConfigForm.customAi.apiKey,
      model: qaConfigForm.customAi.model,
    },
  })
}

function getQaConfigSaveSnapshot(): KnowledgeQaConfig {
  return normalizeKnowledgeQaConfig({
    systemPrompt: qaConfigForm.systemPrompt,
    answerStyle: qaConfigForm.answerStyle,
    useKnowledgeEnhanced: qaConfigForm.useKnowledgeEnhanced,
    aiProvider: qaConfigForm.aiProvider,
    customAi: {
      baseUrl: qaConfigForm.customAi.baseUrl,
      apiKey: '',
      model: qaConfigForm.customAi.model,
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
    return '--'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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

    retrieved = retrieveRelevantChunks(question, mapChunksToRetrieveInputs(chunkResult.data), {
      topK: 5,
      minScore: 0.03,
    })
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

function handleStopGenerate() {
  if (!sending.value) {
    return
  }

  stream.stop()
}

function resetDraftSession() {
  if (sending.value) {
    handleStopGenerate()
  }

  activeChatId.value = ''
  messages.value = []
  errorText.value = ''
}

async function switchChat(chat: ChatListItem) {
  if (sending.value) {
    handleStopGenerate()
  }

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

async function streamAssistantAnswer(input: {
  chatId: string
  question: string
  qaConfig: KnowledgeQaConfig
  trackQuestionLength?: number
}) {
  const trimmedBaseUrl = input.qaConfig.customAi.baseUrl.trim()
  const trimmedApiKey = input.qaConfig.customAi.apiKey.trim()
  const trimmedModel = input.qaConfig.customAi.model.trim()

  const requestedModel = input.qaConfig.aiProvider === 'custom' && trimmedModel ? trimmedModel : ''
  const runtimeConfig =
    input.qaConfig.aiProvider === 'custom' && (trimmedBaseUrl || trimmedApiKey || trimmedModel)
      ? {
          baseUrl: trimmedBaseUrl || undefined,
          apiKey: trimmedApiKey || undefined,
          model: trimmedModel || undefined,
        }
      : undefined

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
  streamingAssistantId.value = localAssistantMessage.id

  let streamError: Error | null = null

  try {
    await stream.start(
      {
        scene: 'kb-chat',
        model: requestedModel || undefined,
        runtimeConfig,
        userPrompt: prepared.prompt,
        contextChunks: prepared.contextChunks,
        mode: prepared.mode,
        temperature: 0.2,
      },
      {
        onToken(token) {
          updateMessageById(localAssistantMessage.id, (message) => ({
            ...message,
            content: message.content + token,
          }))
        },
      },
    )
  } catch (error) {
    streamError = error instanceof Error ? error : new Error('AI 回答失败')
  }

  const finalLocal = messages.value.find((item) => item.id === localAssistantMessage.id)
  const finalText = finalLocal?.content || ''
  const stopped = stream.stoppedByUser.value
  const isError = Boolean(streamError)

  const finalStatus: ChatMessageStatus = isError ? 'error' : 'done'
  const finalErrorMessage = isError
    ? stopped
      ? '用户手动停止生成'
      : streamError?.message || 'AI 回答失败'
    : null

  updateMessageById(localAssistantMessage.id, (message) => ({
    ...message,
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

  if (!isError) {
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

  if (isError && !stopped) {
    throw streamError || new Error('AI 回答失败')
  }

  if (stopped) {
    ElMessage.info('已停止生成，已保留当前内容')
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
    await streamAssistantAnswer({
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
    streamingAssistantId.value = ''
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
    await streamAssistantAnswer({
      chatId,
      question: lastQuestion.value,
      qaConfig: qaConfigSnapshot,
    })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '重新生成失败'
    ElMessage.error(errorText.value)
  } finally {
    sending.value = false
    streamingAssistantId.value = ''
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

function handleResetQaConfigDraft() {
  applyQaConfigFromSelectedKnowledgeBase()
}

async function bootstrap() {
  try {
    errorText.value = ''
    await Promise.all([loadKnowledgeBases(), loadChats()])

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
  <div class="chat-page">
    <el-alert
      v-if="errorText"
      :title="errorText"
      type="error"
      show-icon
      :closable="false"
      class="chat-error"
    />

    <div class="chat-layout">
      <aside class="chat-sidebar" v-loading="loadingChats">
        <div class="sidebar-top">
          <div class="sidebar-title">历史会话</div>
          <el-button size="small" @click="resetDraftSession">新建会话</el-button>
        </div>

        <el-select v-model="selectedKnowledgeBaseId" placeholder="选择知识库" class="kb-select" filterable>
          <el-option
            v-for="kb in knowledgeBases"
            :key="kb.id"
            :label="kb.name"
            :value="kb.id"
          />
        </el-select>

        <el-empty v-if="!hasChats && !loadingChats" description="暂无历史会话" />

        <div v-else class="chat-history">
          <div
            v-for="chat in chats"
            :key="chat.id"
            class="history-item"
            :class="{ active: chat.id === activeChatId }"
            @click="switchChat(chat)"
          >
            <div class="title">{{ chat.title }}</div>
            <div class="time">{{ formatDate(chat.updatedAt) }}</div>
          </div>
        </div>
      </aside>

      <section class="chat-main">
        <header class="chat-header">
          <div class="header-main">
            <div>
              <div class="header-title">智能问答</div>
              <div class="header-subtitle">
                当前知识库：{{ selectedKnowledgeBaseName }} ｜ 问答模式：{{ qaSummaryText }}
              </div>
            </div>
            <el-button size="small" @click="showQaConfigDrawer = true">问答配置</el-button>
          </div>
        </header>

        <div class="chat-content">
          <ChatMessageList :messages="messages" :loading="loadingMessages" />
          <div v-if="!hasMessages && !loadingMessages" class="chat-empty-tip">
            <el-empty description="输入问题开始智能问答：有高相关参考时增强回答，无有效参考时直接由通用 AI 回答" />
          </div>
        </div>

        <ChatInput
          :loading="sending"
          :can-regenerate="canRegenerate"
          @send="handleSend"
          @stop="handleStopGenerate"
          @regenerate="handleRegenerate"
        />
      </section>
    </div>

    <el-drawer
      v-model="showQaConfigDrawer"
      title="问答配置"
      size="540px"
      :destroy-on-close="false"
    >
      <el-form label-position="top" class="qa-config-form">
        <el-alert
          title="AI 调用统一走 Supabase Edge Function，API Key 仅保存在 Supabase secrets。"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />

        <el-form-item label="System Prompt">
          <el-input
            v-model="qaConfigForm.systemPrompt"
            type="textarea"
            :rows="5"
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
            placeholder="可选：如“先结论后依据，控制在 3 条要点内”"
          />
        </el-form-item>

        <el-form-item label="知识库增强">
          <el-switch
            v-model="qaConfigForm.useKnowledgeEnhanced"
            active-text="优先结合知识库参考"
            inactive-text="仅纯 AI 回答"
          />
        </el-form-item>

        <el-form-item label="模型来源">
          <el-radio-group v-model="qaConfigForm.aiProvider">
            <el-radio value="default">默认模型（OPENAI_MODEL）</el-radio>
            <el-radio value="custom">自定义模型名</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="qaConfigForm.aiProvider === 'custom'">
          <el-form-item label="baseUrl">
            <el-input
              v-model="qaConfigForm.customAi.baseUrl"
              placeholder="https://api.scnet.cn/api/llm/v1"
            />
          </el-form-item>

          <el-form-item label="apiKey">
            <el-input
              v-model="qaConfigForm.customAi.apiKey"
              type="password"
              show-password
              placeholder="sk-..."
            />
            <div class="qa-config-hint">API Key 仅用于当前会话，不会保存到知识库默认配置。</div>
          </el-form-item>

          <el-form-item label="model">
            <el-input v-model="qaConfigForm.customAi.model" placeholder="例如：MiniMax-M2.5" />
          </el-form-item>
        </template>

        <div class="qa-config-actions">
          <el-button @click="handleResetQaConfigDraft">恢复知识库默认配置</el-button>
          <el-button
            type="primary"
            :disabled="!canSaveQaConfig"
            :loading="savingQaConfig"
            @click="handleSaveQaConfigAsDefault"
          >
            保存为当前知识库默认问答配置
          </el-button>
        </div>
      </el-form>
    </el-drawer>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.chat-error {
  margin-bottom: 2px;
  flex-shrink: 0;
}

.chat-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 12px;
  min-height: 0;
}

.chat-sidebar {
  border: 1px solid #e3eaf5;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.sidebar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: #22324b;
}

.kb-select {
  width: 100%;
  flex-shrink: 0;
}

.chat-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  padding-right: 2px;
  flex: 1;
  min-height: 0;
}

.history-item {
  border: 1px solid #e6ecf7;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.history-item:hover {
  border-color: #b7cdf7;
  background: #f6f9ff;
}

.history-item.active {
  border-color: #79a9ff;
  background: #edf4ff;
}

.history-item .title {
  font-size: 14px;
  color: #1f2d3d;
  line-height: 1.4;
  margin-bottom: 4px;
}

.history-item .time {
  font-size: 12px;
  color: #8ea0b8;
}

.chat-main {
  border: 1px solid #e3eaf5;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chat-header {
  padding: 12px 14px;
  border-bottom: 1px solid #e8edf4;
  background: linear-gradient(90deg, #f8fbff 0%, #f3f9ff 100%);
  flex-shrink: 0;
}

.header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #20314a;
}

.header-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #5b6f8f;
}

.chat-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: auto;
}

.chat-empty-tip {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qa-config-form {
  padding-right: 6px;
}

.qa-config-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.qa-config-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #8ea0b8;
}

@media (max-width: 960px) {
  .chat-layout {
    grid-template-columns: 1fr;
  }

  .chat-sidebar {
    max-height: 260px;
    flex-shrink: 0;
  }

  .header-main {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
