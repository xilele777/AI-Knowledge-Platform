import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'

export type AiResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

type UserAiConfigRow = {
  api_base_url: string | null
  api_key: string | null
  model: string | null
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = (value || DEFAULT_BASE_URL).trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function resolveEmbeddingModel(model: string): string {
  const normalized = model.trim()
  if (normalized.toLowerCase().includes('embedding')) {
    return normalized
  }
  return DEFAULT_EMBEDDING_MODEL
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
    model: (data.model || DEFAULT_MODEL).trim(),
  }
}

