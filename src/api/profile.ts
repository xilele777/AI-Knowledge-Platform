import { supabase, assertSupabaseConfigured } from '../utils/supabase'
import type { ApiResult } from '../types/document'

export interface UserProfile {
  id: string
  email: string | null
  fullName: string
}

interface ProfileRow {
  id: string
  email: string | null
  full_name: string | null
}

function ok<T>(data: T): ApiResult<T> {
  return {
    success: true,
    data,
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

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name?.trim() || '',
  }
}

export async function getMyProfile(): Promise<ApiResult<UserProfile>> {
  try {
    assertSupabaseConfigured()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      return fail(userError.message)
    }

    if (!user) {
      return fail('未登录或登录已过期')
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', user.id)
      .single<ProfileRow>()

    if (error) {
      return fail(error.message)
    }

    return ok(toUserProfile(data))
  } catch (error) {
    return fail(normalizeError(error))
  }
}

export async function updateMyProfile(input: { fullName: string }): Promise<ApiResult<UserProfile>> {
  try {
    assertSupabaseConfigured()
    const nextName = input.fullName.trim()

    if (!nextName) {
      return fail('姓名不能为空')
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      return fail(userError.message)
    }

    if (!user) {
      return fail('未登录或登录已过期')
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: nextName,
      })
      .eq('id', user.id)

    if (profileError) {
      return fail(profileError.message)
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        full_name: nextName,
        name: nextName,
        nickname: nextName,
      },
    })

    if (authUpdateError) {
      return fail(authUpdateError.message)
    }

    return ok({
      id: user.id,
      email: user.email ?? null,
      fullName: nextName,
    })
  } catch (error) {
    return fail(normalizeError(error))
  }
}
