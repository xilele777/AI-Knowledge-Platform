import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 测试配置。
 *
 * 不依赖任何真实后端：Supabase Auth / PostgREST / Edge Function（SSE）
 * 全部在测试内用 page.route 拦截 mock，因此可在无密钥的 CI 环境稳定运行。
 * dev server 的 Supabase 环境变量指向一个仅作占位的假地址，
 * 所有对它的请求都会被路由拦截，不产生真实网络。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // dev server 冷启动时懒加载路由首次按需编译较慢，放宽断言超时
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://e2e-stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-stub-anon-key',
    },
  },
})
