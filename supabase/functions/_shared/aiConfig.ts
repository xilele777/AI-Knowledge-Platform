import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'
import {
  DEFAULT_EMBEDDING_MODEL,
  normalizeBaseUrl,
  resolveDefaultModel,
} from '../../../shared/aiConfigCore.ts'

type SystemAiConfigRow = {
  embedding_base_url: string | null
  embedding_api_key: string | null
  embedding_model: string | null
}

type UserAiConfigRow = {
  api_base_url: string | null
  api_key: string | null
  model: string | null
}

export type AiResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export async function resolveUserAiConfig(authHeader: string): Promise<AiResolvedConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError || !userResult.user) {
    throw new Error('Unauthorized')
  }

  const { data, error } = await client
    .from('user_ai_config')
    .select('api_base_url, api_key, model')
    .eq('user_id', userResult.user.id)
    .maybeSingle<UserAiConfigRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.api_key) {
    throw new Error('请先在个人中心配置您的 AI API Key')
  }

  return {
    baseUrl: normalizeBaseUrl(data.api_base_url),
    apiKey: data.api_key.trim(),
    model: resolveDefaultModel(data.model),
  }
}

export type EmbeddingResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

// The system embedding API is paid for by the platform, so callers must still
// verify the requester's JWT before spending it.
export async function assertAuthenticated(authHeader: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    throw new Error('Unauthorized')
  }
}

// The embedding API is platform-level (configured once by an admin): all stored
// vectors must come from the same model, so it is never resolved per-user.
// RLS blocks normal users from this table, hence the service role client.
export async function resolveSystemEmbeddingConfig(): Promise<EmbeddingResolvedConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase Edge Function env is missing')
  }

  const client = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await client
    .from('system_ai_config')
    .select('embedding_base_url, embedding_api_key, embedding_model')
    .eq('id', 1)
    .maybeSingle<SystemAiConfigRow>()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.embedding_api_key) {
    throw new Error('系统向量 API 尚未配置，请联系管理员在个人中心完成配置')
  }

  return {
    baseUrl: normalizeBaseUrl(data.embedding_base_url),
    apiKey: data.embedding_api_key.trim(),
    model: data.embedding_model?.trim() || DEFAULT_EMBEDDING_MODEL,
  }
}

