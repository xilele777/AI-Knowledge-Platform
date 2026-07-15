import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import { invokeEdgeFunction } from '../utils/serverProxy'

export interface AdminApiResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface AdminPageQuery {
  page?: number
  pageSize?: number
}

export interface AdminPagedData<T> {
  items: T[]
  total: number
}

export interface AdminProfileItem {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  createdAt: string | null
  isBanned?: boolean
}

export interface AdminUpdateUserRoleInput {
  userId: string
  role: 'user' | 'admin'
}

export interface AdminCreateUserInput {
  email: string
  password: string
  fullName: string
  role: 'user' | 'admin'
}

export interface AdminSetUserBanInput {
  userId: string
  banned: boolean
}

export interface AdminDocumentItem {
  id: string
  title: string
  status: string
  isShared: boolean
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

export interface AdminDashboardStats {
  userCount: number
  documentCount: number
  knowledgeBaseCount: number
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

export interface AdminQaPerfStats {
  sampleCount: number
  retrievalP50: number | null
  retrievalP95: number | null
  ttftP50: number | null
  ttftP95: number | null
  streamP50: number | null
  streamP95: number | null
  totalP50: number | null
  totalP95: number | null
}

export interface AdminFeErrorSourceItem {
  source: string
  count: number
}

export interface AdminFeErrorMessageItem {
  message: string
  count: number
}

export interface AdminFeErrorStats {
  total: number
  bySource: AdminFeErrorSourceItem[]
  topMessages: AdminFeErrorMessageItem[]
}

export interface AdminAnalyticsOverview {
  userCount: number
  documentCount: number
  knowledgeFileCount: number
  aiCallCount: number
  loginTotal: number
  aiCallTotal: number
  activeUserCount: number
  documentCreatedTotal: number
  fileCreatedTotal: number
  avgAiCallsPerDay: number
  loginTrend: AdminTrendPoint[]
  aiCallTrend: AdminTrendPoint[]
  topEvents: AdminTopEventItem[]
  qaPerf: AdminQaPerfStats
  feError: AdminFeErrorStats
}

export interface AdminAnalyticsRangeInput {
  days?: number
  startDate?: string
  endDate?: string
}

export interface AdminOperationLogItem {
  id: string
  actorUserId: string | null
  actorEmail: string | null
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  status: string
  details: Record<string, unknown>
  createdAt: string
}

export interface AdminOperationLogQuery extends AdminPageQuery {
  action?: string
  targetType?: string
  status?: string
  search?: string
}

export interface AdminProfilesQuery extends AdminPageQuery {
  search?: string
  role?: 'user' | 'admin'
}

export interface AdminProfileStats {
  total: number
  admins: number
  users: number
  banned: number
}

export interface AdminProfilesPage extends AdminPagedData<AdminProfileItem> {
  stats: AdminProfileStats
}

export interface AdminDocumentsQuery extends AdminPageQuery {
  search?: string
  shared?: boolean
}

export interface AdminDocumentStats {
  total: number
  shared: number
  private: number
}

export interface AdminKnowledgeFilesQuery extends AdminPageQuery {
  search?: string
}

export interface AdminKnowledgeFileStats {
  total: number
  processing: number
  ready: number
}

export interface AdminOperationLogStats {
  total: number
  success: number
  failure: number
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
  is_shared: boolean
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

type AdminProfileRpcRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
  is_banned?: boolean | null
  filtered_count?: number | string | null
  total_count?: number | string | null
  admin_count?: number | string | null
  banned_count?: number | string | null
}

type AdminOperationLogRow = {
  id: string
  actor_user_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_id: string | null
  target_label: string | null
  status: string
  details: Record<string, unknown> | null
  created_at: string
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

const DEFAULT_PAGE_SIZE = 10

function resolvePage(query: AdminPageQuery): { from: number; to: number; pageSize: number } {
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize || DEFAULT_PAGE_SIZE)))
  const page = Math.max(1, Math.floor(query.page || 1))
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1, pageSize }
}

function escapeIlike(keyword: string): string {
  return keyword.replace(/[%_]/g, (char) => `\\${char}`)
}

