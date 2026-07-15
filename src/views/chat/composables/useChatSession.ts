import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createChat,
  deleteChat,
  getMyChats,
} from '@/api/chat'
import {
  getMyKnowledgeBases,
  normalizeKnowledgeQaConfig,
  updateKnowledgeBaseQaConfig,
} from '@/api/knowledge'
import { useListCacheStore } from '@/stores/listCache'
import { apiDedupe } from '@/utils/apiDedupe'
import type { ChatListItem } from '@/types/chat'
import type { KnowledgeBaseListItem, KnowledgeQaConfig } from '@/types/knowledge'

export interface UseChatSessionReturn {
  // 状态
  listCacheStore: ReturnType<typeof useListCacheStore>
  knowledgeBases: Ref<KnowledgeBaseListItem[]>
  chats: Ref<ChatListItem[]>
  activeChatId: Ref<string>
  selectedKnowledgeBaseId: Ref<string>
  loadingChats: Ref<boolean>
  savingQaConfig: Ref<boolean>
  errorText: Ref<string>
  showQaConfigDrawer: Ref<boolean>

  // 计算属性
  hasChats: ComputedRef<boolean>
  activeChat: ComputedRef<ChatListItem | null>
  selectedKnowledgeBaseName: ComputedRef<string>

  // QA 配置
  qaConfigForm: KnowledgeQaConfig
  qaSummaryText: ComputedRef<string>
  canSaveQaConfig: ComputedRef<boolean>

  // 方法
  loadKnowledgeBases: (opts?: { silent?: boolean; preferCache?: boolean }) => Promise<void>
  loadChats: (opts?: { silent?: boolean; preferCache?: boolean }) => Promise<void>
  switchChat: (chat: ChatListItem) => void
  resetDraftSession: () => void
  ensureActiveChat: (question: string) => Promise<string>
  deleteChatById: (chatId: string) => Promise<boolean>
  prependOrUpdateChat: (chat: ChatListItem) => void
  applyQaConfigFromSelectedKnowledgeBase: () => void
  getQaConfigRuntimeSnapshot: () => KnowledgeQaConfig
  handleSaveQaConfigAsDefault: () => Promise<void>
  handleResetQaConfigDraft: () => void
}

/**
 * 会话管理 + 知识库选择 + QA 配置
 *
 * 从 ChatView 中提取，负责：
 * - 知识库列表加载与选择
 * - 会话列表 CRUD
 * - QA 配置表单与持久化
 */
