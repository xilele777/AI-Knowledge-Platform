import { getCurrentUser } from './auth'
import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import type {
  ApiResult,
  ChatAnswerMode,
  ChatListItem,
  ChatMessage,
  ChatMessageStatus,
  ChatRole,
  ChatSession,
  ChatSourceChunk,
  CreateChatInput,
  CreateChatMessageInput,
  KnowledgeChunkForQa,
} from '../types/chat'

type ChatRow = {
  id: string
  owner_id: string
  knowledge_base_id: string | null
  title: string
  created_at: string
  updated_at: string
}

type ChatMessageRow = {
  id: string
  chat_id: string
  owner_id: string
  role: ChatRole
  content: string
  sources?: unknown
  answer_mode?: unknown
  status?: unknown
  error_message?: unknown
  created_at: string
}

type KnowledgeChunkRow = {
  id: string
  knowledge_base_id: string
  file_id: string | null
  document_id: string | null
  source_type: 'file' | 'document' | null
  chunk_index: number
  content: string
  token_count: number | null
  meta: Record<string, unknown> | null
  embedding: number[] | null
  created_at: string
}

type KnowledgeFileNameRow = {
  id: string
  file_name: string
}

type DocumentTitleRow = {
  id: string
  title: string
}

const CHAT_TABLE = 'chats'
const CHAT_MESSAGE_TABLE = 'chat_messages'
const KNOWLEDGE_CHUNK_TABLE = 'knowledge_chunks'

function ok<T>(data?: T): ApiResult<T> {
  return {
    success: true,
    data: data ?? null,
    error: null,
  }
}

function fail<T>(message: string): ApiResult<T> {
  return {
    success: false,
    data: null,
    error: message,
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '请求失败，请稍后重试'
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("'" + column.toLowerCase() + "'") && lower.includes('chat_messages')
}

function isMissingSourcesColumnError(message: string): boolean {
  return isMissingColumnError(message, 'sources')
}

function isMissingAnswerModeColumnError(message: string): boolean {
  return isMissingColumnError(message, 'answer_mode')
}

function isMissingStatusColumnError(message: string): boolean {
  return isMissingColumnError(message, 'status')
}

function isMissingErrorMessageColumnError(message: string): boolean {
  return isMissingColumnError(message, 'error_message')
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('未登录或登录已过期')
  }

  return user.id
}

function toChatSession(row: ChatRow): ChatSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    knowledgeBaseId: row.knowledge_base_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toChatListItem(row: ChatRow): ChatListItem {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseSources(value: unknown): ChatSourceChunk[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const source = item as Record<string, unknown>

      const chunkId = source.chunkId
      const content = source.content

      if (typeof chunkId !== 'string' || typeof content !== 'string') {
        return null
      }

      const fileId = typeof source.fileId === 'string' ? source.fileId : null
      const documentId = typeof source.documentId === 'string' ? source.documentId : null
      const chunkIndex = typeof source.chunkIndex === 'number' ? source.chunkIndex : null
      const sourceType =
        source.sourceType === 'document' || source.sourceType === 'file'
          ? source.sourceType
          : documentId
            ? 'document'
            : 'file'
      const sourceName = typeof source.sourceName === 'string' ? source.sourceName : null
      const score = typeof source.score === 'number' ? source.score : 0
      const matchedKeywords = Array.isArray(source.matchedKeywords)
        ? source.matchedKeywords.filter((keyword): keyword is string => typeof keyword === 'string')
        : []

      return {
        chunkId,
        fileId,
        documentId,
        sourceType,
        sourceName,
        chunkIndex,
        content,
        score,
        matchedKeywords,
      }
    })
    .filter((item): item is ChatSourceChunk => Boolean(item))
}

function parseAnswerMode(value: unknown): ChatAnswerMode | null {
  if (value === 'general-ai' || value === 'knowledge-enhanced' || value === 'strict-knowledge') {
    return value
  }

  return null
}

