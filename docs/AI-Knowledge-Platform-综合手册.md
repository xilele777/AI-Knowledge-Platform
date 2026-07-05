# AI Knowledge Platform 综合手册

> 用途：把 `project-development-manual.md`、`resume-highlights.md`、`frontend-interview-highlights.md` 三份内容合并成一份主文档，兼顾开发维护、简历书写和面试复盘。  
> 口径原则：只讲源码中真实存在的能力；对未完成、有边界或需要后续补强的点，主动说明取舍。

## 目录

1. 项目定位
2. 技术栈与仓库结构
3. 本地启动与部署
4. 架构与安全边界
5. 核心业务模块
6. RAG 问答主链路
7. 前端核心亮点
8. 可观测、测试与 CI
9. 简历写法
10. 面试介绍与高频问答
11. 当前风险与后续补强
12. 开发排查与改动落点
13. 代码阅读路线

## 1. 项目定位

这是一个基于 **Vue 3 + TypeScript + Supabase** 的 AI 知识库/RAG 问答平台。用户可以创建 Markdown 文档或上传 txt/md 文件，系统将内容切片并可选生成 embedding；用户提问时先从知识库召回相关片段，再构造带参考资料的 Prompt，通过 Supabase Edge Function 代理 OpenAI-compatible API 进行 SSE 流式回答，并保存来源片段用于引用溯源。

最稳的面试口径：

> 这个项目不是自研大模型，也不是自研 Agent 框架，而是把大模型 API 包装成一个具备知识入库、检索增强、流式交互、引用溯源、权限隔离、性能优化、可观测和测试保障的完整 AI 应用。

推荐简历标题：

```text
AI 知识库平台 / RAG 问答系统
Vue 3 + TypeScript + Supabase + Edge Functions + OpenAI-compatible API
```

不要写成：

- 自研大模型 / 自研 LLM
- 自研 Agent 框架
- 企业级向量数据库
- 高并发 AI 后端
- API Key 加密存储
- 支持任意格式文档解析

更稳写法：

- 集成 OpenAI-compatible API，重点实现 RAG 应用工程链路。
- 支持多轮上下文、问题改写和知识增强问答。
- 客户端向量检索与缓存优化，大规模场景可演进 pgvector。
- API Key 通过 RLS 限制本人可见，并由 Edge Function 代理使用。
- 支持 txt/md 文本文件和 Markdown 文档入库。

## 2. 技术栈与仓库结构

| 层级 | 技术 | 项目中承担的职责 |
| --- | --- | --- |
| 框架 | Vue 3 Composition API | 页面、组件、响应式状态 |
| 语言 | TypeScript | 类型约束、数据模型表达 |
| 构建 | Vite | 开发服务器、生产构建、代码分包 |
| UI | Element Plus + 自定义主题 | 表单、弹窗、布局、后台组件 |
| 状态 | Pinia | 用户登录态、AI 配置等全局状态 |
| 路由 | Vue Router | 页面路由、登录/管理员守卫、懒加载 |
| BaaS | Supabase | Auth、Postgres、RLS、RPC、Edge Functions |
| 编辑器 | md-editor-v3 | Markdown 文档编辑与预览 |
| 图表 | ECharts + vue-echarts | 管理后台统计图表 |
| 单测 | Vitest | 核心纯函数测试 |
| E2E | Playwright | 全 mock 后端的问答关键路径 |
| CI | GitHub Actions | lint、单测、构建、E2E |

仓库结构：

```text
AI-Knowledge-Platform/
├── src/
│   ├── main.ts                         # 应用入口
│   ├── router/                         # 路由表、守卫、菜单
│   ├── stores/                         # Pinia：user、aiConfig
│   ├── api/                            # Supabase + Edge Function 访问层
│   ├── types/                          # 业务类型
│   ├── utils/                          # RAG、流式解析、缓存、性能、错误监控
│   ├── workers/                        # retrieval.worker.ts
│   ├── views/                          # docs、knowledge、chat、admin、shared、login
│   ├── components/                     # 公共组件、文档 AI 助手、知识文件上传
│   ├── composables/                    # 通用组合式函数
│   ├── layouts/                        # 页面布局
│   ├── styles/                         # 主题与 Element Plus 覆盖
│   └── constants/                      # 埋点事件常量
├── supabase/
│   ├── sql/                            # 数据库迁移脚本
│   └── functions/                      # ai-chat、ai-embeddings、admin-analytics
├── e2e/                                # Playwright E2E
├── docs/                               # 项目文档
├── scripts/                            # smoke 脚本
└── .github/workflows/ci.yml            # CI
```

分层依赖可以这样理解：

