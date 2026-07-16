import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3'

type RoleValue = 'user' | 'admin'
type ActionValue = 'set-role' | 'create-user' | 'set-ban' | 'delete-user'

type AdminUserRequestBody = {
  action?: ActionValue
  userId?: string
  role?: RoleValue
  email?: string
  password?: string
  fullName?: string
  banned?: boolean
}

type AuditLogInsert = {
  actor_user_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_id?: string | null
  target_label?: string | null
  status: 'success' | 'failure'
  details?: Record<string, unknown>
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}

function normalizeRole(role: unknown): RoleValue | null {
  return role === 'admin' ? 'admin' : role === 'user' ? 'user' : null
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  payload: AuditLogInsert,
) {
  await adminClient.from('admin_operation_logs').insert({
    actor_user_id: payload.actor_user_id,
    actor_email: payload.actor_email,
    action: payload.action,
    target_type: payload.target_type,
    target_id: payload.target_id ?? null,
    target_label: payload.target_label ?? null,
    status: payload.status,
    details: payload.details ?? {},
  })
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return errorResponse('Supabase Edge Function env is missing', 500)
    }

    const body = (await request.json().catch(() => ({}))) as AdminUserRequestBody
    const action = body.action || 'set-role'

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const userResult = await client.auth.getUser()
    const actorUser = userResult.data.user
    const actorUserId = actorUser?.id ?? null
    const actorEmail = actorUser?.email ?? null

    const adminCheck = await client.rpc('_is_admin_actor')
    if (adminCheck.error || !adminCheck.data) {
      return errorResponse(adminCheck.error?.message || 'Forbidden', 403)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    if (action === 'set-role') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
      const role = normalizeRole(body.role)

      if (!userId || !role) {
        return errorResponse('userId 和 role 必填', 400)
      }

      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: {
          role,
          is_admin: role === 'admin',
        },
      })

      if (authError) {
        return errorResponse(authError.message, 400)
      }

      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ role })
        .eq('id', userId)

      if (profileError) {
        return errorResponse(profileError.message, 400)
      }

      await writeAuditLog(adminClient, {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        action: 'set_user_role',
        target_type: 'user',
        target_id: userId,
        target_label: userId,
        status: 'success',
        details: { role },
      })

      return jsonResponse({ success: true })
    }

    if (action === 'create-user') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password.trim() : ''
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
      const role = normalizeRole(body.role) || 'user'

      if (!email || !password || !fullName) {
        return errorResponse('email、password、fullName 必填', 400)
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          name: fullName,
          nickname: fullName,
        },
        app_metadata: {
          role,
          is_admin: role === 'admin',
        },
      })

      if (error) {
        return errorResponse(error.message, 400)
      }

      await writeAuditLog(adminClient, {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        action: 'create_user',
        target_type: 'user',
        target_id: data.user?.id ?? null,
        target_label: email,
        status: 'success',
        details: { role, fullName },
      })

      return jsonResponse({
        success: true,
        user: {
          id: data.user?.id ?? null,
          email,
          fullName,
          role,
        },
      })
    }

    if (action === 'set-ban') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
      const banned = body.banned === true

      if (!userId) {
        return errorResponse('userId 必填', 400)
      }

      const updatePayload = banned
        ? { ban_duration: '876000h' }
        : { ban_duration: 'none' }

      const { error } = await adminClient.auth.admin.updateUserById(userId, updatePayload)

      if (error) {
        return errorResponse(error.message, 400)
      }

      await writeAuditLog(adminClient, {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        action: banned ? 'ban_user' : 'unban_user',
        target_type: 'user',
        target_id: userId,
        target_label: userId,
        status: 'success',
        details: { banned },
      })

      return jsonResponse({ success: true })
    }

    if (action === 'delete-user') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : ''

      if (!userId) {
        return errorResponse('userId 必填', 400)
      }

      if (userId === actorUserId) {
        return errorResponse('不能删除当前登录的账号', 400)
      }

      const targetResult = await adminClient.auth.admin.getUserById(userId)
      const targetEmail = targetResult.data?.user?.email ?? null

      // 先清空业务数据与遗留引用（storage.objects、无级联外键），
      // 否则 GoTrue 会报 "Database error deleting user"
      const purgeResult = await adminClient.rpc('admin_purge_user_data', {
        p_user_id: userId,
      })

      if (purgeResult.error) {
        return errorResponse(`清理用户数据失败：${purgeResult.error.message}（请先执行 020 SQL）`, 400)
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId)

      if (error) {
        return errorResponse(error.message, 400)
      }

      await writeAuditLog(adminClient, {
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        action: 'delete_user',
        target_type: 'user',
        target_id: userId,
        target_label: targetEmail || userId,
        status: 'success',
        details: { email: targetEmail },
      })

      return jsonResponse({ success: true })
    }

    return errorResponse('Unsupported action', 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin user action failed'
    return errorResponse(message, 400)
  }
})