function parseStatus(value: unknown): ChatMessageStatus {
  if (value === 'streaming' || value === 'done' || value === 'error') {
    return value
  }

  return 'done'
}

function parseErrorMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    ownerId: row.owner_id,
    role: row.role,
    content: row.content,
    sources: parseSources(row.sources),
    answerMode: parseAnswerMode(row.answer_mode),
    status: parseStatus(row.status),
    errorMessage: parseErrorMessage(row.error_message),
    createdAt: row.created_at,
  }
}

function toKnowledgeChunk(
  row: KnowledgeChunkRow,
  fileNameMap: Map<string, string>,
  documentTitleMap: Map<string, string>,
): KnowledgeChunkForQa {
  const sourceType = row.source_type === 'document' || row.document_id ? 'document' : 'file'
  const sourceName =
    sourceType === 'document'
      ? row.document_id
        ? documentTitleMap.get(row.document_id) ?? null
        : null
      : row.file_id
        ? fileNameMap.get(row.file_id) ?? null
        : null

  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    fileId: row.file_id,
    documentId: row.document_id,
    sourceType,
    sourceName,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    meta: row.meta,
    embedding: row.embedding,
    createdAt: row.created_at,
  }
}

function normalizeTitle(title: string | undefined, fallback = '新会话'): string {
  const value = (title || '').trim()
  if (!value) {
    return fallback
  }

  if (value.length <= 30) {
    return value
  }

  return value.slice(0, 30) + '...'
}