```text
types / utils
    ↑
api
    ↑
stores
    ↑
views / components
```

`utils` 尽量做成无 DOM、无网络或低耦合纯函数，便于单测；`api` 是访问 Supabase 和 Edge Functions 的主要入口；`views` 负责组合状态、交互和渲染。

## 3. 本地启动与部署

### 环境变量

`.env.example` 对应前端需要的两个变量：

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

前端通过 `src/utils/supabase.ts` 初始化 Supabase 客户端。未配置时，相关 API 会通过 `assertSupabaseConfigured()` 抛出明确错误。

### 本地命令

```bash
npm install
npm run dev
npm run build
npm test
npm run test:e2e
npm run lint:check
```

### Supabase 初始化

按 `supabase/sql/` 编号顺序执行迁移，然后部署 Edge Functions：

```bash
supabase functions deploy ai-chat
supabase functions deploy ai-embeddings
supabase functions deploy admin-analytics
```

注意：

- 当前 SQL 脚本会修改 `documents` 表，但原文档中提到没有看到完整的 `documents` 建表迁移。从空库部署时需要先补齐，否则后续桥接和分享迁移会依赖不存在的表。
- `user_ai_config.api_key` 当前是 HTTPS 传输 + RLS 隔离 + Edge Function 代理，不是应用层加密或 KMS 加密存储。

## 4. 架构与安全边界

### 启动链路

入口文件：`src/main.ts`

```text
createApp(App)
-> initErrorMonitor(app)
-> app.use(pinia)
-> userStore.initialize()
-> app.use(router)
-> app.mount('#app')
-> initWebVitalsReporting()
```

关键点：

- 先注册 Pinia，再初始化 `userStore`，最后注册 router，减少刷新时登录态未恢复导致的误跳转。
- `initErrorMonitor(app)` 尽早注册，覆盖 Vue 错误、window error、unhandled rejection。
- `initWebVitalsReporting()` 在挂载后启动，采集 LCP/CLS/INP 近似值。

### 路由权限

| 类型 | 路径 | 权限 |
| --- | --- | --- |
| 公开页 | `/login`、`/register` | 未登录可访问 |
| 业务页 | `/dashboard`、`/docs`、`/knowledge`、`/chat`、`/profile`、`/shared` | 需要登录 |
| 管理页 | `/admin/*` | 需要登录且 admin |

守卫逻辑：

1. 如果 `userStore.initialized` 为 false，先等待 `initialize()`。
2. 未登录访问业务页，重定向到 `/login?redirect=原路径`。
3. 已登录访问登录/注册页，重定向到 `/dashboard`。
4. 非管理员访问 `/admin`，重定向到 `/dashboard`。

管理员判断优先看 `user.app_metadata.role`，其次看 `user.user_metadata.role`，并兼容 `is_admin` 字段。

### RLS 与安全模型

安全边界分三层：

1. 前端路由守卫：提升体验，防止误入未授权页面。
2. API 层 owner 过滤：个人数据读写附带 `owner_id = userId`。
3. Supabase RLS：数据库最终强制 `auth.uid() = owner_id/user_id`。

面试回答：

> 前端路由守卫只是体验层和第一道拦截，不能作为安全边界。真正的数据隔离靠 Supabase RLS、RPC 内的 admin 校验、Edge Function 里的 `auth.getUser()`。前端能被绕过，数据库策略不能被绕过。

### AI 配置代理

用户可以配置 OpenAI-compatible Base URL、API Key、模型名。前端通过 Auth Token 调用 Edge Function，Edge Function 按用户身份读取 RLS 保护的 AI 配置并代理 chat/embedding 请求。

边界：

> 当前 API Key 是 RLS 隔离 + Edge Function 代理，不是应用层加密存储。后续可演进为服务端加密或 KMS 托管。

## 5. 核心业务模块

### 登录/注册

相关文件：

- `src/views/login/LoginView.vue`
- `src/views/register/RegisterView.vue`
- `src/api/auth.ts`
- `src/stores/user.ts`

流程：

```text
输入邮箱密码
-> api/auth 调 Supabase Auth
-> userStore.setAuth()
-> track(login_success/register_success)
-> 跳转 dashboard 或 redirect
```

### 文档管理

相关文件：

- `src/views/docs/DocsListView.vue`
- `src/views/docs/DocEditorView.vue`
- `src/api/documents.ts`
- `src/utils/documentDraft.ts`
- `src/components/document/AIAssistantPanel.vue`

能力：

- 创建、编辑、删除 Markdown 文档。
- 标题搜索、分页查询。
- localStorage 草稿保护。
- 分享到共享广场。
- AI 写作助手：润色、扩写、总结、续写。

