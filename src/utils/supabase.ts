import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // Keep app bootable even when env is missing, and fail only on auth actions.
  console.error('Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'public-anon-key',
)

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase 未配置。请在项目根目录创建 .env，并设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。',
    )
  }
}
