import { assertSupabaseConfigured, supabase } from '../utils/supabase'

export interface AdminApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface AdminProfileItem {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  createdAt: string | null
}

export interface AdminDocumentItem {
  id: string
  title: string
  status: string
  ownerId: string
  authorName: string | null
  authorEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminKnowledgeFileItem {
  id: string
  fileName: string
  status: string
  knowledgeBaseId: string
  ownerId: string
  fileSize: number | null
  mimeType: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminChatRecordItem {
  chatId: string
  messageId: string
  title: string
  ownerId: string
  question: string
  answer: string
  createdAt: string
  chatUpdatedAt: string
}

export interface AdminDashboardStats {
  userCount: number
  documentCount: number
  fileCount: number
  chatCount: number
  messageCount: number
}

export interface AdminTrendPoint {
  date: string
  value: number
}

export interface AdminTopEventItem {
  eventName: string
  count: number
}

export interface AdminAnalyticsOverview {
  userCount: number
  documentCount: number
  knowledgeFileCount: number
  aiCallCount: number
  login7dTotal: number
  aiCall7dTotal: number
  activeUser7d: number
  documentCreated7d: number
  fileCreated7d: number
  avgAiCallsPerDay: number
  loginTrend: AdminTrendPoint[]
  aiCallTrend: AdminTrendPoint[]
  topEvents: AdminTopEventItem[]
}

type ProfileRow = {
  id: string
  email?: string | null
  full_name?: string | null
  nickname?: string | null
  name?: string | null
  display_name?: string | null
  role?: string | null
  created_at?: string | null
}

type DocumentRow = {
  id: string
  title: string
  status: string
  owner_id: string
  created_at: string
  updated_at: string
}

type KnowledgeFileRow = {
  id: string
  file_name: string
  status: string
  knowledge_base_id: string
  owner_id: string
  file_size: number | null
  mime_type: string | null
  created_at: string
  updated_at: string
}

type ChatRow = {
  id: string
  owner_id: string
  title: string
  updated_at: string
}

type ChatMessageRow = {
  id: string
  chat_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

const CHAT_TABLE = 'chats'
const CHAT_MESSAGE_TABLE = 'chat_messages'

type AdminProfileRpcRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
}

function ok<T>(data?: T): AdminApiResult<T> {
  return {
    success: true,
    data: data ?? null,
    error: null,
  }
}

function fail<T>(message: string): AdminApiResult<T> {
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

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function toTrendPoints(value: unknown): AdminTrendPoint[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const row = item as Record<string, unknown>
      const date = typeof row.date === 'string' ? row.date : ''

      if (!date) {
        return null
      }

      return {
        date,
        value: toNumber(row.value),
      }
    })
    .filter((item): item is AdminTrendPoint => Boolean(item))
}

function toTopEvents(value: unknown): AdminTopEventItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const row = item as Record<string, unknown>
      const eventName = typeof row.eventName === 'string' ? row.eventName : ''

      if (!eventName) {
        return null
      }

      return {
        eventName,
        count: toNumber(row.count),
      }
    })
    .filter((item): item is AdminTopEventItem => Boolean(item))
}

function resolveProfileName(row: ProfileRow): string | null {
  const fullName = row.full_name?.trim()
  if (fullName) {
    return fullName
  }

  const displayName = row.display_name?.trim()
  if (displayName) {
    return displayName
  }

  const name = row.name?.trim()
  if (name) {
    return name
  }

  const nickname = row.nickname?.trim()
  if (nickname) {
    return nickname
  }

  return null
}

async function queryProfiles(limit?: number, userIds?: string[]) {
  let builder = supabase
    .from('profiles')
    .select('*')

  if (Array.isArray(userIds) && userIds.length > 0) {
    builder = builder.in('id', userIds)
  }

  if (typeof limit === 'number' && limit > 0) {
    builder = builder.limit(limit)
  }

  const orderedResult = await builder
    .order('created_at', { ascending: false })
    .returns<ProfileRow[]>()

  if (!orderedResult.error) {
    return orderedResult
  }

  const message = orderedResult.error.message.toLowerCase()
  if (!message.includes('created_at')) {
    return orderedResult
  }

  // Fallback for schemas that do not have created_at on profiles.
  let fallbackBuilder = supabase
    .from('profiles')
    .select('*')

  if (Array.isArray(userIds) && userIds.length > 0) {
    fallbackBuilder = fallbackBuilder.in('id', userIds)
  }

  if (typeof limit === 'number' && limit > 0) {
    fallbackBuilder = fallbackBuilder.limit(limit)
  }

  return fallbackBuilder.returns<ProfileRow[]>()
}