### 文档加入知识库

入口：`src/api/documents.ts` 的 `addDocumentToKnowledgeBase()`

流程：

```text
校验 documentId / knowledgeBaseId
-> 查询 documents，确认 owner_id
-> 查询 knowledge_bases，确认 owner_id
-> chunkText(content, 300-500)
-> upsert knowledge_documents 桥接关系
-> 删除旧 document chunks
-> batchInsertKnowledgeChunks()
-> 可选生成 embeddings
-> 更新 last_chunk_count / last_synced_at
```

关键取舍：文档重新同步时先删旧切片再插入新切片，配合 IndexedDB 缓存的 id diff 模型，缓存一致性问题被简化为集合差异。

### 知识库与文件

相关文件：

- `src/views/knowledge/KnowledgeListView.vue`
- `src/views/knowledge/KnowledgeDetailView.vue`
- `src/components/knowledge/FileUpload.vue`
- `src/api/knowledge.ts`

能力：

- 创建/删除知识库。
- 更新知识库 QA 默认配置。
- 上传文本文件并切片。
- 查看知识库文件和关联文档。
- 删除知识库时清理 chunks、files、documents bridge。
- 兼容旧 schema 的 `storage_path/file_path`、`file_type/mime_type` 差异。

### AI 问答

相关文件：

- `src/views/chat/ChatView.vue`
- `src/views/chat/composables/useChatSession.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/ChatInput.vue`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/AssistantMarkdown.vue`
- `src/views/chat/components/SourceChunks.vue`

能力：

- 会话列表、当前会话、新建/删除/切换会话。
- 知识库选择和 QA 配置。
- RAG 检索、Prompt 构建、流式生成。
- 停止生成、重新生成。
- 保存 assistant 消息、sources、answerMode、状态。
- 引用角标解析、来源面板定位高亮。

## 6. RAG 问答主链路

### 总链路

```text
文档/文件
  -> chunkText 切片
  -> 可选生成 embedding
  -> 写入 knowledge_chunks

用户提问
  -> 必要时多轮查询改写
  -> 拉取知识库切片
  -> 向量召回 topK
  -> 中文关键词召回 topK
  -> RRF 融合
  -> 判断召回质量
  -> 构造 knowledge-enhanced prompt 或降级 general-ai
  -> Edge Function 代理模型
  -> SSE 流式返回
  -> 保存 sources 并支持引用溯源
```

和单纯调 API 的区别：

```text
单纯调 API：
用户问题 -> AI -> 回答

本项目：
用户问题 -> 检索知识库 -> 召回融合 -> 构造参考资料 Prompt -> AI -> 保存来源 -> 引用溯源
```

### RAG 双路召回与 RRF 融合

项目不是把用户问题直接丢给 AI，而是实现了客户端 RAG 检索链路：文档切片、embedding 入库、向量召回、中文 N-gram 关键词召回、RRF 融合和召回质量判断。

源码证据：

- `src/utils/chunkText.ts`
- `src/api/knowledge.ts`
- `src/api/documents.ts`
- `src/utils/retrieveChunks.ts`
- `src/utils/fuseRetrieval.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/utils/buildQaPrompt.ts`

面试讲法：

> 向量召回擅长语义相似，但对专有名词、缩写、版本号不一定稳定；关键词召回擅长精确命中，但不懂语义改写。所以我把两路召回都保留，各取 topK，再用 RRF 按排名融合，避免不同分数量纲带来的归一化调参问题。

边界：当前 embedding 存在 Postgres `double precision[]`，检索主要在客户端完成，适合中小型知识库。万级以上切片更适合演进到 pgvector/RPC 服务端检索。

### 多轮查询改写

RAG 的一个实际问题是多轮追问里，“那它怎么部署？”这类问题直接检索会失败。项目在检索前判断是否含指代词、短追问或依赖上下文，必要时调用低成本 LLM 改写成自包含 query。

流程：

```text
多轮问题
  -> 判断是否含指代词/短追问
  -> 低成本 LLM 改写成自包含 query
  -> 改写结果只用于检索
  -> 展示和落库保留用户原句
  -> 失败/超时回退原句
```

源码证据：

- `src/utils/rewriteQuestion.ts`
- `src/views/chat/composables/useChatMessages.ts`

### Prompt 构建与模式分流

项目根据召回质量切换回答模式：

- `knowledge-enhanced`：有高质量来源，构造带参考片段的 Prompt。
- `general-ai`：召回质量不足或无可靠来源，降级普通 AI 回答。
- `strict-knowledge`：更严格地基于知识库回答，知识不足时提示资料不足。

源码证据：

- `src/utils/buildQaPrompt.ts`
- `src/views/chat/composables/useChatMessages.ts`

### 引用溯源

RAG 回答不能只生成文本，还要让用户能核对来源。项目保存 sources，并解析模型输出的参考片段编号，支持点击引用定位并高亮来源切片。

源码证据：

- `src/utils/parseCitations.ts`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/SourceChunks.vue`

