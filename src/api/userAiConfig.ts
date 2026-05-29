import { getCurrentUser } from './auth'
import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import type { UserAiConfig } from '../types/ai'

type ApiResult<T> = {
  success: boolean
  data: T | null
  error: string | null
}

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data, error: null }
}

function fail<T>(message: string): ApiResult<T> {
  return { success: false, data: null, error: message }
}

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('未登录或登录已过期')
  }
  return user.id
}

export async function getUserAiConfig(): Promise<ApiResult<UserAiConfig | null>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from('user_ai_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      return fail(error.message)
    }

    if (!data) {
      return ok(null)
    }

    return ok({
      id: data.id,
      userId: data.user_id,
      apiBaseUrl: data.api_base_url,
      apiKey: data.api_key,
      model: data.model,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取配置失败')
  }
}

export async function saveUserAiConfig(config: UserAiConfig): Promise<ApiResult<UserAiConfig>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const payload = {
      user_id: userId,
      api_base_url: config.apiBaseUrl?.trim() || null,
      api_key: config.apiKey?.trim() || null,
      model: config.model?.trim() || null,
    }

    const { data, error } = await supabase
      .from('user_ai_config')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (error) {
      return fail(error.message)
    }

    return ok({
      id: data.id,
      userId: data.user_id,
      apiBaseUrl: data.api_base_url,
      apiKey: data.api_key,
      model: data.model,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存配置失败')
  }
}

export async function deleteUserAiConfig(): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()
    const userId = await requireUserId()

    const { error } = await supabase
      .from('user_ai_config')
      .delete()
      .eq('user_id', userId)

    if (error) {
      return fail(error.message)
    }

    return ok(true)
  } catch (error) {
    return fail(error instanceof Error ? error.message : '删除配置失败')
  }
}