export async function createChat(input: CreateChatInput = {}): Promise<ApiResult<ChatSession>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const payload = {
      owner_id: userId,
      knowledge_base_id: input.knowledgeBaseId ?? null,
      title: normalizeTitle(input.title),
    }

    const { data, error } = await supabase
      .from(CHAT_TABLE)
      .insert(payload)
      .select('*')
      .single<ChatRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toChatSession(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getMyChats(limit = 100): Promise<ApiResult<ChatListItem[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from(CHAT_TABLE)
      .select('*')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)
      .returns<ChatRow[]>()

    if (error) {
      return fail(error.message)
    }

    return ok((data ?? []).map(toChatListItem))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getChatMessages(chatId: string): Promise<ApiResult<ChatMessage[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!chatId) {
      return fail('chatId 不能为空')
    }

    const { data, error } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .select('*')
      .eq('chat_id', chatId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .returns<ChatMessageRow[]>()

    if (
      error &&
      (isMissingSourcesColumnError(error.message) ||
        isMissingAnswerModeColumnError(error.message) ||
        isMissingStatusColumnError(error.message) ||
        isMissingErrorMessageColumnError(error.message))
    ) {
      const fallback = await supabase
        .from(CHAT_MESSAGE_TABLE)
        .select('id, chat_id, owner_id, role, content, created_at')
        .eq('chat_id', chatId)
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .returns<ChatMessageRow[]>()

      if (fallback.error) {
        return fail(fallback.error.message)
      }

      return ok(
        (fallback.data ?? []).map((item) =>
          toChatMessage({
            ...item,
            sources: [],
            answer_mode: null,
            status: 'done',
            error_message: null,
          }),
        ),
      )
    }

    if (error) {
      return fail(error.message)
    }

    return ok((data ?? []).map(toChatMessage))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function createChatMessage(
  input: CreateChatMessageInput,
): Promise<ApiResult<ChatMessage>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!input.chatId) {
      return fail('chatId 不能为空')
    }

    const content = input.content.trim()

    if (!content) {
      return fail('消息内容不能为空')
    }

    const payload = {
      chat_id: input.chatId,
      owner_id: userId,
      role: input.role,
      content,
      sources: input.sources ?? [],
      answer_mode: input.answerMode ?? null,
      status: input.status ?? 'done',
      error_message: input.errorMessage ?? null,
    }

    const { data, error } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .insert(payload)
      .select('*')
      .single<ChatMessageRow>()

    if (
      error &&
      (isMissingSourcesColumnError(error.message) ||
        isMissingAnswerModeColumnError(error.message) ||
        isMissingStatusColumnError(error.message) ||
        isMissingErrorMessageColumnError(error.message))
    ) {
      const fallback = await supabase
        .from(CHAT_MESSAGE_TABLE)
        .insert({
          chat_id: input.chatId,
          owner_id: userId,
          role: input.role,
          content,
        })
        .select('id, chat_id, owner_id, role, content, created_at')
        .single<ChatMessageRow>()

      if (fallback.error) {
        return fail(fallback.error.message)
      }

      return ok(
        toChatMessage({
          ...fallback.data,
          sources: input.sources ?? [],
          answer_mode: input.answerMode ?? null,
          status: input.status ?? 'done',
          error_message: input.errorMessage ?? null,
        }),
      )
    }

    if (error) {
      return fail(error.message)
    }

    return ok(toChatMessage(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getKnowledgeChunksForQa(
  knowledgeBaseId: string,
  limit = 400,
): Promise<ApiResult<KnowledgeChunkForQa[]>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!knowledgeBaseId) {
      return fail('knowledgeBaseId 不能为空')
    }

    const { data, error } = await supabase
      .from(KNOWLEDGE_CHUNK_TABLE)
      .select(
        'id, knowledge_base_id, file_id, document_id, source_type, chunk_index, content, token_count, meta, embedding, created_at',
      )
      .eq('owner_id', userId)
      .eq('knowledge_base_id', knowledgeBaseId)
      .order('chunk_index', { ascending: true })
      .limit(limit)
      .returns<KnowledgeChunkRow[]>()

    if (error) {
      return fail(error.message)
    }

    const rows = data ?? []

    const fileIds = Array.from(
      new Set(rows.map((item) => item.file_id).filter((item): item is string => Boolean(item))),
    )
    const documentIds = Array.from(
      new Set(rows.map((item) => item.document_id).filter((item): item is string => Boolean(item))),
    )

    const [filesResult, documentsResult] = await Promise.all([
      fileIds.length
        ? supabase
          .from('knowledge_files')
          .select('id, file_name')
          .eq('owner_id', userId)
          .in('id', fileIds)
          .returns<KnowledgeFileNameRow[]>()
        : Promise.resolve({ data: [] as KnowledgeFileNameRow[], error: null }),
      documentIds.length
        ? supabase
          .from('documents')
          .select('id, title')
          .eq('owner_id', userId)
          .in('id', documentIds)
          .returns<DocumentTitleRow[]>()
        : Promise.resolve({ data: [] as DocumentTitleRow[], error: null }),
    ])

    if (filesResult.error) {
      return fail(filesResult.error.message)
    }

    if (documentsResult.error) {
      return fail(documentsResult.error.message)
    }

    const fileNameMap = new Map((filesResult.data ?? []).map((item) => [item.id, item.file_name]))
    const documentTitleMap = new Map((documentsResult.data ?? []).map((item) => [item.id, item.title]))

    return ok(rows.map((item) => toKnowledgeChunk(item, fileNameMap, documentTitleMap)))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function deleteChat(chatId: string): Promise<ApiResult<void>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!chatId) {
      return fail('chatId 不能为空')
    }

    // First delete all messages in the chat
    const { error: messagesError } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .delete()
      .eq('chat_id', chatId)
      .eq('owner_id', userId)

    if (messagesError) {
      return fail(messagesError.message)
    }

    // Then delete the chat itself
    const { error: chatError } = await supabase
      .from(CHAT_TABLE)
      .delete()
      .eq('id', chatId)
      .eq('owner_id', userId)

    if (chatError) {
      return fail(chatError.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function deleteChatMessage(messageId: string): Promise<ApiResult<void>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    if (!messageId) {
      return fail('messageId 不能为空')
    }

    const { error } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .delete()
      .eq('id', messageId)
      .eq('owner_id', userId)

    if (error) {
      return fail(error.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}