function resolveProfileEmail(row: ProfileRow): string | null {
  const email = row.email?.trim()
  return email || null
}

async function fetchProfilesByIds(userIds: string[]): Promise<Map<string, AdminProfileItem>> {
  const profileMap = new Map<string, AdminProfileItem>()

  if (userIds.length === 0) {
    return profileMap
  }

  const { data, error } = await queryProfiles(undefined, userIds)

  if (error) {
    return profileMap
  }

  for (const row of data ?? []) {
    profileMap.set(row.id, {
      id: row.id,
      email: resolveProfileEmail(row),
      fullName: resolveProfileName(row),
      role: row.role ?? null,
      createdAt: row.created_at ?? null,
    })
  }

  return profileMap
}

export async function getAdminProfiles(limit = 100): Promise<AdminApiResult<AdminProfileItem[]>> {
  try {
    assertSupabaseConfigured()

    // Prefer backend RPC so admin can view all auth users even when profiles is partially populated.
    const rpcResult = await supabase.rpc('admin_get_profiles', {
      p_limit: Math.max(1, Math.min(1000, Math.floor(limit || 100))),
    })

    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      const rpcItems: AdminProfileItem[] = (rpcResult.data as AdminProfileRpcRow[]).map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        createdAt: row.created_at,
      }))

      return ok(rpcItems)
    }

    const { data, error } = await queryProfiles(limit)

    if (error) {
      return fail(error.message)
    }

    const items: AdminProfileItem[] = (data ?? []).map((row) => ({
      id: row.id,
      email: resolveProfileEmail(row),
      fullName: resolveProfileName(row),
      role: row.role ?? null,
      createdAt: row.created_at ?? null,
    }))

    return ok(items)
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminDocuments(limit = 100): Promise<AdminApiResult<AdminDocumentItem[]>> {
  try {
    assertSupabaseConfigured()

    const { data, error } = await supabase
      .from('documents')
      .select('id, title, status, owner_id, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit)
      .returns<DocumentRow[]>()

    if (error) {
      return fail(error.message)
    }

    const rows = data ?? []
    const ownerIds = Array.from(new Set(rows.map((item) => item.owner_id)))
    const profileMap = await fetchProfilesByIds(ownerIds)

    const items: AdminDocumentItem[] = rows.map((row) => {
      const profile = profileMap.get(row.owner_id)

      return {
        id: row.id,
        title: row.title,
        status: row.status,
        ownerId: row.owner_id,
        authorName: profile?.fullName ?? null,
        authorEmail: profile?.email ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })

    return ok(items)
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminKnowledgeFiles(
  limit = 100,
): Promise<AdminApiResult<AdminKnowledgeFileItem[]>> {
  try {
    assertSupabaseConfigured()

    const { data, error } = await supabase
      .from('knowledge_files')
      .select('id, file_name, status, knowledge_base_id, owner_id, file_size, mime_type, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit)
      .returns<KnowledgeFileRow[]>()

    if (error) {
      return fail(error.message)
    }

    const items: AdminKnowledgeFileItem[] = (data ?? []).map((row) => ({
      id: row.id,
      fileName: row.file_name,
      status: row.status,
      knowledgeBaseId: row.knowledge_base_id,
      ownerId: row.owner_id,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    return ok(items)
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminChatRecords(
  limit = 200,
): Promise<AdminApiResult<AdminChatRecordItem[]>> {
  try {
    assertSupabaseConfigured()

    const [chatRes, messageRes] = await Promise.all([
      supabase
        .from('chats')
        .select('id, owner_id, title, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit)
        .returns<ChatRow[]>(),
      supabase
        .from('chat_messages')
        .select('id, chat_id, role, content, created_at')
        .order('created_at', { ascending: false })
        .limit(limit * 2)
        .returns<ChatMessageRow[]>(),
    ])

    if (chatRes.error) {
      return fail(chatRes.error.message)
    }

    if (messageRes.error) {
      return fail(messageRes.error.message)
    }

    const chats = chatRes.data ?? []
    const messages = messageRes.data ?? []

    const chatMap = new Map<string, ChatRow>()
    for (const chat of chats) {
      chatMap.set(chat.id, chat)
    }

    const groupedMessages = new Map<string, ChatMessageRow[]>()
    for (const item of messages) {
      if (!groupedMessages.has(item.chat_id)) {
        groupedMessages.set(item.chat_id, [])
      }

      groupedMessages.get(item.chat_id)?.push(item)
    }

    const records: AdminChatRecordItem[] = []

    for (const [chatId, group] of groupedMessages.entries()) {
      const chat = chatMap.get(chatId)
      if (!chat) {
        continue
      }

      const ordered = [...group].sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      let pendingQuestion: ChatMessageRow | null = null

      for (const message of ordered) {
        if (message.role === 'user') {
          pendingQuestion = message
          continue
        }

        if (message.role === 'assistant' && pendingQuestion) {
          records.push({
            chatId,
            messageId: message.id,
            title: chat.title,
            ownerId: chat.owner_id,
            question: pendingQuestion.content,
            answer: message.content,
            createdAt: message.created_at,
            chatUpdatedAt: chat.updated_at,
          })
          pendingQuestion = null
        }
      }

      if (pendingQuestion) {
        records.push({
          chatId,
          messageId: pendingQuestion.id,
          title: chat.title,
          ownerId: chat.owner_id,
          question: pendingQuestion.content,
          answer: '',
          createdAt: pendingQuestion.created_at,
          chatUpdatedAt: chat.updated_at,
        })
      }
    }

    records.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return ok(records.slice(0, limit))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

async function fetchTableCount(tableName: string): Promise<number> {
  const { count, error } = await supabase.from(tableName).select('id', { count: 'exact', head: true })

  if (error) {
    return 0
  }

  return count ?? 0
}

export async function getAdminDashboardStats(): Promise<AdminApiResult<AdminDashboardStats>> {
  try {
    assertSupabaseConfigured()

    const [userCount, documentCount, fileCount, chatCount, messageCount] = await Promise.all([
      fetchTableCount('profiles'),
      fetchTableCount('documents'),
      fetchTableCount('knowledge_files'),
      fetchTableCount('chats'),
      fetchTableCount('chat_messages'),
    ])

    return ok({
      userCount,
      documentCount,
      fileCount,
      chatCount,
      messageCount,
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminAnalyticsOverview(
  days = 7,
): Promise<AdminApiResult<AdminAnalyticsOverview>> {
  try {
    assertSupabaseConfigured()

    const normalizedDays = Math.max(1, Math.min(30, Math.floor(days || 7)))

    const { data, error } = await supabase.rpc('admin_get_analytics_overview', {
      p_days: normalizedDays,
    })

    if (error) {
      return fail(error.message)
    }

    const payload = (data || {}) as Record<string, unknown>

    return ok({
      userCount: toNumber(payload.userCount),
      documentCount: toNumber(payload.documentCount),
      knowledgeFileCount: toNumber(payload.knowledgeFileCount),
      aiCallCount: toNumber(payload.aiCallCount),
      login7dTotal: toNumber(payload.login7dTotal),
      aiCall7dTotal: toNumber(payload.aiCall7dTotal),
      activeUser7d: toNumber(payload.activeUser7d),
      documentCreated7d: toNumber(payload.documentCreated7d),
      fileCreated7d: toNumber(payload.fileCreated7d),
      avgAiCallsPerDay: toNumber(payload.avgAiCallsPerDay),
      loginTrend: toTrendPoints(payload.loginTrend),
      aiCallTrend: toTrendPoints(payload.aiCallTrend),
      topEvents: toTopEvents(payload.topEvents),
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminDeleteChat(chatId: string): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!chatId) {
      return fail('chatId 不能为空')
    }

    // First delete all messages in the chat
    const { error: messagesError } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .delete()
      .eq('chat_id', chatId)

    if (messagesError) {
      return fail(messagesError.message)
    }

    // Then delete the chat itself
    const { error: chatError } = await supabase
      .from(CHAT_TABLE)
      .delete()
      .eq('id', chatId)

    if (chatError) {
      return fail(chatError.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminDeleteChatMessage(messageId: string): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!messageId) {
      return fail('messageId 不能为空')
    }

    const { error } = await supabase
      .from(CHAT_MESSAGE_TABLE)
      .delete()
      .eq('id', messageId)

    if (error) {
      return fail(error.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}
