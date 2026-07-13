import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * AI 问答关键路径 E2E（全 mock，无真实后端）：
 * 登录态注入 → 进入 /chat → 发送问题 → SSE 流式回答（含 <think> 推理块）
 * → 断言思考面板与最终 Markdown 渲染。
 *
 * mock 面：
 * - Supabase Auth：localStorage 预置 session + /auth/v1/user 接口
 * - PostgREST：chats / chat_messages / knowledge_bases / user_ai_config / analytics_events
 * - Edge Function ai-chat：返回 OpenAI 兼容的 text/event-stream
 */

const SUPABASE_HOST = 'e2e-stub.supabase.co'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const USER_EMAIL = 'e2e@example.com'

const mockUser = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: USER_EMAIL,
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

function buildSessionStorageValue(): string {
  return JSON.stringify({
    access_token: 'e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user: mockUser,
  })
}

/** PostgREST 风格响应：.single()/.maybeSingle() 请求返回对象，否则返回数组 */
function fulfillRest(route: Route, rows: Record<string, unknown>[]): Promise<void> {
  const accept = route.request().headers()['accept'] ?? ''
  const wantsObject = accept.includes('vnd.pgrst.object')
  const body = wantsObject ? JSON.stringify(rows[0] ?? null) : JSON.stringify(rows)

  return route.fulfill({
    status: route.request().method() === 'POST' ? 201 : 200,
    contentType: 'application/json',
    body,
  })
}

function sseBody(deltas: string[]): string {
  const events = deltas.map(
    (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
  )
  return [...events, 'data: [DONE]', ''].join('\n\n')
}

function aiChatSseBody(options: {
  meta?: Record<string, unknown>
  deltas: string[]
}): string {
  const parts: string[] = []
  if (options.meta) {
    parts.push(`data: ${JSON.stringify({ type: 'meta', ...options.meta })}`)
  }

  parts.push(
    ...options.deltas.map(
      (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
    ),
  )
  parts.push('data: [DONE]')
  parts.push('')
  return parts.join('\n\n')
}

let chatSeq = 0
let messageSeq = 0

async function installBackendMocks(page: Page): Promise<void> {
  // Auth：getUser 走网络，其余靠 localStorage session
  await page.route(`**/${SUPABASE_HOST}/auth/v1/user**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }),
  )
  await page.route(`**/${SUPABASE_HOST}/auth/v1/token**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: buildSessionStorageValue(),
    }),
  )

  await page.route(`**/${SUPABASE_HOST}/rest/v1/knowledge_bases**`, (route) =>
    fulfillRest(route, []),
  )

  await page.route(`**/${SUPABASE_HOST}/rest/v1/user_ai_config**`, (route) =>
    fulfillRest(route, [
      {
        id: 'cfg-1',
        user_id: USER_ID,
        api_base_url: 'https://mock-ai.example.com/v1',
        api_key: 'sk-e2e-mock',
        model: 'mock-model',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]),
  )

  await page.route(`**/${SUPABASE_HOST}/rest/v1/chats**`, (route) => {
    if (route.request().method() === 'POST') {
      chatSeq += 1
      const payload = route.request().postDataJSON() as Record<string, unknown>
      return fulfillRest(route, [
        {
          id: `chat-${chatSeq}`,
          owner_id: USER_ID,
          knowledge_base_id: null,
          title: '新会话',
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
    }
    return fulfillRest(route, [])
  })

  await page.route(`**/${SUPABASE_HOST}/rest/v1/chat_messages**`, (route) => {
    if (route.request().method() === 'POST') {
      messageSeq += 1
      const payload = route.request().postDataJSON() as Record<string, unknown>
      return fulfillRest(route, [
        {
          id: `msg-${messageSeq}`,
          owner_id: USER_ID,
          sources: [],
          answer_mode: null,
          status: 'done',
          error_message: null,
          ...payload,
          created_at: new Date().toISOString(),
        },
      ])
    }
    return fulfillRest(route, [])
  })

  await page.route(`**/${SUPABASE_HOST}/rest/v1/analytics_events**`, (route) =>
    fulfillRest(route, []),
  )

  // Edge Function：OpenAI 兼容 SSE 流，流前带 authoritative meta 事件，再输出 <think> 推理块
  await page.route(`**/${SUPABASE_HOST}/functions/v1/ai-chat`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: aiChatSseBody({
        meta: {
          mode: 'knowledge-enhanced',
          sources: [
            {
              chunkId: 'chunk-1',
              fileId: null,
              documentId: null,
              sourceType: 'file',
              sourceName: '平台说明.md',
              chunkIndex: 0,
              content: '平台支持文档管理与智能问答。',
              score: 0.91,
              matchedKeywords: ['平台', '智能问答'],
            },
          ],
        },
        deltas: [
          '<think>用户在询问平台功能，',
          '我需要给出结构化介绍。</think>',
          '## 平台介绍\n\n',
          '这是一个 **AI 知识库平台**，支持文档管理与智能问答。',
        ],
      }),
    }),
  )
}

test.beforeEach(async ({ page }) => {
  await installBackendMocks(page)

  // 注入登录态：supabase-js v2 从 localStorage 读取 sb-<ref>-auth-token
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key!, value!)
    },
    ['sb-e2e-stub-auth-token', buildSessionStorageValue()],
  )
})

test('发送问题后流式渲染回答，思考过程分流到可折叠面板', async ({ page }) => {
  await page.goto('/chat')

  const input = page.locator('textarea[placeholder*="输入你的问题"]')
  await expect(input).toBeVisible()

  await input.fill('请介绍一下这个平台')
  await page.getByRole('button', { name: '发送' }).click()

  // 用户消息上屏（限定消息气泡，避免命中侧栏会话标题）
  await expect(page.locator('.message.user').getByText('请介绍一下这个平台')).toBeVisible()

  // 回答渲染为 Markdown（标题 + 加粗），推理内容不出现在正文里
  await expect(page.getByRole('heading', { name: '平台介绍' })).toBeVisible()
  await expect(page.getByText('AI 知识库平台，支持文档管理与智能问答', { exact: false })).toBeVisible()

  // authoritative sources 由服务端 meta 事件下发并显示到来源面板
  await expect(page.getByRole('button', { name: /参考来源（1）/ })).toBeVisible()

  // 思考面板存在且流结束后自动收起；点击可展开查看推理内容
  const thinkToggle = page.getByRole('button', { name: '思考过程' })
  await expect(thinkToggle).toBeVisible()
  await expect(page.getByText('用户在询问平台功能')).toBeHidden()

  await thinkToggle.click()
  await expect(page.getByText('用户在询问平台功能', { exact: false })).toBeVisible()
})

test('未选择知识库时以纯 AI 模式回答（不展示服务端来源）', async ({ page }) => {
  await page.route(`**/${SUPABASE_HOST}/functions/v1/ai-chat`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: aiChatSseBody({
        meta: {
          mode: 'general-ai',
          sources: [],
        },
        deltas: ['你好，这里是纯 AI 回答。'],
      }),
    }),
  )

  const chunkRequests: string[] = []
  await page.route(`**/${SUPABASE_HOST}/rest/v1/knowledge_chunks**`, (route) => {
    chunkRequests.push(route.request().url())
    return fulfillRest(route, [])
  })

  await page.goto('/chat')

  const input = page.locator('textarea[placeholder*="输入你的问题"]')
  await input.fill('你好')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(page.getByText('你好，这里是纯 AI 回答。')).toBeVisible()
  await expect(page.getByRole('button', { name: /参考来源/ })).toHaveCount(0)
  expect(chunkRequests).toHaveLength(0)
})
