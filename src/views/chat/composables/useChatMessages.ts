import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createChatMessage,
  getChatMessages,
  getKnowledgeChunksForQa,
} from '@/api/chat'
import { generateAiTextStream } from '@/api/ai'
import { useAiConfigStore } from '@/stores/aiConfig'
import { track } from '@/utils/tracker'
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents'
import {
  hasValuableRetrievedChunks,
  retrieveRelevantChunks,
  type RetrieveChunkInput,
  type RetrievedChunk,
} from '@/utils/retrieveChunks'
import { createEmbedding, findTopSimilarChunks, type SimilarChunk } from '@/utils/vectorEmbedding'
import { buildGeneralAiPrompt, buildKnowledgeEnhancedPrompt } from '@/utils/buildQaPrompt'
import type {
  ChatAnswerMode,
  ChatMessage,
  ChatMessageStatus,
  ChatSourceChunk,
  KnowledgeChunkForQa,
} from '@/types/chat'
import type { KnowledgeQaConfig } from '@/types/knowledge'
import type { UseChatSessionReturn } from './useChatSession'

/** useChatSession 中 useChatMessages 需要访问的状态子集 */
export interface ChatSessionRefs {
  activeChatId: UseChatSessionReturn['activeChatId']
  selectedKnowledgeBaseId: UseChatSessionReturn['selectedKnowledgeBaseId']
  qaConfigForm: UseChatSessionReturn['qaConfigForm']
  prependOrUpdateChat: UseChatSessionReturn['prependOrUpdateChat']
  activeChat: UseChatSessionReturn['activeChat']
  getQaConfigRuntimeSnapshot: UseChatSessionReturn['getQaConfigRuntimeSnapshot']
  ensureActiveChat: UseChatSessionReturn['ensureActiveChat']
}

export interface PreparedQaRun {
  mode: ChatAnswerMode
  prompt: string
  sources: ChatSourceChunk[]
  contextChunks: ChatSourceChunk[]
}

export interface UseChatMessagesReturn {
  messages: Ref<ChatMessage[]>
  loadingMessages: Ref<boolean>
  sending: Ref<boolean>
  lastQuestion: Ref<string>
  lastQuestionChatId: Ref<string>
  canRegenerate: ComputedRef<boolean>
  loadMessages: (chatId: string) => Promise<void>
  handleSend: (question: string) => Promise<void>
  handleRegenerate: () => Promise<void>
}

// ─── 工具函数（从 ChatView 提取） ───

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