export function useChatSession() {
  const listCacheStore = useListCacheStore()

  // ─── 状态 ───
  const knowledgeBases = ref<KnowledgeBaseListItem[]>([])
  const chats = ref<ChatListItem[]>([])
  const activeChatId = ref('')
  const selectedKnowledgeBaseId = ref('')
  const loadingChats = ref(false)
  const savingQaConfig = ref(false)
  const errorText = ref('')
  const showQaConfigDrawer = ref(false)

  const qaConfigForm = reactive<KnowledgeQaConfig>(normalizeKnowledgeQaConfig(null))

  // ─── 计算属性 ───
  const hasChats = computed(() => chats.value.length > 0)

  const activeChat = computed(() =>
    chats.value.find((item) => item.id === activeChatId.value) || null,
  )

  const selectedKnowledgeBaseName = computed(() => {
    const found = knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value)
    return found?.name || '未选择知识库'
  })

  const qaSummaryText = computed(() => {
    return qaConfigForm.useKnowledgeEnhanced ? '知识增强优先' : '纯 AI 回答'
  })

  const canSaveQaConfig = computed(() => Boolean(selectedKnowledgeBaseId.value))

  // ─── QA 配置工具函数 ───
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
      customAi: { baseUrl: '', apiKey: '', model: '' },
    })
  }

  function getQaConfigSaveSnapshot(): KnowledgeQaConfig {
    return normalizeKnowledgeQaConfig({
      systemPrompt: qaConfigForm.systemPrompt,
      answerStyle: qaConfigForm.answerStyle,
      useKnowledgeEnhanced: qaConfigForm.useKnowledgeEnhanced,
      aiProvider: 'custom',
      customAi: { baseUrl: '', apiKey: '', model: '' },
    })
  }

  watch(
    () => selectedKnowledgeBaseId.value,
    () => {
      applyQaConfigFromSelectedKnowledgeBase()
    },
  )

  // ─── 知识库 ───
  async function loadKnowledgeBases(opts?: { silent?: boolean; preferCache?: boolean }) {
    if (opts?.preferCache && listCacheStore.knowledgeBases) {
      knowledgeBases.value = listCacheStore.getData(listCacheStore.knowledgeBases) ?? []
    }

    const runner = async () => {
      const result = await apiDedupe.dedupe('knowledgeBases:list', () => getMyKnowledgeBases())
      if (!result.success || !result.data) {
        throw new Error(result.error || '获取知识库失败')
      }
      listCacheStore.setKnowledgeBases(result.data)
      knowledgeBases.value = result.data
    }

    if (opts?.silent && knowledgeBases.value.length > 0) {
      try {
        await runner()
      } catch {
        // 静默刷新失败时保留旧数据
      }
      return
    }

    await runner()
  }

  // ─── 会话 CRUD ───
  async function loadChats(opts?: { silent?: boolean; preferCache?: boolean }) {
    if (opts?.preferCache && listCacheStore.chats) {
      chats.value = listCacheStore.getData(listCacheStore.chats) ?? []
      if (!activeChatId.value && chats.value.length > 0) {
        activeChatId.value = chats.value[0].id
      }
    }

    const runner = async () => {
      const result = await apiDedupe.dedupe('chats:list', () => getMyChats(100))
      if (!result.success) {
        throw new Error(result.error || '获取会话列表失败')
      }
      const next = result.data || []
      listCacheStore.setChats(next)
      chats.value = next
      if (!activeChatId.value && chats.value.length > 0) {
        activeChatId.value = chats.value[0].id
      }
    }

    if (opts?.silent && chats.value.length > 0) {
      try {
        await runner()
      } catch {
        // 静默刷新失败时保留旧数据
      }
      return
    }

    loadingChats.value = true
    try {
      await runner()
    } finally {
      loadingChats.value = false
    }
  }

  function prependOrUpdateChat(chat: ChatListItem) {
    const without = chats.value.filter((item) => item.id !== chat.id)
    const next = [chat, ...without]
    chats.value = next
    listCacheStore.setChats(next)
  }

  function switchChat(chat: ChatListItem) {
    activeChatId.value = chat.id
    if (chat.knowledgeBaseId) {
      selectedKnowledgeBaseId.value = chat.knowledgeBaseId
    }
  }

  function resetDraftSession() {
    activeChatId.value = ''
    errorText.value = ''
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

  async function deleteChatById(chatId: string): Promise<boolean> {
    try {
      await ElMessageBox.confirm('确定要删除这个会话吗？删除后无法恢复。', '删除确认', {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      })

      const result = await deleteChat(chatId)
      if (!result.success) {
        throw new Error(result.error || '删除失败')
      }

      if (chatId === activeChatId.value) {
        activeChatId.value = ''
      }

      chats.value = chats.value.filter((chat) => chat.id !== chatId)
      listCacheStore.removeChat(chatId)
      ElMessage.success('会话已删除')
      return true
    } catch (error) {
      if (error !== 'cancel' && !(error instanceof Error && error.message.includes('cancel'))) {
        ElMessage.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
      }
      return false
    }
  }

  // ─── QA 配置持久化 ───
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
        if (item.id !== selectedKnowledgeBaseId.value) return item
        return { ...item, qaConfig: savedConfig }
      })
      listCacheStore.setKnowledgeBases(knowledgeBases.value)

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

  listCacheStore.registerRevalidator('knowledgeBases', () =>
    loadKnowledgeBases({ silent: true, preferCache: true }),
  )
  listCacheStore.registerRevalidator('chats', () =>
    loadChats({ silent: true, preferCache: true }),
  )

  return {
    listCacheStore,
    knowledgeBases,
    chats,
    activeChatId,
    selectedKnowledgeBaseId,
    loadingChats,
    savingQaConfig,
    errorText,
    showQaConfigDrawer,
    hasChats,
    activeChat,
    selectedKnowledgeBaseName,
    qaConfigForm,
    qaSummaryText,
    canSaveQaConfig,
    loadKnowledgeBases,
    loadChats,
    switchChat,
    resetDraftSession,
    ensureActiveChat,
    deleteChatById,
    prependOrUpdateChat,
    applyQaConfigFromSelectedKnowledgeBase,
    getQaConfigRuntimeSnapshot,
    handleSaveQaConfigAsDefault,
    handleResetQaConfigDraft,
  }
}