稳妥口径：

> 不能说“解决幻觉”。更准确的是“通过参考资料约束和引用溯源提升回答可验证性，降低不可核对输出的风险”。

## 7. 前端核心亮点

### 复杂状态管理

聊天页状态不是简单 `loading + data`，而是一组互相影响的状态：

- `activeChatId`：当前会话。
- `selectedKnowledgeBaseId`：当前知识库。
- `messages`：消息列表。
- `sending`：是否正在发送/生成。
- `streaming/done/error`：单条 assistant 消息状态。
- `AbortController`：停止生成。
- `lastQuestion / lastQuestionChatId`：重新生成依赖。
- `qaConfigForm`：问答配置草稿。
- `source highlight`：引用定位高亮。
- `draft session`：新建对话时的空白草稿态。

拆分方式：

```text
ChatView
  -> 页面编排和组件组合

useChatSession
  -> 知识库列表
  -> 会话列表
  -> 当前会话
  -> QA 配置
  -> 新建/删除/切换会话

useChatMessages
  -> 消息加载
  -> 发送问题
  -> RAG 检索
  -> 流式生成
  -> 停止生成
  -> 重新生成
  -> 消息落库
```

面试讲法：

> 聊天页里既有知识库选择、问答配置、会话管理，也有流式回答、停止生成、重新生成、Markdown 渲染、think 分流和引用溯源。为了避免所有逻辑堆在一个 Vue 文件里，我把状态拆到 `useChatSession` 和 `useChatMessages`，把展示拆到 `ChatInput`、`ChatMessageList`、`AssistantMarkdown` 和 `SourceChunks`。

### IndexedDB 向量缓存 + Float32Array

问题：知识切片 embedding 数据大，每次问答都拉全量 embedding 会浪费网络、JSON 解析和内存。

方案：

```text
服务端查询当前知识库 chunk ids
  -> 本地 IndexedDB 查询已缓存 chunk ids
  -> serverIds - cachedIds = missingIds
  -> cachedIds - serverIds = staleIds
  -> 只拉缺失 embedding
  -> 删除本地过期缓存
  -> 按服务端 id 顺序恢复切片列表
```

源码证据：

- `src/utils/embeddingCache.ts`
- `src/api/chat.ts`
- `src/types/chat.ts`

面试讲法：

> 缓存一致性最怕可变数据。我先观察切片写路径，发现文档重新同步时是删除旧切片再插入新切片，所以 chunk id 可以作为缓存一致性的判断依据。缓存里只放稳定字段和 embedding，不缓存易变的 sourceName，显示时再从服务端数据恢复来源信息。

边界：IndexedDB 不可用时回退全量拉取，优先保证可用性。

### Web Worker + Float32Array 矩阵 + Transferable

问题：向量相似度计算和关键词评分是 CPU 密集任务，放主线程会影响输入、滚动和流式渲染。

方案：

- 检索计算下放 Web Worker。
- 多条 embedding 打包成连续 `Float32Array` 矩阵。
- 通过 Transferable 转移 `ArrayBuffer`，减少结构化克隆成本。
- Worker 不可用或异常时回退主线程。

源码证据：

- `src/utils/retrievalWorkerClient.ts`
- `src/workers/retrieval.worker.ts`
- `src/utils/similarity.ts`

面试讲法：

> Worker 本身不是亮点，关键是跨线程传什么。传 `number[][]` 会触发大量结构化克隆，所以我把 n 条向量复制进一个连续矩阵，只 transfer 一个 buffer。源缓存向量不直接 transfer，避免原始 buffer 被 detach。Worker 崩溃时会标记 broken，并回退主线程计算。

边界：这是浏览器端中小规模检索优化，更大规模数据仍应迁移到数据库或后端向量检索服务。

### SSE 流式解析与停止生成

项目基于 `fetch + ReadableStream + TextDecoder(stream)` 手写 OpenAI-compatible SSE 解析，处理 UTF-8 跨 chunk 解码、SSE 事件边界缓冲，并通过 AbortController 支持停止生成。

源码证据：

- `src/api/ai.ts`
- `src/utils/serverProxy.ts`
- `src/views/chat/composables/useChatMessages.ts`

面试讲法：