function hasValuableVectorChunks(chunks: RetrievedChunk<RetrieveChunkInput>[]): boolean {
  if (chunks.length === 0) return false
  const topScore = chunks[0]?.score ?? 0
  const averageScore = chunks.reduce((total, item) => total + item.score, 0) / chunks.length
  return topScore >= 0.2 && averageScore >= 0.12
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

/**
 * 消息收发 + 流式 AI 回答 + 知识检索
 *
 * 从 ChatView 中提取，负责：
 * - 消息列表加载
 * - 发送/重新生成
 * - 智能检索（向量 + 关键词）
 * - 流式 AI 调用
 */
export function useChatMessages(session: ChatSessionRefs) {
  const aiConfigStore = useAiConfigStore()

  const messages = ref<ChatMessage[]>([])
  const loadingMessages = ref(false)
  const sending = ref(false)
  const lastQuestion = ref('')
  const lastQuestionChatId = ref('')

  const canRegenerate = computed(() => Boolean(lastQuestion.value && lastQuestionChatId.value))

  // ─── 消息列表操作 ───
  function updateMessageById(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
    messages.value = messages.value.map((item) => (item.id === messageId ? updater(item) : item))
  }

  function appendLocalMessage(message: ChatMessage) {
    messages.value = [...messages.value, message]
  }

  // ─── 加载消息 ───
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

  // ─── 智能检索 ───
  async function prepareSmartQa(
    question: string,
    knowledgeBaseId: string | null,
    qaConfig: KnowledgeQaConfig,
  ): Promise<PreparedQaRun> {
    let retrieved: RetrievedChunk<RetrieveChunkInput>[] = []
    let retrievalStrategy: 'none' | 'vector' | 'keyword' = 'none'
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
          if (retrieved.length > 0) retrievalStrategy = 'vector'
        } catch (error) {
          console.warn('[chat.prepareSmartQa] embedding retrieval failed, fallback:', error)
        }
      }

      if (retrievalStrategy !== 'vector' || !hasValuableVectorChunks(retrieved)) {
        retrieved = retrieveRelevantChunks(question, mapChunksToRetrieveInputs(chunks), {
          topK: 5,
          minScore: 0.03,
        })
        retrievalStrategy = retrieved.length > 0 ? 'keyword' : 'none'
      }
    }

    const hasValuableSources =
      retrievalStrategy === 'vector'
        ? hasValuableVectorChunks(retrieved)
        : hasValuableRetrievedChunks(retrieved, {
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

    return { mode, prompt, sources, contextChunks: sources }
  }

  // ─── 持久化 AI 回答 ───
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
    if (!contentToSave) return null

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

  // ─── 调用 AI 生成回答 ───
  async function callAssistantAnswer(input: {
    chatId: string
    question: string
    qaConfig: KnowledgeQaConfig
    trackQuestionLength?: number
  }) {
    const prepared = await prepareSmartQa(
      input.question,
      session.selectedKnowledgeBaseId.value || null,
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
        },
      )

      if (!result.success) {
        finalStatus = 'error'
        finalErrorMessage = result.error || 'AI 回答失败'
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

    session.prependOrUpdateChat({
      id: input.chatId,
      knowledgeBaseId: session.selectedKnowledgeBaseId.value || null,
      title,
      createdAt: session.activeChat.value?.createdAt || updatedAt,
      updatedAt,
    })

    if (finalStatus === 'done') {
      void track(ANALYTICS_EVENTS.QA_SEND, {
        chat_id: input.chatId,
        knowledge_base_id: session.selectedKnowledgeBaseId.value || null,
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

  // ─── 发送消息 ───
  async function handleSend(question: string) {
    if (sending.value) return

    sending.value = true

    try {
      const chatId = await session.ensureActiveChat?.(question) ?? session.activeChatId.value

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

      messages.value = messages.value.map((item) =>
        item.id === localUserMessage.id ? userSaved.data! : item,
      )

      lastQuestion.value = question
      lastQuestionChatId.value = chatId

      const qaConfigSnapshot = session.getQaConfigRuntimeSnapshot()
      await callAssistantAnswer({
        chatId,
        question,
        qaConfig: qaConfigSnapshot,
        trackQuestionLength: question.length,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '发送失败，请稍后重试'
      ElMessage.error(msg)
    } finally {
      sending.value = false
    }
  }

  // ─── 重新生成 ───
  async function handleRegenerate() {
    if (sending.value) return

    if (!lastQuestion.value || !lastQuestionChatId.value) {
      ElMessage.warning('暂无可重新生成的问题')
      return
    }

    const chatId = session.activeChatId.value || lastQuestionChatId.value
    if (!chatId) {
      ElMessage.warning('当前无可用会话')
      return
    }

    sending.value = true

    try {
      const qaConfigSnapshot = session.getQaConfigRuntimeSnapshot()
      await callAssistantAnswer({
        chatId,
        question: lastQuestion.value,
        qaConfig: qaConfigSnapshot,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '重新生成失败'
      ElMessage.error(msg)
    } finally {
      sending.value = false
    }
  }

  return {
    messages,
    loadingMessages,
    sending,
    lastQuestion,
    lastQuestionChatId,
    canRegenerate,
    loadMessages,
    handleSend,
    handleRegenerate,
  }
}