async function countRows(tableName: string, match?: Record<string, unknown>): Promise<number> {
  let builder = supabase.from(tableName).select('id', { count: 'exact', head: true })

  if (match) {
    builder = builder.match(match)
  }

  const { count, error } = await builder

  if (error) {
    return 0
  }

  return count ?? 0
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

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = toNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function toQaPerfStats(value: unknown): AdminQaPerfStats {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    sampleCount: toNumber(row.sampleCount),
    retrievalP50: toNullableNumber(row.retrievalP50),
    retrievalP95: toNullableNumber(row.retrievalP95),
    ttftP50: toNullableNumber(row.ttftP50),
    ttftP95: toNullableNumber(row.ttftP95),
    streamP50: toNullableNumber(row.streamP50),
    streamP95: toNullableNumber(row.streamP95),
    totalP50: toNullableNumber(row.totalP50),
    totalP95: toNullableNumber(row.totalP95),
  }
}

function toFeErrorStats(value: unknown): AdminFeErrorStats {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>

  const bySource = Array.isArray(row.bySource)
    ? row.bySource
        .map((item) => {
          const source = item as Record<string, unknown>
          const name = typeof source.source === 'string' ? source.source : ''
          return name ? { source: name, count: toNumber(source.count) } : null
        })
        .filter((item): item is AdminFeErrorSourceItem => Boolean(item))
    : []

  const topMessages = Array.isArray(row.topMessages)
    ? row.topMessages
        .map((item) => {
          const message = item as Record<string, unknown>
          const text = typeof message.message === 'string' ? message.message : ''
          return text ? { message: text, count: toNumber(message.count) } : null
        })
        .filter((item): item is AdminFeErrorMessageItem => Boolean(item))
    : []

  return {
    total: toNumber(row.total),
    bySource,
    topMessages,
  }
}

function toOperationLogItem(row: AdminOperationLogRow): AdminOperationLogItem {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    status: row.status,
    details: row.details ?? {},
    createdAt: row.created_at,
  }
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