> 我没有用 EventSource，因为它不适合 POST body 和 Authorization header。用 fetch 读 stream 时要处理两个边界：中文字符可能跨 chunk，SSE event 也可能跨 chunk。所以 TextDecoder 要用 stream 模式，SSE event 要用 buffer 按空行切。

### rAF 合帧 + Markdown 增量渲染

问题：SSE chunk 到达频率可能高于屏幕刷新率，每个 chunk 都更新 Vue 响应式状态会造成高频渲染。长回答如果每次都全文 Markdown parse，会越生成越卡。

方案：

- 用 `requestAnimationFrame` 合并高频 chunk 更新。
- 将 Markdown 拆成 stable 段和 tail 段。
- 稳定段不随每个 chunk 重复解析。
- 未闭合代码块临时补全，避免样式跳变。

源码证据：

- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/AssistantMarkdown.vue`
- `src/utils/streamingMarkdown.ts`

### `<think>` 分流

推理模型输出 `<think>` 时，项目支持流式阶段实时分流到可折叠面板，回答正文保持干净。

源码证据：

- `src/utils/streamingThinkParser.ts`
- `src/views/chat/components/AssistantMarkdown.vue`

## 8. 可观测、测试与 CI

### 多级降级韧性

- 查询改写失败/超时 -> 回退原问题。
- 向量召回失败 -> 关键词召回兜底。
- Worker 不可用或崩溃 -> 主线程计算兜底。
- IndexedDB 缓存不可用 -> 全量拉取兜底。
- 管理端 Edge Function 失败 -> RPC fallback。
- Supabase env 缺失 -> 应用可启动，实际 API 操作时报明确错误。
- 旧 schema 字段不一致 -> fallback payload 或基础字段读写。

### 可观测指标

- Web Vitals 近似指标：LCP / CLS / INP。
- QA 链路分段耗时：检索完成、首 token、流式结束。
- 上报上下文：`qa_mode`、`source_count`、`answer_length`、`status`、`aborted`。
- 错误入口：`window.error`、`unhandledrejection`、Vue `errorHandler`。
- 统一埋点管道写入 `analytics_events`。

源码证据：

- `src/utils/perfMetrics.ts`
- `src/utils/errorMonitor.ts`
- `src/utils/tracker.ts`
- `src/constants/analyticsEvents.ts`
- `supabase/sql/004_analytics_events.sql`

面试讲法：

> AI 应用不能只看接口总耗时。用户最敏感的是首 token，所以我把 QA 链路拆成检索耗时、TTFT 和流式耗时。这样后续可以判断慢是慢在检索、模型首包，还是前端渲染。

### 测试与 CI

能力：

- Vitest 覆盖核心纯函数。
- Playwright 全 mock Supabase/Auth/PostgREST/Edge Function SSE。
- GitHub Actions 执行 lint、单测、构建、E2E。
- Vite 路由懒加载和 manualChunks。
- Element Plus 按需引入。

源码证据：

- `src/utils/__tests__/`
- `e2e/chat.spec.ts`
- `playwright.config.ts`
- `.github/workflows/ci.yml`
- `vite.config.ts`

当前验证口径：

- `npm test`：118 passed。
- `npm run build`：通过。

## 9. 简历写法

### 精简版 4 条

```text
- 设计并实现 AI 知识库 RAG 问答链路：文档切片、Embedding 入库、向量检索 + 中文 N-gram 关键词检索，并基于 RRF 做双路召回融合和质量判断。
- 针对重复拉取全量 embedding 的问题，实现 IndexedDB 向量缓存，通过服务端 id 集合与本地缓存 diff 完成增量拉取和失效淘汰，并以 Float32Array 存储向量。
- 将向量相似度与关键词评分下放 Web Worker，使用 Float32Array 矩阵 + Transferable 降低跨线程传输与主线程阻塞。
- 手写 OpenAI-compatible SSE 流式解析，支持 TextDecoder 增量解码、事件边界缓冲、AbortController 停止生成，并通过 rAF 合帧和 Markdown 增量渲染优化长回答体验。
```

### 完整版 6 条

```text
- 基于 Vue 3 + TypeScript + Supabase 搭建 AI 知识库平台，覆盖文档管理、知识库入库、RAG 问答、AI 写作、共享广场和管理后台。
- 设计 RAG 检索链路：文档/文件切片、Embedding、向量召回、中文 N-gram 关键词召回、RRF 秩融合，并根据召回质量自动切换知识增强/纯 AI 模式。
- 实现 IndexedDB 向量缓存：利用切片不可变特性进行服务端 id 与本地缓存 diff，减少重复下载全量 embedding；向量以 Float32Array 存储并参与 Worker 矩阵计算。
- 将检索重计算下放 Web Worker，向量打包为 Float32Array 矩阵后通过 Transferable 传输，Worker 不可用时自动降级主线程，保证可用性。
- 实现流式问答体验：手写 SSE 解析与中断、rAF 合帧、Markdown stable/tail 增量渲染、<think> 推理块分流和引用溯源定位。
- 建立工程质量与可观测体系：118 个 Vitest 用例覆盖核心纯函数，Playwright 全 mock 后端验证聊天关键路径，采集 Web Vitals、QA 检索/TTFT/流式耗时和前端错误。
```

### 前端岗位版

```text
AI 知识库问答平台｜Vue 3 + TypeScript + Supabase
负责 AI 问答前端核心闭环，覆盖知识库选择、问答配置、流式回答、Markdown 渲染、引用溯源、会话管理、浏览器侧检索性能优化和前端可观测。
```

推荐 bullet：

```text
- 拆分聊天页复杂状态管理，通过 useChatSession 管理会话/知识库/QA 配置，通过 useChatMessages 管理消息收发、RAG 检索、流式生成、停止生成和重新生成逻辑。
- 使用 IndexedDB 缓存知识切片 embedding，并基于服务端 id 与本地缓存 id diff 实现增量拉取和失效淘汰，减少重复网络传输和 JSON 解析成本。
- 将向量相似度计算与关键词评分下放 Web Worker，结合 Float32Array 矩阵与 Transferable 降低主线程阻塞和跨线程拷贝成本。
- 手写 OpenAI-compatible SSE 流式解析，处理 UTF-8 跨 chunk 解码、SSE 事件边界缓冲和 AbortController 停止生成。
- 通过 requestAnimationFrame 合并高频 chunk 更新，并将 Markdown 拆分为 stable/tail 片段，优化 AI 长回答流式渲染性能。
- 构建 RAG 回答引用溯源交互，解析模型输出的参考片段编号，联动来源面板定位并高亮对应知识切片。
- 建立前端可观测和测试体系，采集 Web Vitals、检索耗时、TTFT、流式耗时和前端异常，并使用 Vitest/Playwright 覆盖核心纯函数和聊天关键路径。
```

### 第一梯队亮点排序

1. RAG 双路召回与 RRF 融合。
2. IndexedDB 向量缓存 + Float32Array。
3. Web Worker + Float32Array 矩阵 + Transferable。
4. SSE 流式解析 + rAF 合帧 + Markdown 增量渲染。
5. 多轮查询改写 + 引用溯源可信闭环。
6. 多级降级韧性 + 可观测 + 测试覆盖。

## 10. 面试介绍与高频问答

### 2 分钟项目介绍稿

```text
这个项目是一个基于 Vue 3、TypeScript 和 Supabase 的 AI 知识库平台。用户可以创建 Markdown 文档或上传 txt/md 文件，系统会把内容切片、可选生成 embedding 并写入知识库。用户提问时，前端会先进行 RAG 检索，再构建 Prompt，通过 Supabase Edge Function 代理 OpenAI 兼容接口进行 SSE 流式回答。

