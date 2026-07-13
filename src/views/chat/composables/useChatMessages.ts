import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createChatMessage,
  getChatMessages,
} from '@/api/chat'
import {
  generateAiChatStream,
} from '@/api/ai'
import { useAiConfigStore } from '@/stores/aiConfig'
import { track } from '@/utils/tracker'
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents'
import { startQaTimeline } from '@/utils/perfMetrics'
import type { AiChatHistoryMessage, AiChatRequest, AiChatStreamMeta } from '@/types/ai'
import { buildGeneralAiPrompt } from '@/utils/buildQaPrompt'
import { buildChatHistory, takeMessagesBeforeLastQuestion } from '@/utils/chatHistory'
import type {
  ChatAnswerMode,
  ChatMessage,
  ChatMessageStatus,
  ChatSourceChunk,
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
  question: string
  knowledgeBaseId: string | null
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
  handleStop: () => void
}

// ─── 工具函数（从 ChatView 提取） ───


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
  let activeAbortController: AbortController | null = null

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
    _history: AiChatHistoryMessage[] = [],
  ): Promise<PreparedQaRun> {
    const mode: ChatAnswerMode =
      qaConfig.useKnowledgeEnhanced && Boolean(knowledgeBaseId) ? 'knowledge-enhanced' : 'general-ai'

    return {
      mode,
      question,
      knowledgeBaseId,
    }
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
    // 多轮上下文：取当前提问之前的消息（重新生成时同时排除上一次回答），按预算裁剪。
    // 先于检索构建：prepareSmartQa 的指代消解改写需要读取历史。
    const history = buildChatHistory(
      takeMessagesBeforeLastQuestion(messages.value, input.question),
    )

    // 链路分段计时：检索耗时 / TTFT / 流式时长，入库供后台分析分位数
    const perf = startQaTimeline()

    const prepared = await prepareSmartQa(
      input.question,
      session.selectedKnowledgeBaseId.value || null,
      input.qaConfig,
      history,
    )
    perf.lap('retrieval_done')

    const localAssistantMessage = buildLocalPendingMessage({
      role: 'assistant',
      content: '',
      chatId: input.chatId,
      status: 'streaming',
      sources: [],
      answerMode: prepared.mode,
    })

    appendLocalMessage(localAssistantMessage)

    const abortController = new AbortController()
    activeAbortController = abortController

    let finalText = ''
    let finalStatus: ChatMessageStatus = 'done'
    let finalErrorMessage: string | null = null

    // 流式渲染合帧：SSE chunk 到达频率远高于刷新率，
    // 每帧最多触发一次响应式更新，避免高频 markdown 重渲染阻塞主线程。
    let pendingFrame: number | null = null
    const flushStreamingText = () => {
      pendingFrame = null
      updateMessageById(localAssistantMessage.id, (message) => ({
        ...message,
        content: finalText,
      }))
    }

    try {
      const config = await aiConfigStore.ensureConfig()
      if (!aiConfigStore.isComplete) {
        throw new Error(`请先在个人中心配置 AI API 信息：${aiConfigStore.missingFields.join('、')}`)
      }

      let request: AiChatRequest
      if (prepared.mode === 'knowledge-enhanced') {
        request = {
          stream: true,
          request: {
            kind: 'knowledge-enhanced',
            params: {
              temperature: 0.7,
              history,
            },
            knowledge: {
              knowledgeBaseId: prepared.knowledgeBaseId || undefined,
              question: prepared.question,
              history,
              systemPrompt: input.qaConfig.systemPrompt || undefined,
              answerStyle: input.qaConfig.answerStyle || undefined,
            },
          },
        }
      } else {
        request = {
          stream: true,
          request: {
            kind: 'plain',
            params: {
              userPrompt: buildGeneralAiPrompt(prepared.question, {
                systemInstruction: input.qaConfig.systemPrompt || undefined,
                answerStyle: input.qaConfig.answerStyle || undefined,
              }),
              history,
              temperature: 0.7,
            },
          },
        }
      }

      const result = await generateAiChatStream(request, {
        fallbackModel: config.model,
        signal: abortController.signal,
        onMeta: (meta: AiChatStreamMeta) => {
          if (Array.isArray(meta.sources)) {
            updateMessageById(localAssistantMessage.id, (message) => ({
              ...message,
              sources: meta.sources as ChatSourceChunk[],
              answerMode: meta.mode ?? message.answerMode ?? prepared.mode,
            }))
          } else if (meta.mode) {
            updateMessageById(localAssistantMessage.id, (message) => ({
              ...message,
              answerMode: meta.mode ?? message.answerMode ?? prepared.mode,
            }))
          }
        },
        onChunk: (chunk) => {
          if (!finalText) {
            perf.lap('first_token')
          }
          finalText += chunk
          if (pendingFrame === null) {
            pendingFrame = requestAnimationFrame(flushStreamingText)
          }
        },
      })
      perf.lap('stream_done')

      if (!result.success && !abortController.signal.aborted) {
        finalStatus = 'error'
        finalErrorMessage = result.error || 'AI 回答失败'
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        finalStatus = 'error'
        finalErrorMessage = error instanceof Error ? error.message : 'AI 回答失败'
      }
    } finally {
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame)
        pendingFrame = null
      }
      if (activeAbortController === abortController) {
        activeAbortController = null
      }
    }

    // 用户主动停止且尚无内容：撤掉占位消息，不落库
    if (abortController.signal.aborted && !finalText.trim()) {
      messages.value = messages.value.filter((item) => item.id !== localAssistantMessage.id)
      return
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

    const currentAssistantMeta = () => {
      const current = messages.value.find((item) => item.id === localAssistantMessage.id)
      return {
        mode: (current?.answerMode ?? prepared.mode) as ChatAnswerMode,
        sources: current?.sources ?? [],
      }
    }

    const savedAssistant = await persistAssistantFinal({
      chatId: input.chatId,
      localMessageId: localAssistantMessage.id,
      content: finalText,
      mode: currentAssistantMeta().mode,
      sources: currentAssistantMeta().sources,
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
        qa_mode: currentAssistantMeta().mode,
        qa_ai_provider: input.qaConfig.aiProvider,
        qa_use_knowledge_enhanced: input.qaConfig.useKnowledgeEnhanced,
        source_count: currentAssistantMeta().sources.length,
        answer_length: finalText.length,
        model: '',
        total_tokens: null,
      })
    }

    perf.finish({
      qa_mode: currentAssistantMeta().mode,
      source_count: currentAssistantMeta().sources.length,
      answer_length: finalText.length,
      status: finalStatus,
      aborted: abortController.signal.aborted,
    })

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

  // ─── 停止生成 ───
  function handleStop() {
    activeAbortController?.abort()
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
    handleStop,
  }
}