export async function getAdminProfiles(
  query: AdminProfilesQuery = {},
): Promise<AdminApiResult<AdminProfilesPage>> {
  try {
    assertSupabaseConfigured()

    const { from, pageSize } = resolvePage(query)

    const rpcResult = await supabase.rpc('admin_get_profiles', {
      p_limit: pageSize,
      p_offset: from,
      p_search: query.search?.trim() || null,
      p_role: query.role || null,
    })

    if (rpcResult.error) {
      return fail(`获取用户列表失败：${rpcResult.error.message}。请先同步最新 SQL。`)
    }

    if (!Array.isArray(rpcResult.data)) {
      return fail('获取用户列表失败：admin_get_profiles 返回结果异常')
    }

    const rows = rpcResult.data as AdminProfileRpcRow[]
    const first = rows[0]
    const totalUsers = toNumber(first?.total_count)
    const adminUsers = toNumber(first?.admin_count)

    return ok({
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        createdAt: row.created_at,
        isBanned: Boolean(row.is_banned),
      })),
      total: toNumber(first?.filtered_count),
      stats: {
        total: totalUsers,
        admins: adminUsers,
        users: Math.max(totalUsers - adminUsers, 0),
        banned: toNumber(first?.banned_count),
      },
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminDocuments(
  query: AdminDocumentsQuery = {},
): Promise<AdminApiResult<AdminPagedData<AdminDocumentItem>>> {
  try {
    assertSupabaseConfigured()

    const { from, to } = resolvePage(query)

    let builder = supabase
      .from('documents')
      .select('id, title, status, is_shared, owner_id, created_at, updated_at', { count: 'exact' })

    if (typeof query.shared === 'boolean') {
      builder = builder.eq('is_shared', query.shared)
    }

    const keyword = query.search?.trim()
    if (keyword) {
      builder = builder.ilike('title', `%${escapeIlike(keyword)}%`)
    }

    const { data, error, count } = await builder
      .order('updated_at', { ascending: false })
      .range(from, to)
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
        isShared: row.is_shared,
        ownerId: row.owner_id,
        authorName: profile?.fullName ?? null,
        authorEmail: profile?.email ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })

    return ok({ items, total: count ?? items.length })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminDocumentStats(): Promise<AdminApiResult<AdminDocumentStats>> {
  try {
    assertSupabaseConfigured()

    const [total, shared] = await Promise.all([
      countRows('documents'),
      countRows('documents', { is_shared: true }),
    ])

    return ok({ total, shared, private: Math.max(total - shared, 0) })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminKnowledgeFiles(
  query: AdminKnowledgeFilesQuery = {},
): Promise<AdminApiResult<AdminPagedData<AdminKnowledgeFileItem>>> {
  try {
    assertSupabaseConfigured()

    const { from, to } = resolvePage(query)

    let builder = supabase
      .from('knowledge_files')
      .select('id, file_name, status, knowledge_base_id, owner_id, file_size, mime_type, created_at, updated_at', {
        count: 'exact',
      })

    const keyword = query.search?.trim()
    if (keyword) {
      builder = builder.ilike('file_name', `%${escapeIlike(keyword)}%`)
    }

    const { data, error, count } = await builder
      .order('updated_at', { ascending: false })
      .range(from, to)
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

    return ok({ items, total: count ?? items.length })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminKnowledgeFileStats(): Promise<AdminApiResult<AdminKnowledgeFileStats>> {
  try {
    assertSupabaseConfigured()

    const [total, processing, ready] = await Promise.all([
      countRows('knowledge_files'),
      countRows('knowledge_files', { status: 'processing' }),
      countRows('knowledge_files', { status: 'ready' }),
    ])

    return ok({ total, processing, ready })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

async function fetchTableCount(tableName: string): Promise<number> {
  return countRows(tableName)
}

export async function getAdminDashboardStats(): Promise<AdminApiResult<AdminDashboardStats>> {
  try {
    assertSupabaseConfigured()

    const [userCount, documentCount, knowledgeBaseCount, fileCount, chatCount, messageCount] = await Promise.all([
      fetchTableCount('profiles'),
      fetchTableCount('documents'),
      fetchTableCount('knowledge_bases'),
      fetchTableCount('knowledge_files'),
      fetchTableCount('chats'),
      fetchTableCount('chat_messages'),
    ])

    return ok({
      userCount,
      documentCount,
      knowledgeBaseCount,
      fileCount,
      chatCount,
      messageCount,
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminAnalyticsOverview(
  params: AdminAnalyticsRangeInput = { days: 7 },
): Promise<AdminApiResult<AdminAnalyticsOverview>> {
  try {
    assertSupabaseConfigured()

    const hasCustomRange = Boolean(params.startDate && params.endDate)
    const normalizedDays = Math.max(1, Math.min(60, Math.floor(params.days || 7)))

    try {
      const edgePayload = await invokeEdgeFunction<Record<string, unknown>>('admin-analytics', {
        days: hasCustomRange ? undefined : normalizedDays,
        startDate: hasCustomRange ? params.startDate : undefined,
        endDate: hasCustomRange ? params.endDate : undefined,
      })
      const payload = edgePayload || {}

      return ok({
        userCount: toNumber(payload.userCount),
        documentCount: toNumber(payload.documentCount),
        knowledgeFileCount: toNumber(payload.knowledgeFileCount),
        aiCallCount: toNumber(payload.aiCallCount),
        loginTotal: toNumber(payload.loginTotal),
        aiCallTotal: toNumber(payload.aiCallTotal),
        activeUserCount: toNumber(payload.activeUserCount),
        documentCreatedTotal: toNumber(payload.documentCreatedTotal),
        fileCreatedTotal: toNumber(payload.fileCreatedTotal),
        avgAiCallsPerDay: toNumber(payload.avgAiCallsPerDay),
        loginTrend: toTrendPoints(payload.loginTrend),
        aiCallTrend: toTrendPoints(payload.aiCallTrend),
        topEvents: toTopEvents(payload.topEvents),
        qaPerf: toQaPerfStats(payload.qaPerf),
        feError: toFeErrorStats(payload.feError),
      })
    } catch (error) {
      console.warn('[getAdminAnalyticsOverview] server proxy failed, fallback to RPC:', error)
    }

    const { data, error } = await supabase.rpc('admin_get_analytics_overview', {
      p_days: hasCustomRange ? null : normalizedDays,
      p_start_date: hasCustomRange ? params.startDate ?? null : null,
      p_end_date: hasCustomRange ? params.endDate ?? null : null,
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
      loginTotal: toNumber(payload.loginTotal),
      aiCallTotal: toNumber(payload.aiCallTotal),
      activeUserCount: toNumber(payload.activeUserCount),
      documentCreatedTotal: toNumber(payload.documentCreatedTotal),
      fileCreatedTotal: toNumber(payload.fileCreatedTotal),
      avgAiCallsPerDay: toNumber(payload.avgAiCallsPerDay),
      loginTrend: toTrendPoints(payload.loginTrend),
      aiCallTrend: toTrendPoints(payload.aiCallTrend),
      topEvents: toTopEvents(payload.topEvents),
      qaPerf: toQaPerfStats(payload.qaPerf),
      feError: toFeErrorStats(payload.feError),
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminOperationLogs(
  query: AdminOperationLogQuery = {},
): Promise<AdminApiResult<AdminPagedData<AdminOperationLogItem>>> {
  try {
    assertSupabaseConfigured()

    const { from, to } = resolvePage(query)

    let builder = supabase
      .from('admin_operation_logs')
      .select('id, actor_user_id, actor_email, action, target_type, target_id, target_label, status, details, created_at', {
        count: 'exact',
      })

    if (query.action) {
      builder = builder.eq('action', query.action)
    }

    if (query.targetType) {
      builder = builder.eq('target_type', query.targetType)
    }

    if (query.status) {
      builder = builder.eq('status', query.status)
    }

    // PostgREST 的 or() 语法用逗号和括号做分隔，关键字里先去掉
    const keyword = query.search?.trim().replace(/[,()]/g, '')
    if (keyword) {
      const pattern = `%${escapeIlike(keyword)}%`
      builder = builder.or(
        `actor_email.ilike.${pattern},target_label.ilike.${pattern},target_id.ilike.${pattern},action.ilike.${pattern}`,
      )
    }

    const { data, error, count } = await builder
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<AdminOperationLogRow[]>()

    if (error) {
      return fail(error.message)
    }

    const items = (data ?? []).map(toOperationLogItem)

    return ok({ items, total: count ?? items.length })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function getAdminOperationLogStats(): Promise<AdminApiResult<AdminOperationLogStats>> {
  try {
    assertSupabaseConfigured()

    const [total, success, failure] = await Promise.all([
      countRows('admin_operation_logs'),
      countRows('admin_operation_logs', { status: 'success' }),
      countRows('admin_operation_logs', { status: 'failure' }),
    ])

    return ok({ total, success, failure })
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminDeleteDocument(documentId: string): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!documentId) {
      return fail('documentId 不能为空')
    }

    const { error } = await supabase.rpc('admin_delete_document', {
      p_document_id: documentId,
    })

    if (error) {
      return fail(error.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminSetDocumentShared(documentId: string, isShared: boolean): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!documentId) {
      return fail('documentId 不能为空')
    }

    const { error } = await supabase.rpc('admin_set_document_shared', {
      p_document_id: documentId,
      p_is_shared: isShared,
    })

    if (error) {
      return fail(error.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminDeleteKnowledgeFile(fileId: string): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!fileId) {
      return fail('fileId 不能为空')
    }

    const { error } = await supabase.rpc('admin_delete_knowledge_file', {
      p_file_id: fileId,
    })

    if (error) {
      return fail(error.message)
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminCreateUser(input: AdminCreateUserInput): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    const payload = await invokeEdgeFunction<Record<string, unknown>>('admin-user-role', {
      action: 'create-user',
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: input.role,
    })

    if (payload?.success !== true) {
      return fail('添加用户失败')
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminSetUserBan(input: AdminSetUserBanInput): Promise<AdminApiResult<void>> {  try {
    assertSupabaseConfigured()

    if (!input.userId) {
      return fail('userId 不能为空')
    }

    const payload = await invokeEdgeFunction<Record<string, unknown>>('admin-user-role', {
      action: 'set-ban',
      userId: input.userId,
      banned: input.banned,
    })

    if (payload?.success !== true) {
      return fail(input.banned ? '封禁失败' : '解封失败')
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminDeleteUser(userId: string): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!userId) {
      return fail('userId 不能为空')
    }

    const payload = await invokeEdgeFunction<Record<string, unknown>>('admin-user-role', {
      action: 'delete-user',
      userId,
    })

    if (payload?.success !== true) {
      return fail('删除用户失败')
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function adminUpdateUserRole(input: AdminUpdateUserRoleInput): Promise<AdminApiResult<void>> {
  try {
    assertSupabaseConfigured()

    if (!input.userId) {
      return fail('userId 不能为空')
    }

    const payload = await invokeEdgeFunction<Record<string, unknown>>('admin-user-role', {
      userId: input.userId,
      role: input.role,
    })

    if (payload?.success !== true) {
      return fail('角色更新失败')
    }

    return ok()
  } catch (error) {
    return fail(normalizeError(error))
  }
}

