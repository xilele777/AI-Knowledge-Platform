import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'

type AnalyticsRequestBody = {
  days?: number
  startDate?: string
  endDate?: string
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
    const hasCustomRange = Boolean(body.startDate && body.endDate)
    const normalizedDays = Math.max(1, Math.min(60, Math.floor(body.days || 7)))

    if (hasCustomRange) {
      const start = new Date(`${body.startDate}T00:00:00Z`)
      const end = new Date(`${body.endDate}T00:00:00Z`)

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return errorResponse('Invalid custom date range', 400)
      }

      if (end < start) {
        return errorResponse('endDate must be greater than or equal to startDate', 400)
      }

      const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
      if (diffDays > 60) {
        return errorResponse('Custom date range cannot exceed 60 days', 400)
      }
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data, error } = await client.rpc('admin_get_analytics_overview', {
      p_days: hasCustomRange ? null : normalizedDays,
      p_start_date: hasCustomRange ? body.startDate ?? null : null,
      p_end_date: hasCustomRange ? body.endDate ?? null : null,
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
