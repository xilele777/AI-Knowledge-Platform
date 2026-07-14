import { assertSupabaseConfigured, supabase } from '../utils/supabase'
import type { SystemAiConfig } from '../types/ai'

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

// 单行表固定主键，RLS 保证只有管理员能读写
const SINGLETON_ID = 1

export async function getSystemAiConfig(): Promise<ApiResult<SystemAiConfig | null>> {
  try {
    assertSupabaseConfigured()

    const { data, error } = await supabase
      .from('system_ai_config')
      .select('embedding_base_url, embedding_api_key, embedding_model, updated_at')
      .eq('id', SINGLETON_ID)
      .maybeSingle()

    if (error) {
      return fail(error.message)
    }

    if (!data) {
      return ok(null)
    }

    return ok({
      embeddingBaseUrl: data.embedding_base_url || '',
      embeddingApiKey: data.embedding_api_key || '',
      embeddingModel: data.embedding_model || '',
      updatedAt: data.updated_at,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取系统配置失败')
  }
}

export async function saveSystemAiConfig(config: SystemAiConfig): Promise<ApiResult<boolean>> {
  try {
    assertSupabaseConfigured()

    const payload = {
      id: SINGLETON_ID,
      embedding_base_url: config.embeddingBaseUrl?.trim() || null,
      embedding_api_key: config.embeddingApiKey?.trim() || null,
      embedding_model: config.embeddingModel?.trim() || null,
    }

    const { error } = await supabase
      .from('system_ai_config')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      return fail(error.message)
    }

    return ok(true)
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存系统配置失败')
  }
}
