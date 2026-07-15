import { assertSupabaseConfigured, supabase, supabaseUrl } from './supabase'

export type EdgeFunctionName = 'ai-chat' | 'ai-embeddings' | 'admin-analytics' | 'admin-user-role'

export interface InvokeEdgeFunctionOptions {
  signal?: AbortSignal
}

export class EdgeFunctionError extends Error {
  readonly cause?: unknown

  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.cause = cause
  }
}

export async function invokeEdgeFunction<TResponse>(
  name: EdgeFunctionName,
  body: Record<string, unknown>,
): Promise<TResponse> {
  assertSupabaseConfigured()

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  if (!accessToken) {
    throw new EdgeFunctionError('Unauthorized')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let message = `Edge Function request failed (${response.status})`
    try {
      const payload = await response.json()
      if (typeof payload?.error === 'string') {
        message = payload.error
      }
    } catch {
      // Keep the status based message when the error body is not JSON.
    }
    throw new EdgeFunctionError(message)
  }

  const data = await response.json()
  return data as TResponse
}

export async function fetchEdgeFunctionStream(
  name: EdgeFunctionName,
  body: unknown,
  options: InvokeEdgeFunctionOptions = {},
): Promise<Response> {
  assertSupabaseConfigured()

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  if (!accessToken) {
    throw new EdgeFunctionError('Unauthorized')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!response.ok) {
    let message = `Edge Function request failed (${response.status})`
    try {
      const payload = await response.json()
      if (typeof payload?.error === 'string') {
        message = payload.error
      }
    } catch {
      // Keep the status based message when the error body is not JSON.
    }
    throw new EdgeFunctionError(message)
  }

  return response
}
