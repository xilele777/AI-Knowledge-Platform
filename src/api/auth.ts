import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { assertSupabaseConfigured, supabase } from '../utils/supabase'

export async function registerByEmail(email: string, password: string) {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return data
}

export async function loginByEmail(email: string, password: string) {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return data
}

export async function getCurrentUser() {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data.user
}

export async function getCurrentSession() {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function logout() {
  assertSupabaseConfigured()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  assertSupabaseConfigured()

  return supabase.auth.onAuthStateChange(callback)
}