我重点做的不是简单调 API，而是 AI 应用工程链路。检索侧做了向量召回和中文 N-gram 关键词召回，并用 RRF 融合；多轮场景下还做了检索前查询改写，解决“它、这个、怎么部署”这类追问召回失败的问题。性能侧做了 IndexedDB 向量缓存、Float32Array 矩阵和 Web Worker 计算卸载。交互侧手写了 SSE 流式解析、停止生成、rAF 合帧、Markdown 增量渲染、think 推理块分流和引用溯源。

另外我补了工程化能力：核心算法抽成纯函数，有 118 个 Vitest 单测；Playwright 全 mock Supabase 和 SSE 验证聊天关键路径；线上可观测方面采集 Web Vitals、QA 检索耗时、TTFT、流式时长和前端错误。这个项目的定位不是自研模型，而是把大模型 API 做成可用、可验证、性能可控的 RAG 产品。
```

### Q1：你这个 RAG 和普通聊天有什么区别？

普通聊天是用户问题直接给模型。本项目在模型前面增加了知识库检索、双路召回、RRF 融合和 Prompt 构建；模型回答后还保存 sources，并支持引用定位。AI API 只是生成环节，项目重点是检索增强、流式交互和可验证来源闭环。

### Q2：为什么检索放前端，不直接用 pgvector？

这是阶段性取舍。当前项目定位是前端主导的轻量 AI 知识平台，中小规模知识库可以通过 IndexedDB、Worker 和 TypedArray 优化浏览器侧体验，减少服务端复杂度。切片规模上万后，应迁移到 pgvector/RPC 等服务端向量检索。

### Q3：IndexedDB 缓存怎么保证一致性？

项目利用切片不可变特性：文档重新同步时删旧切片再插入新切片，所以 chunk id 可以作为缓存一致性依据。每次先比对服务端 id 集合和本地缓存 id 集合，只拉缺失项并删除过期项。

### Q4：为什么 Worker 还要降级？

Worker 是性能优化，不应成为功能可用性的单点。Worker 不可用或异常时回退主线程计算，保证问答主流程可用，只是性能变差。

### Q5：为什么不用 EventSource？

EventSource 不适合带 POST body 和 Authorization header。项目需要带用户身份、请求配置和历史上下文，所以使用 `fetch + ReadableStream` 手写 SSE 解析。

### Q6：流式 Markdown 为什么会卡？怎么优化？

如果每个 SSE chunk 都触发响应式更新，并且每次都全文 Markdown parse，长回答会越生成越卡。项目用 rAF 合并高频 chunk，再把 Markdown 拆成 stable 段和 tail 段，避免稳定内容重复解析。

### Q7：API Key 安全怎么做？

当前是 RLS 限制本人可见，前端通过 Auth Token 调 Edge Function，由 Edge Function 读取配置并代理模型请求。不能说已经做了数据库密文存储；后续可升级为服务端加密或 KMS 托管。

### Q8：如果模型乱答，怎么兜底？

先提升召回质量：混合检索、RRF、多轮改写。再增强 Prompt 约束：要求基于资料回答并给出引用。再做模式约束：`strict-knowledge` 下没有高质量片段就提示知识库不足。最后承认边界：RAG 能降低不可核对输出风险，但不能数学上保证模型完全不编。

### Q9：为什么不用 LangChain？

这个项目的目标是展示前端对 RAG 链路的可控能力，所以切片、检索、融合、Prompt 和流式解析都做成源码级实现。LangChain 能加速原型，但也会封装掉很多关键细节，比如前端缓存、Worker 检索、流式 Markdown 和引用定位。生产中如果团队已有 LangChain 生态，可以评估复用。

### Q10：如果让你重构，第一步做什么？

第一步不动 UI，而是补齐数据边界：补 `documents` 建表迁移，保证空库初始化完整；把 API Key 存储升级为应用层加密或密钥托管；给知识库规模设置阈值，超过阈值走 pgvector。

## 11. 当前风险与后续补强

### 当前风险

1. `documents` 建表迁移需要补齐，避免空库初始化失败。
2. API Key 当前不是应用层加密存储。
3. 当前不是 pgvector 服务端检索，客户端检索有规模上限。
4. 文件解析能力主要覆盖 txt/md 和 Markdown，不适合硬说支持任意格式。
5. RAG 不能根治幻觉，只能通过参考资料约束和引用溯源提升可验证性。
6. 性能优化已有设计和实现，但还缺少系统化 benchmark 数据。
7. Markdown 输出安全边界需要持续确认，例如 sanitizer、链接协议限制和 XSS 防护。

### 建议补强

补 `documents` 建表迁移：

> 完善 Supabase 数据库迁移链路，支持空库按编号一键初始化。

补 API Key 应用层加密：

> 对用户 API Key 做服务端加密存储，结合 RLS 和 Edge Function 代理调用降低密钥泄露风险。

补 RAG 引用溯源 E2E：

```text
mock knowledge_chunks
-> 触发 knowledge-enhanced
-> mock 模型输出参考片段
-> 点击引用角标
-> 断言来源面板定位高亮
```

补检索 benchmark：

- 全量拉 embedding 请求大小。
- 缓存命中后请求大小。
- Worker vs 主线程检索耗时。
- Markdown 全量渲染 vs stable/tail 增量渲染耗时。
- TTFT 前后对比。

补 pgvector 服务端检索：

- 启用 `vector` extension。
- 使用 `embedding vector(1536)`。
- 新增 RPC `match_knowledge_chunks`。
- 小知识库走客户端缓存检索，大知识库走 pgvector。

## 12. 开发排查与改动落点

### 登录后一直跳登录

排查顺序：

1. 看 `.env` 的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 是否存在。
2. 看 `src/utils/supabase.ts` 的 `assertSupabaseConfigured()` 是否抛错。
3. 看 `src/stores/user.ts` 的 `initialize()` 是否正确恢复 session。
4. 看 `src/router/index.ts` 的 `beforeEach` 是否因为 `isLoggedIn=false` 重定向。
5. 如果只有 admin 页面跳转，看 `userStore.isAdmin` 的 role 判断。

### AI 问答没有返回

按链路切：

```text
AI 配置完整性
-> 是否创建/选择会话
-> 是否选择知识库和问答模式
-> 知识切片是否取到
-> embedding/关键词检索是否异常
-> Edge Function 是否调用成功
-> SSE 是否解析到 delta
-> assistant 消息是否落库
```

关键文件：

- `src/stores/aiConfig.ts`
- `src/api/userAiConfig.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/api/chat.ts`
- `src/api/ai.ts`
- `supabase/functions/ai-chat/index.ts`

### 知识库问答答非所问

先判断是“召回错了”还是“召回对了但模型没用好”：

- 如果 `sources` 里没有相关片段，问题在检索侧。
- 如果 `sources` 相关但回答乱编，问题在 Prompt 约束或模型能力侧。
- 如果多轮追问失败，看是否触发问题改写。

排查文件：

- `src/utils/chunkText.ts`
- `src/utils/retrieveChunks.ts`
- `src/utils/similarity.ts`
- `src/utils/fuseRetrieval.ts`
- `src/utils/rewriteQuestion.ts`
- `src/utils/buildQaPrompt.ts`

### 流式输出卡顿

卡顿分两类：

- 输入/滚动卡：主线程被检索计算、JSON 解析或高频响应式更新占用。
- 回答越长越卡：每帧 Markdown 全文重解析。

对应优化：

- `src/utils/retrievalWorkerClient.ts`
- `src/utils/embeddingCache.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/utils/streamingMarkdown.ts`

### 引用角标不显示或点击无反应

排查顺序：

1. 模型回答末尾是否包含约定格式的“参考片段”。
2. `src/utils/parseCitations.ts` 是否解析到有效序号。
3. assistant 消息的 `sources` 是否保存成功。
4. `SourceChunks.vue` 是否拿到对应 chunk。
5. 引用序号是否越界，越界会被过滤。

### 常见改动落点

新增页面：

1. 在 `src/views/` 新增页面组件。
2. 在 `src/router/index.ts` 添加路由，确定是否需要 `requiresAuth/requiresAdmin`。
3. 如果出现在侧边栏，修改 `src/router/menus.ts`。
4. 接口先放到 `src/api/`，不要把 Supabase 查询散落到页面。

新增埋点：

1. 在 `src/constants/analyticsEvents.ts` 添加事件名。
2. 在业务动作处调用 `src/utils/tracker.ts` 的 `track()`。
3. payload 保持小而稳定，不放大文本、API Key 或隐私内容。
4. 管理后台展示时再扩展 RPC 或 Edge Function 聚合。

新增 AI 写作动作：

1. 在 `src/utils/aiAssistantPrompts.ts` 添加动作和 Prompt。
2. 在 `src/components/document/AIAssistantPanel.vue` 接入按钮/选项。
3. 复用现有 AI 配置读取和 Edge Function 代理。
4. 明确结果是替换、追加，还是插入到光标位置。

把客户端检索迁到 pgvector：

1. 保留当前客户端检索作为小知识库路径。
2. 新增 Supabase RPC：输入 `knowledge_base_id/query_embedding/top_k`，返回相似 chunks。
3. 当切片数超过阈值时走 RPC。
4. 关键词路可以继续在前端做，也可以迁移到服务端全文检索。
5. RRF 融合逻辑可复用，只是一条候选来源变成服务端。

## 13. 代码阅读路线

如果只有 30 分钟看项目，按这个顺序：

1. `README.md`：先理解项目定位和亮点。
2. `src/router/index.ts`：看页面边界和权限模型。
3. `src/main.ts`：看启动顺序。
4. `src/views/chat/ChatView.vue`：看核心页面组合。
5. `src/views/chat/composables/useChatMessages.ts`：看问答主链路。
6. `src/api/chat.ts`：看会话、消息、切片取数和缓存接入。
7. `src/utils/chunkText.ts`、`src/utils/fuseRetrieval.ts`、`src/utils/retrievalWorkerClient.ts`：看 RAG 算法。
8. `src/api/ai.ts`：看 SSE 解析。
9. `supabase/functions/ai-chat/index.ts`：看服务端代理边界。
10. `src/utils/__tests__/` 和 `e2e/chat.spec.ts`：看测试如何证明核心行为。

面试前 5 分钟速记：

```text
文档/文件 -> 切片 -> embedding -> IndexedDB 缓存 -> Worker 检索
-> RRF 融合 -> Prompt -> Edge Function -> SSE
-> rAF/Markdown 增量渲染 -> 引用溯源
```

最终收束：

> 这个项目的价值不是“我会调 AI API”，而是我把大模型 API 包装成了一个具备知识入库、检索增强、流式交互、引用溯源、性能优化、权限隔离、可观测和测试保障的完整 AI 应用。
