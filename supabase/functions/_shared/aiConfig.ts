import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'
import {
  normalizeBaseUrl,
  resolveDefaultModel,
  resolveEmbeddingModel,
} from '../../../shared/aiConfigCore.ts'

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

export { resolveEmbeddingModel }
