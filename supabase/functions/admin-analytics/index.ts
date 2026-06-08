import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'

type AnalyticsRequestBody = {
  days?: number
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader) {
    return errorResponse('Unauthorized', 401)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse('Supabase Edge Function env is missing', 500)
    }

    const body = (await request.json().catch(() => ({}))) as AnalyticsRequestBody
    const normalizedDays = Math.max(1, Math.min(30, Math.floor(body.days || 7)))
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data, error } = await client.rpc('admin_get_analytics_overview', {
      p_days: normalizedDays,
    })

    if (error) {
      return errorResponse(error.message, 403)
    }

    return jsonResponse(data || {})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin analytics request failed'
    return errorResponse(message, 400)
  }
})
