# AI 知识库平台

[![CI](https://github.com/xilele777/AI-Knowledge-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/xilele777/AI-Knowledge-Platform/actions/workflows/ci.yml)

基于 Vue 3 + Supabase 的 AI 知识库平台，支持文档管理、知识库构建、AI 问答与智能写作。

**🌐 在线演示：** https://ai-knowledge-platform-4cq.pages.dev/

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3（Composition API）+ TypeScript |
| 构建 | Vite 8 |
| UI | Element Plus + 自定义 MD3 主题 |
| 状态管理 | Pinia 3 |
| 路由 | Vue Router 5 |
| 后端服务 | Supabase（Auth / DB / RLS / Edge Functions） |
| 编辑器 | md-editor-v3（Markdown 编辑 + 预览） |
| 图表 | ECharts 6 + vue-echarts |

## ✨ 技术亮点

> 各项均为源码级实现，非组件库/SDK 开箱能力。

**1. 手写 SSE 流式解析管线** — [src/api/ai.ts](src/api/ai.ts)
`TextDecoder` 增量解码 + 事件边界缓冲（正确处理 chunk 切在 SSE 事件中间的场景）；兼容多种 OpenAI 兼容端点的嵌套 delta 格式（深度优先文本提取）；流前先消费服务端 `meta` 事件，再持续处理 token 增量；`AbortController` 全链路中断（停止生成）。

**2. rAF 合帧的流式渲染** — [src/views/chat/composables/useChatMessages.ts](src/views/chat/composables/useChatMessages.ts)
SSE chunk 到达频率远高于屏幕刷新率，每帧最多触发一次响应式更新，避免高频 Markdown 重渲染阻塞主线程。

**3. 服务端 pgvector 检索编排** — [supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts) / [supabase/functions/_shared/ragChunks.ts](supabase/functions/_shared/ragChunks.ts) / [supabase/functions/_shared/ragRetrieval.ts](supabase/functions/_shared/ragRetrieval.ts)
知识增强问答已迁到服务端：Edge Function 负责问题改写、query embedding、pgvector 向量召回、关键词检索、RRF 融合、质量判断与 authoritative `sources` 选择；数据库通过 `match_knowledge_chunks` RPC + `embedding_vector` HNSW 索引执行主向量检索，异常时再回退到旧数组扫描作为兜底路径。

**4. authoritative sources + 引用溯源闭环** — [src/api/ai.ts](src/api/ai.ts) / [src/utils/parseCitations.ts](src/utils/parseCitations.ts) / [SourceChunks.vue](src/views/chat/components/SourceChunks.vue)
服务端在流前下发 `meta` 事件，前端据此更新最终 `answerMode` 与 `sources` 并持久化；回答末尾「参考片段: [片段x,片段y]」解析为可点击角标，展开来源面板、滚动定位并高亮对应切片，形成可验证的检索 → 生成 → 溯源闭环。

**5. 流式 Markdown 增量渲染** — [src/utils/streamingMarkdown.ts](src/utils/streamingMarkdown.ts)
rAF 合帧只控制更新「频率」，没控制单帧「渲染量」——回答越长每帧全文重解析越卡。将流式文本按围栏状态机切为「已完成段落 / 进行中尾段」分别渲染：stable 段仅在新段落完成时变化，每帧真正重渲染的只有小体积尾段；未闭合代码块自动补合成闭栏防样式跳变。

**6. 服务端问答链路双层预算裁剪** — [src/utils/chatHistory.ts](src/utils/chatHistory.ts) + [supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts)
前端按字符预算从新到旧收集历史、单条超长尾部截断、剥离 `<think>` 块；Edge Function 服务端再做防御性截断，双层保障上游 token 成本可控。

**7. `<think>` 推理块流式分流** — [src/utils/streamingThinkParser.ts](src/utils/streamingThinkParser.ts)
标签可能被 SSE chunk 在任意位置切断（`<thi` + `nk>`），逐帧解析累积全文并暂时隐藏半截标签，推理内容实时分流到可折叠面板（思考中自动展开、闭合后自动收起），正文通道零污染。

**8. 首屏 JS 体积 -44% + 运行时可观测** — [vite.config.ts](vite.config.ts) / [src/utils/perfMetrics.ts](src/utils/perfMetrics.ts) / [src/utils/errorMonitor.ts](src/utils/errorMonitor.ts)
路由级懒加载 + `manualChunks` 仅分组首屏共享库，1.24MB → 0.70MB（gzip 399KB → 222KB）；线上补齐 RUM：`PerformanceObserver` 采集 LCP/CLS/INP，AI 链路分段打点（检索耗时 / 首 token 延迟 TTFT / 流式时长），三入口错误监控（`window.onerror` / `unhandledrejection` / Vue `errorHandler`）带指纹去重限频，全部复用埋点管道入库。

**9. CDN 边缘分发 + 差异化缓存策略** — [public/_headers](public/_headers) / [Cloudflare Pages 部署](https://ai-knowledge-platform-4cq.pages.dev/)
vendor/业务代码分离打包，内容哈希命名 + Cloudflare CDN 边缘分发，差异化缓存策略（HTML `no-cache` / 静态资源 `max-age=31536000, immutable`）；回访用户 vendor 包（Element Plus 564KB + Supabase 186KB + ECharts 322KB）命中 CDN 缓存，仅下载变更的业务 chunk，节省 **1.07 MB** 流量。

**10. 测试与工程化** — [src/utils/__tests__/](src/utils/__tests__/) / [e2e/](e2e/) / [.github/workflows/ci.yml](.github/workflows/ci.yml)
Vitest 覆盖 SSE 解析、流式切分、think 状态机、引用解析等核心纯函数；Playwright E2E 全 mock 后端（localStorage 注入登录态 + 拦截 PostgREST/SSE），覆盖「提问 → meta authoritative sources → 流式回答 → 思考面板」关键路径；GitHub Actions 双 job（lint + 单测 + 构建 / E2E）。

**9. 测试与工程化** — [src/utils/__tests__/](src/utils/__tests__/) / [e2e/](e2e/) / [.github/workflows/ci.yml](.github/workflows/ci.yml)
Vitest 覆盖 SSE 解析、流式切分、think 状态机、引用解析等核心纯函数；Playwright E2E 全 mock 后端（localStorage 注入登录态 + 拦截 PostgREST/SSE），覆盖「提问 → meta authoritative sources → 流式回答 → 思考面板」关键路径；GitHub Actions 双 job（lint + 单测 + 构建 / E2E）。

## 快速开始

### 前置条件

- Node.js >= 18
- [Supabase](https://supabase.com) 账号（免费套餐即可）

### 1. 克隆项目

```bash
git clone https://github.com/xilele777/AI-Knowledge-Platform.git
cd AI-Knowledge-Platform
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 Supabase 项目信息：

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### 3. 初始化数据库

在 Supabase SQL Editor 中按顺序执行 `supabase/sql/` 下的迁移脚本：

```
001 → 014
```

### 4. 部署 Edge Functions

```bash
cd supabase/functions
supabase functions deploy ai-chat
supabase functions deploy ai-embeddings
supabase functions deploy admin-analytics
```

### 5. 启动开发服务器

```bash
npm install
npm run dev
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | Vitest 单元测试（118 个用例） |
| `npm run test:e2e` | Playwright E2E（全 mock 后端，无需真实密钥） |
| `npm run lint` / `npm run lint:check` | ESLint 修复 / 只检查 |
| `npm run format` | Prettier 格式化 |

## 功能

| 模块 | 说明 |
|------|------|
| 📄 **文档管理** | Markdown 文档创建、编辑、自动保存（localStorage 草稿）、共享到广场 |
| 📚 **知识库** | 上传文件 / 关联文档 → 自动切片 → 向量 Embedding → QA 检索 |
| 💬 **AI 问答** | 知识增强 / 纯 AI 双模式；SSE 流式输出；检索来源引用 |
| ✍️ **AI 写作助手** | 润色、扩写、总结、续写，结果一键替换或追加 |
| 🔗 **共享广场** | 浏览其他用户的公开文档 |
| 👤 **个人中心** | 自定义 AI API Key / Base URL / Model（支持 OpenAI 兼容接口） |
| 🛠️ **管理后台** | 用户 / 文档 / 文件 / 聊天管理 + 统计分析图表（ECharts） |

## 配置 AI 功能

本平台不自带 AI API Key。启动后请在页面右上角头像 → **个人中心** → 填写你的 API 配置：

```
API Base URL: https://api.openai.com/v1（或其他兼容端点）
API Key:      sk-xxxxxxxx
Model:        gpt-4o-mini
```

- 支持任何 OpenAI 兼容接口（OpenAI、MiniMax、DeepSeek 等）
- Key 存入 `user_ai_config` 表，通过 Supabase RLS 限制仅本人可读写，并由 Edge Function 代理调用模型

## 项目结构

```
src/
├── api/          API 层（Supabase 直连 + AI 调用 + SSE 解析）
├── types/        TypeScript 类型定义
├── stores/       Pinia 状态管理
├── router/       路由 + 侧边栏菜单配置
├── layouts/      MainLayout（主布局）/ AdminLayout（管理后台布局）
├── views/        页面视图
│   ├── docs/     文档管理
│   ├── knowledge/ 知识库
│   ├── chat/     AI 问答（消息列表 / 输入 / 会话与消息 composables）
│   ├── shared/   共享广场
│   ├── admin/    管理后台
│   ├── login/    登录 / 注册
│   └── ProfileView.vue  个人中心
├── components/   跨页面公共组件
├── composables/  通用组合式函数（防抖、异步状态、暗黑模式等）
├── workers/      Web Worker（检索评分：向量矩阵 + 关键词）
├── utils/        核心纯函数（SSE/think/引用解析、流式切分、向量生成、
│                 性能度量、错误监控、埋点）
│   └── __tests__/  Vitest 单元测试
├── styles/       MD3 主题 + Element Plus 覆盖
└── constants/    埋点事件常量

e2e/              Playwright E2E（全 mock Supabase/SSE + server meta events）
docs/             亮点深挖与优化方案文档
supabase/
├── sql/          14 个数据库迁移脚本（含 pgvector 双列迁移）
└── functions/    Edge Functions（ai-chat / ai-embeddings / admin-analytics）
.github/          CI（lint + 单测 + 构建 / E2E 双 job）
```

## 架构要点

### AI 与检索

- **服务端 RAG 编排**：chat-time RAG 已迁到 Edge Function。`ai-chat` 负责问题改写、query embedding、pgvector 向量召回、关键词检索、RRF 融合、质量判断与 authoritative `sources` 选择；前端只发送结构化问题与知识库上下文。
- **pgvector 检索主路径**：`knowledge_chunks.embedding_vector` 保存 1024 维文本向量，数据库通过 `match_knowledge_chunks` RPC + HNSW 索引执行主向量检索；向量路径异常时可回退到旧数组扫描作为兜底。
- **SSE 流式协议**：手动解析 `text/event-stream`，在 token 增量前先消费服务端 `meta` 事件，更新最终 `answerMode` 与 `sources`；随后继续兼容 OpenAI 风格 `choices[].delta.content` 文本流。
- **Edge Functions**：`ai-chat` 代理并编排问答请求，`ai-embeddings` 负责生成文本向量，均通过 RLS 读取用户 AI 配置。

### 安全

- **Auth**：Supabase Auth 邮箱登录，`onAuthStateChange` 全局监听
- **角色**：普通用户 / 管理员，路由守卫拦截 + RLS 双重保障
- **API Key**：存入 `user_ai_config` 表，RLS 仅本人可读写，前端仅内存持有

### 数据

- **文档同步**：`chunkText()` 切片 → 批量写入 `knowledge_chunks` → 可选向量 Embedding
- **草稿**：编辑中通过 `localStorage` 自动暂存，保存后自动清除
- **兼容降级**：消息写入时自动检测列是否存在，兼容未执行全部迁移的旧库
- **埋点**：12 种事件类型（业务 9 种 + 性能/错误 3 种），写入失败静默丢弃

### 性能

- **路由级懒加载** + 按需分包：仅对首屏共享库（Element Plus / Supabase）手动分组，ECharts、md-editor 等懒加载路由专属库交由自动分包，避免 vendor 组被入口静态依赖拖入首屏
- 首屏 JS 由 1.24MB 降至 0.70MB（gzip 399KB → 222KB，**-44%**）
- 聊天流式输出 rAF 合帧（控制更新频率）+ 增量渲染（控制单帧渲染量）；消息区吸附式自动滚动（用户上滑即停，回底恢复）
- 运行时可观测：LCP/CLS/INP 现场采集 + AI 链路分段打点（检索 / TTFT / 流式时长）入库

### 工程质量

- **单元测试**：Vitest 覆盖切片、双路检索评分、RRF 融合、SSE 解析、流式切分、think 状态机、引用解析、上下文裁剪等核心纯函数（118 个用例），`npm test`
- **E2E 测试**：Playwright 全 mock 后端跑通「登录态 → 提问 → 流式回答 → 思考面板」关键路径，无密钥可运行，`npm run test:e2e`
- **CI**：GitHub Actions 双 job（lint + 单测 + 构建 / E2E），push 与 PR 触发
- **代码规范**：ESLint（flat config，vue + typescript-eslint）+ Prettier，`npm run lint` / `npm run format`

## 文档

- [docs/resume-interview-handbook.md](docs/resume-interview-handbook.md) — 求职面试手册（单一入口）：简历定稿、实测数据、亮点详解、问答话术、架构与链路底牌、文件地图
- [docs/top5-highlights-analysis.md](docs/top5-highlights-analysis.md) — 五大亮点论证与学习指南：筛选逻辑、追问清单、自测题与学习路径
