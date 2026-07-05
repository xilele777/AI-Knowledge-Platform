# AI Knowledge Platform 项目开发全手册

> 用途：快速理解项目全貌、开发维护、面试复盘与抗追问。  
> 口径原则：只讲源码真实存在的能力；对未完成或有边界的点，主动说清楚取舍。

## 0. 一句话讲清项目

这是一个基于 **Vue 3 + TypeScript + Supabase** 的 AI 知识库平台。用户可以创建 Markdown 文档或上传知识文件，把内容切片、向量化并沉淀到知识库；问答时前端召回相关片段构建 Prompt，再通过 Supabase Edge Function 代理 OpenAI 兼容接口进行 SSE 流式回答，同时支持引用溯源、AI 写作、共享广场、管理后台、埋点、运行时性能监控和测试/CI。

面试版：

> 我做的不是一个单纯聊天页，而是一套轻量 AI 知识平台。核心链路是“文档/文件入库 -> 文本切片 -> embedding -> 客户端混合检索 -> Prompt 构建 -> Edge Function 代理模型 -> SSE 流式回答 -> 引用溯源落库”。为了让这个链路能被追问，我补了 IndexedDB 向量缓存、Web Worker 检索卸载、RRF 混合检索、流式 Markdown 增量渲染、`<think>` 分流、性能埋点、错误监控、单测和 E2E。

## 1. 技术栈

| 层级 | 技术 | 项目中承担的职责 |
| --- | --- | --- |
| 框架 | Vue 3 Composition API | 页面、组件、响应式状态 |
| 语言 | TypeScript | 类型约束、数据模型表达 |
| 构建 | Vite 8 | 开发服务器、生产构建、代码分包 |
| UI | Element Plus + 自定义主题 | 表单、弹窗、布局、后台组件 |
| 状态 | Pinia 3 | 用户登录态、AI 配置等全局状态 |
| 路由 | Vue Router 5 | 页面路由、登录/管理员守卫、懒加载 |
| BaaS | Supabase | Auth、Postgres、RLS、RPC、Edge Functions |
| 编辑器 | md-editor-v3 | Markdown 文档编辑与预览 |
| 图表 | ECharts + vue-echarts | 管理后台统计图表 |
| 单测 | Vitest | 核心纯函数测试 |
| E2E | Playwright | 全 mock 后端的问答关键路径 |
| CI | GitHub Actions | lint、单测、构建、E2E |

## 2. 仓库结构总览

```text
AI-Knowledge-Platform/
├── src/
│   ├── main.ts                         # 应用入口：初始化错误监控、Pinia、用户态、路由、RUM
│   ├── App.vue                         # 根组件
│   ├── router/                         # 路由表、路由守卫、菜单配置
│   ├── stores/                         # Pinia：user、aiConfig
│   ├── api/                            # 前端数据访问层：Supabase + Edge Function
│   ├── types/                          # 业务类型定义
│   ├── utils/                          # RAG、流式解析、缓存、性能、错误监控等纯函数/工具
│   ├── workers/                        # retrieval.worker.ts，检索计算下放线程
│   ├── views/                          # 页面视图：docs、knowledge、chat、admin、shared、login
│   ├── components/                     # 跨页面公共组件、文档 AI 助手、知识文件上传
│   ├── composables/                    # 通用组合式函数
│   ├── layouts/                        # AppLayout/MainLayout/AdminLayout
│   ├── styles/                         # 全局主题和 Element Plus 覆盖
│   └── constants/                      # 埋点事件常量
├── supabase/
│   ├── sql/                            # 数据库迁移脚本 001-012
│   └── functions/                      # ai-chat、ai-embeddings、admin-analytics
├── e2e/                                # Playwright E2E
├── docs/                               # 项目文档
├── scripts/                            # smoke 脚本
└── .github/workflows/ci.yml            # CI
```

分层依赖可以这样讲：

```text
types / utils
    ↑
api
    ↑
stores
    ↑
views / components
```

`utils` 尽量做成无 DOM、无网络或低耦合纯函数，便于单测；`api` 是访问 Supabase 和 Edge Functions 的唯一入口；`views` 只负责组合状态、交互和渲染。

## 3. 本地启动与部署

### 3.1 环境变量

`.env.example` 对应前端需要的两个变量：

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

前端通过 `src/utils/supabase.ts` 初始化 Supabase 客户端。未配置时，相关 API 会通过 `assertSupabaseConfigured()` 抛出明确错误。

### 3.2 本地命令

```bash
npm install
npm run dev
npm run build
npm test
npm run test:e2e
npm run lint:check
```

### 3.3 Supabase 初始化顺序

按 `supabase/sql/` 编号从 `001` 到 `012` 执行迁移，然后部署 Edge Functions：

```bash
supabase functions deploy ai-chat
supabase functions deploy ai-embeddings
supabase functions deploy admin-analytics
```

重要注意：

- 当前仓库的 SQL 脚本会修改 `documents` 表，但没有看到创建 `documents` 表的独立迁移。如果从空库部署，需要补一份 `documents` 建表迁移，否则 `011_document_sharing.sql` 和 `007_document_knowledge_bridge.sql` 会依赖不存在的表。
- `user_ai_config.api_key` 当前是通过 HTTPS 传输、RLS 隔离访问，但代码里没有做应用层加密或 KMS 加密。面试时不要说“做了数据库密文存储”，更准确的说法是“通过 RLS 限制仅本人和授权 Edge Function 读取，后续可演进为服务端加密存储”。

## 4. 应用启动链路

入口文件：[src/main.ts](../src/main.ts)

启动顺序：

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

- 先注册 Pinia，再初始化 `userStore`，最后注册 router。这样路由守卫首次执行时，登录态已经尽量恢复完成。
- `initErrorMonitor(app)` 需要在 app 创建后尽早注册，覆盖 Vue 错误、window error、unhandled rejection。
- `initWebVitalsReporting()` 在挂载后启动，采集 LCP/CLS/INP 近似值。

## 5. 路由与权限

路由文件：[src/router/index.ts](../src/router/index.ts)

路由分三类：

| 类型 | 路径 | 权限 |
| --- | --- | --- |
| 公开页 | `/login`、`/register` | 未登录可访问 |
| 业务页 | `/dashboard`、`/docs`、`/knowledge`、`/chat`、`/profile`、`/shared` | 需要登录 |
| 管理页 | `/admin/*` | 需要登录且 admin |

守卫逻辑：

1. 如果 `userStore.initialized` 为 false，先等待 `initialize()`。
2. 未登录访问业务页，重定向 `/login?redirect=原路径`。
3. 已登录访问登录/注册页，重定向 `/dashboard`。
4. 非管理员访问 `/admin`，重定向 `/dashboard`。

管理员判断在 [src/stores/user.ts](../src/stores/user.ts)：

- 优先看 `user.app_metadata.role`
- 其次看 `user.user_metadata.role`
- 兼容 `app_metadata.is_admin` 和 `user_metadata.is_admin`

面试追问：

> 为什么前端路由守卫还不够？

回答：前端守卫只是体验层和第一道拦截，不能作为安全边界。真正的数据隔离靠 Supabase RLS、RPC 内的 admin 校验、Edge Function 里的 `auth.getUser()`。前端能被绕过，数据库策略不能被绕过。

## 6. 全局状态

### 6.1 user store

文件：[src/stores/user.ts](../src/stores/user.ts)

状态：

- `user`
- `session`
- `role`
- `initialized`
- `loading`

动作：

- `initialize()`：恢复 session、获取 user、绑定 auth listener。
- `login()`：邮箱密码登录后同步 store。
- `register()`：注册后同步 store。
- `logout()`：调用 Supabase logout 并清空本地状态。
- `bindAuthListener()`：监听 `onAuthStateChange`，跨标签页登录/退出时同步。

### 6.2 AI config store

文件：[src/stores/aiConfig.ts](../src/stores/aiConfig.ts)

职责：

- 懒加载用户 AI 配置。
- 用 `loadingPromise` 防止多个组件同时触发重复请求。
- 通过 `resolvedConfig` 补默认值。
- 通过 `isComplete` 和 `missingFields` 判断是否可以调用模型。

默认值逻辑在 [src/utils/aiConfig.ts](../src/utils/aiConfig.ts)：

- `baseUrl` 默认 `https://api.openai.com/v1`
- `model` 默认 `gpt-4o-mini`
- 完整性只强制 `baseUrl` 和 `apiKey`

## 7. 数据模型

### 7.1 knowledge_bases

来源：[supabase/sql/001_knowledge_module.sql](../supabase/sql/001_knowledge_module.sql)

字段：

- `id`
- `owner_id`
- `name`
- `description`
- `status`: `active | archived`
- `qa_config`: 后续 `009_knowledge_qa_config.sql` 添加，用于知识库默认问答配置
- `created_at`
- `updated_at`

用途：用户的知识库容器，一个知识库可以关联文件、文档和切片。

### 7.2 knowledge_files

字段：

- `id`
- `knowledge_base_id`
- `owner_id`
- `file_name`
- `file_path` / 兼容旧字段 `storage_path`
- `file_size`
- `mime_type`
- `status`: `pending | processing | done | failed`
- `meta`
- `created_at`
- `updated_at`

用途：上传文件的元数据记录。项目当前主要处理文本类文件，文件上传组件在 [src/components/knowledge/FileUpload.vue](../src/components/knowledge/FileUpload.vue)。

### 7.3 knowledge_chunks

字段：

- `id`
- `knowledge_base_id`
- `file_id`
- `document_id`
- `source_type`: `file | document`
- `owner_id`
- `chunk_index`
- `content`
- `token_count`
- `meta`
- `embedding double precision[]`
- `created_at`

用途：RAG 检索的最小单位。文件和文档最终都会落到这张表。

### 7.4 knowledge_documents

来源：[supabase/sql/007_document_knowledge_bridge.sql](../supabase/sql/007_document_knowledge_bridge.sql)

字段：

- `id`
- `knowledge_base_id`
- `document_id`
- `owner_id`
- `title_snapshot`
- `status`
- `last_chunk_count`
- `last_synced_at`
- `created_at`
- `updated_at`

用途：站内文档和知识库之间的桥接关系。文档标题可能会变，所以保留 `title_snapshot`，同时查询时尽量取 documents 表里的新标题。

### 7.5 documents

代码中期望字段：

- `id`
- `owner_id`
- `title`
- `content_md`
- `summary`
- `status`: `draft | published | archived`
- `is_shared`
- `shared_at`
- `created_at`
- `updated_at`

主要 API：[src/api/documents.ts](../src/api/documents.ts)

注意：当前迁移只看到 `011_document_sharing.sql` 对 `documents` 加分享字段和 RLS，没有看到建表脚本。从空库部署时需要补齐。

### 7.6 chats

字段：

- `id`
- `owner_id`
- `knowledge_base_id`
- `title`
- `created_at`
- `updated_at`

触发器：插入消息后 `touch_chat_updated_at()` 更新会话 `updated_at`。

### 7.7 chat_messages

字段：

- `id`
- `chat_id`
- `owner_id`
- `role`: `user | assistant | system`
- `content`
- `sources jsonb`
- `answer_mode`: `general-ai | knowledge-enhanced | strict-knowledge`
- `status`: `streaming | done | error`
- `error_message`
- `created_at`

兼容性设计：

- [src/api/chat.ts](../src/api/chat.ts) 在读写消息时会检测 `sources`、`answer_mode`、`status`、`error_message` 是否缺列。
- 如果旧库没执行新迁移，会 fallback 到基础字段读写，保证主流程不崩。

### 7.8 analytics_events

字段：

- `id`
- `owner_id`
- `event_name`
- `payload`
- `created_at`

用途：

- 登录/注册/文档/文件/问答业务埋点
- Web Vitals
- QA 链路性能
- 前端错误

### 7.9 profiles

字段：

- `id`
- `email`
- `full_name`
- `role`
- `created_at`
- `updated_at`

触发器：`auth.users` 新增用户后自动插入/更新 profiles。

RPC：

- `admin_get_profiles(p_limit)`
- `admin_get_analytics_overview(p_days)`

### 7.10 user_ai_config

字段：

- `id`
- `user_id`
- `api_base_url`
- `api_key`
- `model`
- `created_at`
- `updated_at`

约束：

- `user_id` 唯一，一个用户一条配置。
- RLS 限定 `auth.uid() = user_id`。

## 8. RLS 与安全模型

安全边界分三层：

1. 前端路由守卫：防止误入未授权页面，提升体验。
2. API 层 owner 条件：所有个人数据读写都附带 `owner_id = userId`。
3. Supabase RLS：数据库最终强制 `auth.uid() = owner_id/user_id`。

管理员逻辑：

- 前端：`userStore.isAdmin`
- RPC：读取 JWT 中的 `app_metadata/user_metadata` 和 profiles role。
- Edge Function：使用前端传来的 Authorization header 初始化 Supabase client，再通过 RPC 校验。

面试口径：

> 我不会把前端路由守卫当成安全边界。真正的数据隔离在 RLS 和 RPC 内部校验；前端只是让用户不进入无权限页面。

## 9. 业务模块

### 9.1 登录/注册

文件：

- [src/views/login/LoginView.vue](../src/views/login/LoginView.vue)
- [src/views/register/RegisterView.vue](../src/views/register/RegisterView.vue)
- [src/api/auth.ts](../src/api/auth.ts)
- [src/stores/user.ts](../src/stores/user.ts)

流程：

```text
输入邮箱密码
-> api/auth 调 Supabase Auth
-> userStore.setAuth()
-> track(login_success/register_success)
-> 跳转 dashboard 或 redirect
```

### 9.2 文档管理

文件：

- [src/views/docs/DocsListView.vue](../src/views/docs/DocsListView.vue)
- [src/views/docs/DocEditorView.vue](../src/views/docs/DocEditorView.vue)
- [src/api/documents.ts](../src/api/documents.ts)
- [src/utils/documentDraft.ts](../src/utils/documentDraft.ts)
- [src/components/document/AIAssistantPanel.vue](../src/components/document/AIAssistantPanel.vue)

能力：

- 创建、编辑、删除 Markdown 文档。
- 搜索标题、分页查询。
- localStorage 草稿保护。
- 分享到共享广场。
- AI 写作助手：润色、扩写、总结、续写。

草稿设计：

- key：`doc_draft_v1:{documentId}`
- value：`{ title, content, savedAt }`
- 读时校验结构，保存成功后清理。

面试追问：

> 为什么草稿用 localStorage，不用数据库自动保存？

回答：草稿是编辑中的临时保护，localStorage 能避免频繁写库和冲突处理，保存成功后清理。更严肃的协同编辑或跨端草稿可以演进为服务端 draft 表，但当前项目单用户编辑场景下 localStorage 成本更低。

### 9.3 文档加入知识库

入口：[src/api/documents.ts](../src/api/documents.ts) 的 `addDocumentToKnowledgeBase()`

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

关键取舍：

- 文档重新同步时先删旧切片再插新切片，配合 IndexedDB 缓存的 id diff 模型。
- 切片行插入后不 update，缓存一致性问题被简化为集合差异。

### 9.4 知识库与文件

文件：

- [src/views/knowledge/KnowledgeListView.vue](../src/views/knowledge/KnowledgeListView.vue)
- [src/views/knowledge/KnowledgeDetailView.vue](../src/views/knowledge/KnowledgeDetailView.vue)
- [src/components/knowledge/FileUpload.vue](../src/components/knowledge/FileUpload.vue)
- [src/api/knowledge.ts](../src/api/knowledge.ts)

能力：

- 创建/删除知识库。
- 更新知识库 QA 默认配置。
- 上传文本文件并切片。
- 查看知识库文件和关联文档。
- 删除知识库时手动删除 chunks、files、documents bridge，再删知识库。

兼容性：

- `createKnowledgeFile()` 兼容旧 schema 的 `storage_path` 和 `file_type` 非空约束。
- 通过尝试插入和错误消息判断是否启用兼容字段。

### 9.5 AI 问答

主要文件：

- [src/views/chat/ChatView.vue](../src/views/chat/ChatView.vue)
- [src/views/chat/composables/useChatSession.ts](../src/views/chat/composables/useChatSession.ts)
- [src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)
- [src/views/chat/components/ChatMessageList.vue](../src/views/chat/components/ChatMessageList.vue)
- [src/views/chat/components/ChatInput.vue](../src/views/chat/components/ChatInput.vue)
- [src/views/chat/components/SourceChunks.vue](../src/views/chat/components/SourceChunks.vue)
- [src/views/chat/components/AssistantMarkdown.vue](../src/views/chat/components/AssistantMarkdown.vue)

会话职责拆分：

- `useChatSession()`：知识库列表、会话列表、当前会话、QA 配置抽屉、删除会话。
- `useChatMessages()`：消息加载、发送、重新生成、停止生成、检索、AI 流式生成、消息落库。

发送问题完整链路：

```text
handleSend(question)
-> ensureActiveChat(question)，无会话则创建
-> 本地追加 pending 用户消息
-> createChatMessage() 保存用户消息
-> 构建历史 buildChatHistory()
-> prepareSmartQa()
   -> 如有知识库且启用知识增强，取 chunks
   -> 必要时改写追问
   -> 向量检索 + 关键词检索并行
   -> RRF 融合
   -> 质量门槛决定 knowledge-enhanced 或 general-ai
   -> build prompt
-> 本地追加 streaming assistant 占位消息
-> generateAiTextStream()
   -> SSE chunk 到达后累加 finalText
   -> requestAnimationFrame 合帧更新响应式状态
-> 流结束/失败/停止
-> createChatMessage() 保存 assistant 消息
-> 用真实消息替换 pending 消息
-> track QA_SEND + QA_PERF
```

重新生成：

- 复用 `lastQuestion` 和 `lastQuestionChatId`。
- `takeMessagesBeforeLastQuestion()` 会排除当前问题及其之后的旧回答，避免旧答案污染新答案。

停止生成：

- `handleStop()` 调用 `AbortController.abort()`。
- Abort signal 传到 `generateAiTextStream()`，再传给 `fetchEdgeFunctionStream()`。
- 如果停止时没有任何生成内容，删除本地 assistant 占位，不落库。
- 如果已有部分内容，保留并按最终状态处理。

## 10. RAG 核心链路

### 10.1 切片

文件：[src/utils/chunkText.ts](../src/utils/chunkText.ts)

默认参数：

- `minLength = 300`
- `maxLength = 500`

算法：

```text
统一换行和清理空字符
-> 按空行分段
-> 超长段落按中英文标点拆句
-> 仍超长则硬切
-> 短片段向后合并，尽量满足 minLength
-> 返回 { index, content, length }
```

为什么不是按 token 精确切：

> 当前项目没有引入 tokenizer，按字符切是工程复杂度和可用性的折中。中文场景下字符长度能粗略控制上下文体积；如果接入特定模型或大规模语料，可以引入 tokenizer 并增加 overlap 策略。

### 10.2 Embedding 生成

文件：

- [src/utils/vectorEmbedding.ts](../src/utils/vectorEmbedding.ts)
- [supabase/functions/ai-embeddings/index.ts](../supabase/functions/ai-embeddings/index.ts)
- [supabase/functions/_shared/aiConfig.ts](../supabase/functions/_shared/aiConfig.ts)

流程：

```text
createEmbedding/createBatchEmbeddings
-> invokeEdgeFunction('ai-embeddings')
-> Edge Function 解析用户 token
-> 查询 user_ai_config
-> 调用 {baseUrl}/embeddings
-> 返回 OpenAI 兼容 embedding data
```

`resolveEmbeddingModel()`：

- 如果用户配置的 model 名称包含 `embedding`，直接使用。
- 否则默认使用 `text-embedding-3-small`。

### 10.3 IndexedDB 向量缓存

文件：[src/utils/embeddingCache.ts](../src/utils/embeddingCache.ts)

核心假设：

> `knowledge_chunks` 行是不可变的。embedding 在插入前生成，之后只会整批删除、重新插入，不做 update。

缓存策略：

```text
loadCachedChunks(knowledgeBaseId)
-> 服务端只查 id 列表
-> diffChunkIds(serverIds, cachedIds)
   -> missingIds: 服务端有、本地没有
   -> staleIds: 本地有、服务端没有
-> missing 少则按 id 分批拉取完整行
-> missing 过半则整表拉取
-> stale 异步删除
-> sourceName 不进缓存，每次新鲜查询文件名/文档名
```

为什么不用 localStorage：

- localStorage 同步 API 会阻塞主线程。
- 容量小。
- 不适合存大量向量。
- 不能原生保留 TypedArray 结构。

为什么用 `Float32Array`：

- IndexedDB 支持结构化存储 TypedArray。
- 比 JSON `number[]` 体积小很多。
- 传给 Worker 时更适合打包成矩阵。

降级：

- IndexedDB 不可用时返回 `null`。
- 调用方退回 `getKnowledgeChunksForQa()` 全量拉取。
- 业务可用性优先于缓存收益。

### 10.4 关键词检索

文件：[src/utils/retrieveChunks.ts](../src/utils/retrieveChunks.ts)

流程：

```text
normalize question
-> 英文/数字 token
-> 中文连续词
-> 中文 2-4 gram
-> 去停用词
-> 对每个 chunk 计算：
   keywordScore = 命中数 / 关键词数 * keywordBoost
   exactMatchScore = 完整问题命中加分
   densityScore = hitCount / sqrt(chunkLength)
-> 按 score、hitCount、短内容优先排序
```

价值判断：

- `top.score >= 0.1`
- `top.hitCount >= 2`
- `averageScore >= 0.06`

### 10.5 向量检索

文件：

- [src/utils/similarity.ts](../src/utils/similarity.ts)
- [src/utils/retrievalWorkerClient.ts](../src/utils/retrievalWorkerClient.ts)
- [src/workers/retrieval.worker.ts](../src/workers/retrieval.worker.ts)

流程：

```text
问题 -> embedding
-> queryEmbedding Float32Array
-> chunksWithEmbeddings
-> packEmbeddingMatrix(n x dim)
-> postMessage transfer matrix.buffer
-> Worker 计算余弦相似度 topK
-> 返回 index + similarity
```

为什么要打包矩阵：

- 如果传 500 个 `number[]`，结构化克隆会复制大量对象。
- 打包成一个连续 `Float32Array` 后，只 transfer 一个 `ArrayBuffer`。
- 跨线程传输成本从“复制数据”变成“转移所有权”。

为什么打包副本而不是直接 transfer 缓存里的向量：

- transfer 后源 buffer 会 detach。
- 缓存里的向量还要给后续调用使用。
- 打包副本即使被 detach，也可以从源 embeddings 重新打包降级。

Worker 降级：

- Worker 不存在、创建失败、脚本报错、单次请求失败，都会回退主线程同步计算。

### 10.6 RRF 混合检索

文件：[src/utils/fuseRetrieval.ts](../src/utils/fuseRetrieval.ts)

旧问题：

> 向量和关键词如果做二选一，会丢掉互补信号。向量擅长语义改写，关键词擅长专有名词、型号、函数名等精确匹配。

方案：

```text
vector top8 + keyword top8
-> Reciprocal Rank Fusion
-> score(d) = Σ 1 / (k + rank_i(d))
-> k = 60
-> topK = 5
```

为什么不用分数加权：

- 向量分是余弦相似度，关键词分是自定义密度分，量纲不一致。
- 加权需要归一化和调参，脆弱。
- RRF 只依赖排名，天然免归一化。

### 10.7 多轮问题改写

文件：[src/utils/rewriteQuestion.ts](../src/utils/rewriteQuestion.ts)

问题：

用户追问“那它怎么部署？”时，回答模型能看到历史，但检索器只看到“它怎么部署”，会召回失败。

触发条件：

- 有历史。
- 问题长度 <= 12，或包含指代词：它、这个、上述、前面、该方案等。

调用策略：

- 只在命中触发条件时调用一次 LLM。
- `temperature = 0`
- `maxTokens = 120`
- 2.5 秒超时。
- 失败返回原问题。
- 改写只用于检索，展示和落库仍是用户原句。

### 10.8 Prompt 构建

文件：[src/utils/buildQaPrompt.ts](../src/utils/buildQaPrompt.ts)

两种模式：

- `general-ai`：没有有价值来源时，走通用回答 Prompt。
- `knowledge-enhanced`：有高质量来源时，把片段按 `【片段 x】` 注入 Prompt。

知识增强 Prompt 包含：

- 系统指令
- 回答风格
- 用户问题
- 参考资料片段
- 输出要求：优先使用资料，资料不足可补通用知识，末尾输出 `参考片段: [片段x,片段y]`

### 10.9 模式分流

文件：[src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)

决策：

```text
qaConfig.useKnowledgeEnhanced && selectedKnowledgeBaseId
-> 检索
-> vectorValuable || keywordValuable
-> true: knowledge-enhanced
-> false: general-ai
```

这点很重要：不是选了知识库就强行塞低质量片段。低质量召回会误导模型，所以设置质量门槛。

## 11. SSE 与流式渲染

### 11.1 Edge Function 代理

文件：[supabase/functions/ai-chat/index.ts](../supabase/functions/ai-chat/index.ts)

职责：

- 校验 POST。
- 校验 Authorization header。
- 解析用户 AI 配置。
- 拼 OpenAI 兼容 chat/completions 请求。
- 支持 `stream: true` 时直接转发 upstream body。
- 非流式时返回 JSON。
- 服务端再次裁剪 history：最多 20 条、总字符 24000。

为什么不用前端直接请求模型 API：

- API Key 不应该暴露给浏览器网络请求目标。
- Edge Function 可以统一 CORS、鉴权、错误处理。
- 可以在服务端加成本保护，比如 history 二次裁剪。

### 11.2 前端手写 SSE 解析

文件：[src/api/ai.ts](../src/api/ai.ts)

关键点：

- `fetch` 而不是 `EventSource`，因为需要 POST body 和 Authorization header。
- `TextDecoder.decode(value, { stream: true })` 处理 UTF-8 多字节字符跨 chunk。
- 用 buffer 按空行拆 SSE event，处理事件边界跨 chunk。
- `parseSseDataLines()` 提取所有 `data:` 行。
- `[DONE]` 跳过。
- `extractStreamDeltaText()` 兼容 `delta.content`、`message.content`、`text` 等不同 OpenAI 兼容返回。
- malformed event 忽略，不中断后续流。

### 11.3 rAF 合帧

位置：[src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)

问题：

SSE chunk 到达频率可能高于屏幕刷新率。如果每个 chunk 都更新 Vue 响应式状态，长回答会频繁触发 Markdown 重渲染。

方案：

- chunk 到达只累加 `finalText`。
- 如果当前没有 pending frame，注册一次 `requestAnimationFrame(flushStreamingText)`。
- 一帧最多一次响应式更新。

### 11.4 Markdown 增量渲染

文件：[src/utils/streamingMarkdown.ts](../src/utils/streamingMarkdown.ts)

问题：

rAF 只控制“更新频率”，没有控制“每次渲染量”。长回答如果每帧全文 Markdown 解析，仍然会越来越卡。

方案：

```text
按围栏状态机扫描全文
-> 找最后一个代码围栏外的空行
-> stable = 已完成段落
-> tail = 进行中尾段
-> stable 少变，tail 每帧变
```

边界：

- 代码围栏内的空行不能作为段落边界。
- 未闭合代码块用 `closeUnbalancedFence()` 合成闭栏，避免样式跳变。
- 超长代码块内部无安全切分点，会退化为旧行为。

### 11.5 `<think>` 推理分流

文件：[src/utils/streamingThinkParser.ts](../src/utils/streamingThinkParser.ts)

问题：

推理模型可能输出：

```text
<think>推理过程...</think>最终回答
```

如果直接渲染，推理内容会污染正文；如果用正则等闭合后再剥离，流式期间仍会闪现。

方案：

- 每帧解析“累积全文”，而不是单个 chunk。
- 支持 `<think>` 和 `</think>` 跨 chunk。
- 半截标签临时隐藏。
- thinking 通道进入可折叠面板。
- answer 通道进入正文。
- 落库仍保存原始全文，展示层再解析。

## 12. 引用溯源

文件：

- [src/utils/parseCitations.ts](../src/utils/parseCitations.ts)
- [src/views/chat/components/SourceChunks.vue](../src/views/chat/components/SourceChunks.vue)
- [src/views/chat/components/ChatMessageList.vue](../src/views/chat/components/ChatMessageList.vue)

Prompt 要求模型末尾输出：

```text
参考片段: [片段1, 片段3]
```

解析策略：

- 只认结尾处最后一个 `参考片段:`。
- 兼容全角/半角冒号。
- 兼容 `片段 1`、`片段1`。
- 去重、升序。
- 如果解析不出序号，不改原文。

交互：

- 回答正文剥离引用行。
- 渲染可点击角标。
- 点击展开来源面板。
- 滚动定位对应来源切片。
- 高亮“被引用”状态。

面试口径：

> RAG 的可信度不只是召回和生成，还要让用户能验证。前端能做的是把“模型说参考了片段 x”变成可点击、可定位、可核对的溯源闭环。

## 13. AI 写作助手

文件：

- [src/components/document/AIAssistantPanel.vue](../src/components/document/AIAssistantPanel.vue)
- [src/utils/aiAssistantPrompts.ts](../src/utils/aiAssistantPrompts.ts)
- [src/api/ai.ts](../src/api/ai.ts)

能力：

- 润色
- 扩写
- 总结
- 续写

流程：

```text
选择操作和文本
-> 构建 Prompt
-> generateAiTextStream()
-> 面板内流式展示
-> 用户选择替换或追加到文档
-> track AI_WRITING_CALL
```

## 14. 共享广场

文件：

- [src/views/shared/SharedListView.vue](../src/views/shared/SharedListView.vue)
- [src/views/shared/SharedDetailView.vue](../src/views/shared/SharedDetailView.vue)
- [src/api/documents.ts](../src/api/documents.ts)

逻辑：

- `updateDocument()` 设置 `is_shared` 时同步设置/清空 `shared_at`。
- `getSharedDocuments()` 查询 `is_shared = true`。
- RLS policy `documents_select_shared` 允许 authenticated 用户查看共享文档。

注意：

- 当前路由把 `/shared` 放在登录后的主布局下，所以仍需要登录访问。
- 如果产品想做公网分享，需要把路由和 RLS policy 调整为 anon 可读，并处理作者信息脱敏。

## 15. 管理后台

文件：

- [src/views/admin/AdminHomeView.vue](../src/views/admin/AdminHomeView.vue)
- [src/views/admin/AdminUsersView.vue](../src/views/admin/AdminUsersView.vue)
- [src/views/admin/AdminDocsView.vue](../src/views/admin/AdminDocsView.vue)
- [src/views/admin/AdminFilesView.vue](../src/views/admin/AdminFilesView.vue)
- [src/views/admin/AdminChatsView.vue](../src/views/admin/AdminChatsView.vue)
- [src/views/admin/AdminAnalyticsView.vue](../src/views/admin/AdminAnalyticsView.vue)
- [src/api/admin.ts](../src/api/admin.ts)
- [supabase/functions/admin-analytics/index.ts](../supabase/functions/admin-analytics/index.ts)
- [supabase/sql/005_admin_analytics_rpc.sql](../supabase/sql/005_admin_analytics_rpc.sql)
- [supabase/sql/006_profiles_admin_users.sql](../supabase/sql/006_profiles_admin_users.sql)

能力：

- 用户列表
- 文档列表
- 文件列表
- 聊天列表
- 统计概览
- 登录趋势、AI 调用趋势、Top events

安全：

- 前端路由 `requiresAdmin`。
- RPC 内部再次校验 admin。
- `admin-analytics` Edge Function 只负责鉴权转发 RPC。

## 16. 可观测性

### 16.1 业务埋点

文件：

- [src/utils/tracker.ts](../src/utils/tracker.ts)
- [src/constants/analyticsEvents.ts](../src/constants/analyticsEvents.ts)

事件：

- `login_success`
- `register_success`
- `document_create`
- `document_delete`
- `document_save`
- `knowledge_base_create`
- `file_upload`
- `qa_send`
- `ai_writing_call`
- `perf_web_vitals`
- `qa_perf`
- `fe_error`

`track()` 会自动附加：

- `page_path`
- `page_query`
- `client_time`

失败策略：

- 埋点失败只 warning，不影响主流程。

### 16.2 Web Vitals

文件：[src/utils/perfMetrics.ts](../src/utils/perfMetrics.ts)

采集：

- LCP
- CLS
- INP 近似值：有 `interactionId` 的 event 取最大 duration。

上报时机：

- `visibilitychange` 到 hidden
- `pagehide`

### 16.3 QA 链路耗时

`startQaTimeline()` 分段：

- `retrieval_ms`: 提问到检索完成
- `ttft_ms`: 检索完成到首 token
- `stream_ms`: 首 token 到流结束
- `total_ms`: 总耗时

同时写 `performance.mark/measure`，方便 DevTools Performance 面板查看。

### 16.4 前端错误监控

文件：[src/utils/errorMonitor.ts](../src/utils/errorMonitor.ts)

捕获入口：

- `window.onerror`
- `unhandledrejection`
- `Vue app.config.errorHandler`

防风暴：

- 同一指纹最多 3 次。
- 会话总上报最多 30 次。
- message/stack 截断。
- 监控自身异常静默吞掉。

## 17. 性能优化

### 17.1 构建分包

文件：[vite.config.ts](../vite.config.ts)

策略：

- 路由组件懒加载。
- Element Plus 组件按需引入，不 import 全量 CSS。
- `manualChunks` 只手动分 `vendor-element-plus` 和 `vendor-supabase`。
- ECharts、md-editor 等懒加载路由专属依赖交给自动分包，避免首屏 vendor 过大。

README 记录的结果：

- 首屏 JS：1.24MB -> 0.70MB
- gzip：399KB -> 222KB
- 约 -44%

### 17.2 检索性能

- IndexedDB 缓存避免每次下载全量 embedding。
- TypedArray 降低体积和解析成本。
- Worker 避免主线程跑重计算。
- Transferable 避免跨线程结构化克隆大矩阵。

### 17.3 流式渲染性能

- rAF 合帧控制响应式更新频率。
- Markdown stable/tail 增量渲染控制单帧解析量。
- `<think>` 分流避免推理文本污染正文并减少不必要渲染。

## 18. 测试与 CI

### 18.1 单元测试

目录：[src/utils/__tests__/](../src/utils/__tests__)

覆盖：

- chunkText
- embeddingCache
- chatHistory
- fuseRetrieval
- parseCitations
- rewriteQuestion
- retrieveChunks
- similarity
- SSE parsing
- streamingMarkdown
- streamingThinkParser

项目 README 记录为 118 个 Vitest 用例。

测试价值：

> 核心算法被抽成纯函数，所以不需要 mock DOM 或真实网络，测试快、稳定、能覆盖边界。

### 18.2 E2E

文件：[e2e/chat.spec.ts](../e2e/chat.spec.ts)

特点：

- 不依赖真实 Supabase。
- `localStorage` 注入 Supabase session。
- `page.route` mock Auth、PostgREST、Edge Function SSE。
- 覆盖“进入 chat -> 发送问题 -> SSE 流式回答 -> think 面板 -> Markdown 渲染”。
- 验证未选知识库时不请求 `knowledge_chunks`。

### 18.3 CI

文件：[.github/workflows/ci.yml](../.github/workflows/ci.yml)

两个 job：

- `ci`: npm ci -> lint:check -> test -> build
- `e2e`: npm ci -> install playwright chromium -> test:e2e -> 失败上传报告

## 19. Edge Functions

### 19.1 共享 AI 配置解析

文件：[supabase/functions/_shared/aiConfig.ts](../supabase/functions/_shared/aiConfig.ts)

流程：

```text
读取 SUPABASE_URL / SUPABASE_ANON_KEY
-> 用 Authorization header 初始化 Supabase client
-> client.auth.getUser()
-> 查询 user_ai_config
-> 校验 api_key
-> 返回 { baseUrl, apiKey, model }
```

### 19.2 ai-chat

文件：[supabase/functions/ai-chat/index.ts](../supabase/functions/ai-chat/index.ts)

输入：

```ts
{
  params: {
    systemPrompt?,
    userPrompt,
    history?,
    temperature?,
    maxTokens?,
    topP?,
    presencePenalty?,
    frequencyPenalty?
  },
  stream?: boolean
}
```

输出：

- `stream = true`: 直接返回 upstream SSE body。
- `stream = false`: 返回 upstream JSON。

服务端保护：

- `MAX_HISTORY_MESSAGES = 20`
- `MAX_HISTORY_TOTAL_CHARS = 24000`

### 19.3 ai-embeddings

文件：[supabase/functions/ai-embeddings/index.ts](../supabase/functions/ai-embeddings/index.ts)

职责：

- 解析 input。
- 读取用户 AI 配置。
- 调 `{baseUrl}/embeddings`。
- 自动选择 embedding model。

### 19.4 admin-analytics

文件：[supabase/functions/admin-analytics/index.ts](../supabase/functions/admin-analytics/index.ts)

职责：

- 校验 Authorization header。
- 规范 days 到 1-30。
- 调 RPC `admin_get_analytics_overview`。
- RPC 内部做 admin 校验。

## 20. 关键文件地图

| 想看什么 | 文件 |
| --- | --- |
| 应用启动 | [src/main.ts](../src/main.ts) |
| 路由和权限 | [src/router/index.ts](../src/router/index.ts) |
| 用户状态 | [src/stores/user.ts](../src/stores/user.ts) |
| AI 配置状态 | [src/stores/aiConfig.ts](../src/stores/aiConfig.ts) |
| Supabase 客户端 | [src/utils/supabase.ts](../src/utils/supabase.ts) |
| Edge Function 调用封装 | [src/utils/serverProxy.ts](../src/utils/serverProxy.ts) |
| 文档 API | [src/api/documents.ts](../src/api/documents.ts) |
| 知识库 API | [src/api/knowledge.ts](../src/api/knowledge.ts) |
| 聊天 API | [src/api/chat.ts](../src/api/chat.ts) |
| AI/SSE API | [src/api/ai.ts](../src/api/ai.ts) |
| 聊天会话编排 | [src/views/chat/composables/useChatSession.ts](../src/views/chat/composables/useChatSession.ts) |
| 聊天消息/RAG 编排 | [src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts) |
| 切片算法 | [src/utils/chunkText.ts](../src/utils/chunkText.ts) |
| 关键词检索 | [src/utils/retrieveChunks.ts](../src/utils/retrieveChunks.ts) |
| 向量相似度 | [src/utils/similarity.ts](../src/utils/similarity.ts) |
| RRF 融合 | [src/utils/fuseRetrieval.ts](../src/utils/fuseRetrieval.ts) |
| 向量缓存 | [src/utils/embeddingCache.ts](../src/utils/embeddingCache.ts) |
| Worker 客户端 | [src/utils/retrievalWorkerClient.ts](../src/utils/retrievalWorkerClient.ts) |
| Worker | [src/workers/retrieval.worker.ts](../src/workers/retrieval.worker.ts) |
| Prompt | [src/utils/buildQaPrompt.ts](../src/utils/buildQaPrompt.ts) |
| 多轮历史裁剪 | [src/utils/chatHistory.ts](../src/utils/chatHistory.ts) |
| 问题改写 | [src/utils/rewriteQuestion.ts](../src/utils/rewriteQuestion.ts) |
| 引用解析 | [src/utils/parseCitations.ts](../src/utils/parseCitations.ts) |
| Markdown 增量渲染 | [src/utils/streamingMarkdown.ts](../src/utils/streamingMarkdown.ts) |
| think 分流 | [src/utils/streamingThinkParser.ts](../src/utils/streamingThinkParser.ts) |
| 性能度量 | [src/utils/perfMetrics.ts](../src/utils/perfMetrics.ts) |
| 错误监控 | [src/utils/errorMonitor.ts](../src/utils/errorMonitor.ts) |
| 埋点 | [src/utils/tracker.ts](../src/utils/tracker.ts) |
| AI 聊天代理 | [supabase/functions/ai-chat/index.ts](../supabase/functions/ai-chat/index.ts) |
| Embedding 代理 | [supabase/functions/ai-embeddings/index.ts](../supabase/functions/ai-embeddings/index.ts) |

## 21. 面试高频追问与回答

### Q1：你这个 RAG 和普通聊天有什么区别？

普通聊天只把用户问题发给模型。这个项目会先把用户文档/文件切成可检索片段，并保存 embedding；问答时先在知识库中召回相关片段，再把片段作为参考资料注入 Prompt。模型回答后还会保存来源切片，并在 UI 上做引用溯源。

### Q2：为什么检索放前端，不直接用 pgvector？

这是项目阶段和面试方向下的取舍。当前知识库规模是几百切片量级，前端缓存 embedding 后可以少一次服务端向量检索往返，而且能展示 Web Worker、IndexedDB、TypedArray、RRF 等前端深度能力。边界是万级切片会不适合，应演进为 pgvector RPC 或混合策略：小库走客户端，大库走服务端。

### Q3：IndexedDB 缓存怎么保证一致性？

依赖一个数据不变量：切片行不可变。文档重新同步或文件重处理时不是 update 切片，而是删除旧切片再插入新切片。因此只要对比服务端 id 集合和本地 id 集合即可：服务端有本地无就增量拉取，本地有服务端无就淘汰。

### Q4：为什么 sourceName 不进缓存？

文件名和文档标题可变，embedding 和 content 不变。如果把 sourceName 缓存起来，重命名后会显示旧名称。所以缓存只存稳定字段，展示名每次根据 fileId/documentId 新鲜查询。

### Q5：Worker 为什么还要降级？

Worker 是性能优化，不应该成为功能依赖。旧浏览器、构建异常、Worker 运行时报错都可能发生，所以失败时回到主线程同步计算，最多变慢，不能让问答不可用。

### Q6：RRF 为什么比加权平均好？

向量相似度和关键词评分量纲不同，强行加权需要归一化和调参。RRF 只使用排名，避免不同分数体系不可比的问题，适合把语义召回和关键词召回融合。

### Q7：多轮追问为什么要问题改写？

检索器只能看到 query，看不到完整对话语境。用户问“那它怎么部署”时，“它”没有检索意义。改写会把追问变成自包含问题，只用于检索，不改变用户看到的原句。

### Q8：为什么不用 EventSource？

EventSource 只能 GET，不能自定义 POST body，也不方便带 Authorization header。项目要通过 Edge Function 发送带参数的 POST 请求，所以用 fetch + ReadableStream 手写 SSE 解析。

### Q9：SSE chunk 切在半个 UTF-8 字符怎么办？

使用 `TextDecoder.decode(value, { stream: true })`。stream 模式会保留不完整字节序列，等下一段补齐后再解码。

### Q10：chunk 切在半个 SSE event 怎么办？

前端维护 buffer，把新解码文本拼进去，按空行拆完整 event，最后一个不完整片段留在 buffer 等下一轮。

### Q11：流式 Markdown 为什么会卡？你怎么优化？

卡有两层原因：chunk 高频触发响应式更新，以及每次更新都全文 Markdown 解析。项目先用 rAF 合帧降低更新频率，再用 stable/tail 切分让每帧只渲染尾段，两个优化解决的是不同维度。

### Q12：`<think>` 跨 chunk 怎么解析？

不按单个 chunk 解析，而是每帧解析累积全文。这样 `<thi` + `nk>` 下一帧自然能组成完整标签；对结尾半截标签临时隐藏，避免 UI 闪现残缺文本。

### Q13：API Key 安全怎么做？

当前做法是用户配置存到 `user_ai_config`，通过 Supabase RLS 限制只有本人可读写；模型请求由 Edge Function 使用用户 token 读取配置后代理，前端不会直接把 Key 发给第三方模型端点。严格说它不是应用层加密存储，后续可加服务端加密或密钥托管。

### Q14：为什么 Edge Function 还要裁剪 history？

前端裁剪是体验和成本优化，但客户端不可信。服务端再限制最多 20 条、24000 字符，是防御性成本保护，避免绕过前端逻辑导致上游 token 成本失控。

### Q15：怎么保证测试稳定？

核心算法抽成纯函数，用 Vitest 测边界。E2E 不依赖真实 Supabase 或真实 AI Key，而是用 Playwright route mock Auth、PostgREST 和 SSE，避免网络和模型输出不确定性。

## 22. 项目亮点 STAR 话术

### 22.1 客户端 RAG 检索性能优化

S：原本每次提问都要从 Supabase 拉最多 500 条切片和 embedding，网络和 JSON 解析成本高。  
T：要在不引入自建向量库的前提下提升检索体验，并保留前端主导架构。  
A：我设计了 IndexedDB 向量缓存，用服务端 id 集合和本地 id 集合做 diff；embedding 用 Float32Array 存储；检索计算下放 Web Worker，并把向量打包成矩阵用 Transferable 传输。  
R：缓存命中时请求从全量 embedding JSON 降到轻量 id 列表，重计算也不阻塞主线程。这个方案适合小中规模知识库，后续万级切片再切 pgvector。

### 22.2 混合检索和多轮追问增强

S：单纯向量检索容易漏专有名词，单纯关键词检索不懂语义改写，多轮追问还会因为指代词召回失败。  
T：提升 RAG 召回质量，让问答更稳定。  
A：我把向量 topK 和关键词 topK 并行计算，再用 RRF 融合；对短问题和含指代词问题，在检索前用低成本 LLM 改写为自包含 query；同时设置质量门槛，不强行使用低质量片段。  
R：语义问题和专有名词问题都能兼顾，多轮追问也能尽量命中上下文。

### 22.3 流式体验和可观测性

S：SSE 流式回答虽然能实时显示，但高频 chunk 和长 Markdown 全文渲染会导致卡顿，且优化效果如果没埋点很难证明。  
T：让流式输出更顺滑，并能采集真实运行指标。  
A：我手写 SSE 解析，支持边界缓冲和 AbortController；渲染上用 rAF 合帧和 stable/tail 增量 Markdown；同时采集 QA 检索耗时、TTFT、流式时长以及 Web Vitals，并接入错误监控。  
R：流式 UI 的性能瓶颈被分层解决，后续可以用埋点数据看 P50/P95，而不是只靠主观感觉。

## 23. 当前风险与可改进点

1. `documents` 建表迁移缺失：当前 SQL 脚本依赖 documents 表，需要补齐空库初始化脚本。
2. API Key 没有应用层加密：目前靠 HTTPS + RLS + Edge Function 代理，后续可加入加密存储或第三方密钥托管。
3. 客户端向量检索有规模上限：几百到低几千切片可接受，万级应切 pgvector/RPC。
4. 切片算法没有 overlap：可能在段落边界丢上下文，后续可加 overlap 或标题路径注入。
5. embedding 存在 `double precision[]`：Postgres 数组能用，但不是向量索引结构；服务端检索演进时应迁移 pgvector。
6. 共享广场仍在登录布局内：如果产品目标是公开分享，需要改路由和 RLS。
7. 管理后台可观测展示还可以更深：已有事件入库和部分统计，后续可加错误 TopN、TTFT P95、检索耗时趋势。
8. 文件解析能力有限：更复杂的 PDF/Word/HTML 解析需要引入服务端解析或专门库。
9. 多轮改写依赖 LLM：已做触发收窄和超时降级，但仍有额外成本。
10. 流式 Markdown 对超长代码块会退化：因为代码块内部没有安全段落边界。

面试遇到“你哪里没做好”时，可以主动说：

> 我最想补的是三点：第一，补齐 documents 建表迁移，保证空库可一键初始化；第二，把 API Key 做应用层加密或密钥托管；第三，当知识库切片超过阈值时切到 pgvector RPC。现在的客户端检索是有意识的阶段性取舍，不是最终大规模架构。

## 24. 2 分钟项目介绍稿

我做的是一个 AI 知识库平台，技术栈是 Vue 3、TypeScript、Element Plus、Pinia、Vue Router 和 Supabase。它的主线是用户创建 Markdown 文档或上传文件后，系统把内容切片并可选生成 embedding，写入知识库；用户提问时，前端从知识库召回相关片段构建 Prompt，再通过 Supabase Edge Function 代理 OpenAI 兼容接口，用 SSE 流式返回答案。

这个项目我重点做了几块：第一是 RAG 检索链路，包含文本切片、向量检索、中文 N-gram 关键词检索和 RRF 融合；第二是性能优化，embedding 会进入 IndexedDB 缓存，检索计算下放 Web Worker，并用 Transferable 传递向量矩阵；第三是流式体验，手写 SSE 解析、支持中断、rAF 合帧、Markdown 增量渲染和 `<think>` 推理过程分流；第四是产品化能力，包括用户登录、AI 配置、文档共享、管理后台、埋点、Web Vitals、错误监控、单测和 Playwright E2E。

如果从架构取舍看，我没有一上来就引入自建后端和向量数据库，而是用 Supabase 快速完成 Auth、RLS、DB、RPC 和 Edge Functions，把复杂度集中在前端可控的 RAG 和流式体验上。这个方案适合小中规模知识库；如果切片规模上万，我会演进成客户端检索和 pgvector 服务端检索按阈值切换的混合架构。

## 25. 一页速记

主链路：

```text
登录 -> 文档/文件 -> 切片 -> embedding -> chunks 入库 -> 检索 -> Prompt -> Edge Function -> SSE -> 落库/溯源
```

最重要的 6 个技术点：

1. 客户端 RAG：切片、embedding、向量 + 关键词检索。
2. RRF 融合：解决两路分数量纲不同。
3. IndexedDB 缓存：基于切片不可变假设做 id diff。
4. Web Worker + Transferable：向量矩阵跨线程零拷贝。
5. 流式体验：手写 SSE、AbortController、rAF、Markdown 增量渲染、think 分流。
6. 工程化：Vitest、Playwright 全 mock、CI、埋点、Web Vitals、错误监控。

最容易被追问的边界：

- 不是数据库级加密保存 API Key。
- 当前不是 pgvector 服务端检索。
- `documents` 建表迁移需要补。
- 客户端检索有规模上限。
- 切片没有 token 精确预算和 overlap。

最稳的回答策略：

> 我知道标准生产架构可以更重，比如 pgvector、KMS、服务端解析队列。但这个项目的目标是用 Supabase 和前端主导快速完成闭环，所以我把复杂度放在客户端 RAG、流式体验和工程化上；同时我也明确了规模边界和演进路线。

## 26. 开发排查手册

这一章适合面试被问“线上出问题你怎么定位”时使用。核心思路是先按链路切层，再用关键文件定位，不要一上来泛泛说看日志。

### 26.1 登录后页面一直跳登录

排查顺序：

1. 看 `.env` 的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 是否存在。
2. 看 [src/utils/supabase.ts](../src/utils/supabase.ts) 的 `assertSupabaseConfigured()` 是否抛错。
3. 看 [src/stores/user.ts](../src/stores/user.ts) 的 `initialize()` 是否正确恢复 session。
4. 看 [src/router/index.ts](../src/router/index.ts) 的 `beforeEach` 是否因为 `isLoggedIn=false` 重定向。
5. 如果只有 admin 页面跳转，看 `userStore.isAdmin` 的 metadata/role 判断。

面试说法：

> 我会先确认这是认证态恢复失败、路由守卫误判，还是权限角色不足。项目里登录态由 user store 统一恢复，路由只消费 store 的 `isLoggedIn/isAdmin`，所以排查点很集中。

### 26.2 AI 问答没有返回

按链路切：

```text
AI 配置完整性
-> 是否创建/选择会话
-> 是否选知识库和问答模式
-> 知识切片是否取到
-> embedding/关键词检索是否异常
-> Edge Function 是否调用成功
-> SSE 是否解析到 delta
-> assistant 消息是否落库
```

关键文件：

- AI 配置：[src/stores/aiConfig.ts](../src/stores/aiConfig.ts)、[src/api/userAiConfig.ts](../src/api/userAiConfig.ts)
- 发送编排：[src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)
- 切片取数：[src/api/chat.ts](../src/api/chat.ts)
- 流式请求：[src/api/ai.ts](../src/api/ai.ts)
- Edge Function：[supabase/functions/ai-chat/index.ts](../supabase/functions/ai-chat/index.ts)

常见原因：

- 个人中心没有配置 `apiKey/baseUrl/model`。
- 知识增强模式下没有选知识库，或知识库没有切片。
- 只做了文件入库但没有生成 embedding，此时向量路为空，关键词路仍应兜底。
- Edge Function 读不到 `user_ai_config`，多半是 Authorization header 或 RLS 问题。
- 上游不是标准 OpenAI SSE 格式，需要看 [src/api/ai.ts](../src/api/ai.ts) 的文本提取兼容逻辑。

### 26.3 知识库问答答非所问

先判断是“召回错了”还是“召回对了但模型没用好”：

- 如果 `sources` 里没有相关片段，问题在检索侧。
- 如果 `sources` 相关但回答乱编，问题在 Prompt 约束或模型能力侧。
- 如果多轮追问失败，看是否触发了问题改写。

排查点：

- [src/utils/chunkText.ts](../src/utils/chunkText.ts)：切片是否把语义切碎。
- [src/utils/retrieveChunks.ts](../src/utils/retrieveChunks.ts)：关键词是否命中。
- [src/utils/similarity.ts](../src/utils/similarity.ts)：向量相似度是否有效。
- [src/utils/fuseRetrieval.ts](../src/utils/fuseRetrieval.ts)：RRF 是否把正确片段排上来。
- [src/utils/rewriteQuestion.ts](../src/utils/rewriteQuestion.ts)：指代追问是否被改写。
- [src/utils/buildQaPrompt.ts](../src/utils/buildQaPrompt.ts)：Prompt 是否要求基于资料回答和引用片段。

面试说法：

> RAG 的问题不能只怪模型。我会先看召回片段，如果召回不对，就调检索和切片；如果召回对但回答不对，再调 Prompt、answer mode 和模型参数。

### 26.4 流式输出卡顿

卡顿分两类：

- 输入/滚动卡：主线程被检索计算、JSON 解析或高频响应式更新占用。
- 回答越长越卡：每帧 Markdown 全文重解析。

项目里的对应优化：

- 检索计算下放 Worker：[src/utils/retrievalWorkerClient.ts](../src/utils/retrievalWorkerClient.ts)
- 向量缓存减少 JSON 解析：[src/utils/embeddingCache.ts](../src/utils/embeddingCache.ts)
- SSE chunk 合帧：[src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)
- Markdown stable/tail 增量渲染：[src/utils/streamingMarkdown.ts](../src/utils/streamingMarkdown.ts)

面试说法：

> 我会先用 Performance 面板看长任务来自检索还是渲染。这个项目把 CPU 检索、网络解析和 Markdown 渲染拆成了不同优化点，所以不是只靠一个防抖解决所有卡顿。

### 26.5 引用角标不显示或点了没反应

排查顺序：

1. 模型回答末尾是否包含约定格式的“参考片段”。
2. [src/utils/parseCitations.ts](../src/utils/parseCitations.ts) 是否解析到有效序号。
3. assistant 消息的 `sources` 是否保存成功。
4. [src/views/chat/components/SourceChunks.vue](../src/views/chat/components/SourceChunks.vue) 是否拿到对应 chunk。
5. 角标序号是否越界，越界会被过滤。

面试说法：

> 引用不是模型天然给的能力，而是“检索 sources -> Prompt 要求引用 -> 回答解析引用 -> UI 定位 sources”的闭环。任何一段断了，引用体验都会断。

## 27. 常见需求改动落点

### 27.1 新增一个页面

改动路径：

1. 在 `src/views/` 下新增页面组件。
2. 在 [src/router/index.ts](../src/router/index.ts) 添加路由，决定是否需要 `requiresAuth/requiresAdmin`。
3. 如果要出现在侧边栏，改 [src/router/menus.ts](../src/router/menus.ts)。
4. 需要接口时先在 `src/api/` 建数据访问函数，不把 Supabase 查询直接散落到页面。
5. 如果有全局状态，再考虑 Pinia；普通页面局部状态优先放组件或 composable。

### 27.2 新增一类埋点

改动路径：

1. 在 [src/constants/analyticsEvents.ts](../src/constants/analyticsEvents.ts) 添加事件名。
2. 在业务动作处调用 [src/utils/tracker.ts](../src/utils/tracker.ts) 的 `track()`。
3. payload 保持小而稳定，不塞大文本、API Key 或隐私内容。
4. 管理后台如果要展示，再扩展 RPC 或 Edge Function 聚合。

原则：

> 埋点失败不应该影响主流程，所以当前 tracker 失败会静默处理。面试时可以说这是体验优先的取舍。

### 27.3 新增一种 AI 写作动作

改动路径：

1. 在 [src/utils/aiAssistantPrompts.ts](../src/utils/aiAssistantPrompts.ts) 添加动作和 Prompt。
2. 在 [src/components/document/AIAssistantPanel.vue](../src/components/document/AIAssistantPanel.vue) 接入按钮/选项。
3. 复用现有 AI 配置读取和 Edge Function 代理。
4. 明确结果是替换、追加，还是插入到光标位置。

### 27.4 给知识库新增 QA 配置项

改动路径：

1. 改类型：[src/types/knowledge.ts](../src/types/knowledge.ts)。
2. 改数据库字段结构或默认 JSON：`supabase/sql/009_knowledge_qa_config.sql`。
3. 改 API 读写：[src/api/knowledge.ts](../src/api/knowledge.ts)。
4. 改聊天配置 UI：[src/views/chat/composables/useChatSession.ts](../src/views/chat/composables/useChatSession.ts)、[src/views/chat/ChatView.vue](../src/views/chat/ChatView.vue)。
5. 改执行逻辑：[src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)。

### 27.5 把客户端检索迁到 pgvector

推荐演进路径：

1. 保留当前客户端检索作为小知识库路径。
2. 新增 Supabase RPC：输入 `knowledge_base_id/query_embedding/top_k`，返回相似 chunks。
3. 当切片数超过阈值时走 RPC，小规模仍走 IndexedDB + Worker。
4. 关键词路可以继续在前端做，也可以在服务端做全文索引。
5. RRF 融合逻辑可复用，只是一路候选来自服务端。

面试说法：

> 我不会把现有方案推翻重做，而是做阈值切换。小库客户端检索减少服务端复杂度，大库 pgvector 保证规模和索引性能。

## 28. 面试症状题速答

### 28.1 “如果用户说回答慢，你怎么优化？”

先拆指标：

- 检索慢：看 chunk 拉取、IndexedDB 命中率、Worker 计算耗时。
- 首 token 慢：看 Edge Function 到上游模型的 TTFT。
- 总时长慢：看模型输出速度和 maxTokens。
- 渲染慢：看 rAF 合帧和 Markdown 增量渲染。

项目证据：

- [src/utils/perfMetrics.ts](../src/utils/perfMetrics.ts) 记录 QA timeline。
- [src/utils/embeddingCache.ts](../src/utils/embeddingCache.ts) 减少重复拉 embedding。
- [src/utils/retrievalWorkerClient.ts](../src/utils/retrievalWorkerClient.ts) 降低主线程阻塞。

### 28.2 “如果模型乱答，你怎么兜底？”

回答结构：

1. 先提升召回质量：混合检索、RRF、多轮改写。
2. 再增强 Prompt 约束：要求基于资料回答、给出引用。
3. 再做模式约束：`strict-knowledge` 下没有高质量片段就提示知识库不足。
4. 最后承认边界：RAG 只能降低幻觉，不能数学上保证模型完全不编。

### 28.3 “为什么不用 LangChain？”

可以这样答：

> 这个项目的目标是展示前端对 RAG 链路的可控能力，所以切片、检索、融合、Prompt 和流式解析都做成了源码级实现。LangChain 能加速原型，但也会把很多关键细节封装掉，比如前端缓存、Worker 检索、流式 Markdown 和引用定位。生产中如果团队已有 LangChain 生态，我会评估复用；但这个项目里手写更利于控制边界和面试讲清楚。

### 28.4 “为什么不用后端统一做所有事情？”

可以这样答：

> 后端统一做会更适合大规模和强安全场景，但这个项目用 Supabase 做 BaaS，目标是快速完成闭环并体现前端深度。客户端检索让小规模知识库少一次服务端向量检索链路，同时能利用 IndexedDB、Worker 和 TypedArray 优化体验。边界我也明确了：大规模、敏感数据、复杂解析任务应该迁到服务端。

### 28.5 “这个项目最能体现你前端能力的是哪里？”

推荐答法：

> 不是页面数量，而是浏览器侧复杂链路处理。比如聊天页同时处理会话状态、知识库配置、RAG 检索、流式网络、停止生成、Markdown 长文本渲染、think 分流、引用溯源和错误状态。我把它拆成 API、utils、composables 和展示组件，并用单测覆盖纯函数、E2E 覆盖关键路径。

### 28.6 “如果让你重构，你第一步做什么？”

稳妥回答：

> 我第一步不会动 UI，而是补齐数据库迁移和数据边界：先补 `documents` 建表迁移，让空库初始化完整；再把 API Key 存储升级为应用层加密或密钥托管；然后给知识库规模设置阈值，超过阈值走 pgvector。因为这些是系统边界问题，收益比继续堆页面更高。

## 29. 代码阅读路线

如果只有 30 分钟看项目，按这个顺序：

1. [README.md](../README.md)：先理解项目定位和亮点。
2. [src/router/index.ts](../src/router/index.ts)：看页面边界和权限模型。
3. [src/main.ts](../src/main.ts)：看启动顺序。
4. [src/views/chat/ChatView.vue](../src/views/chat/ChatView.vue)：看核心页面组合。
5. [src/views/chat/composables/useChatMessages.ts](../src/views/chat/composables/useChatMessages.ts)：看问答主链路。
6. [src/api/chat.ts](../src/api/chat.ts)：看会话、消息、切片取数和缓存接入。
7. [src/utils/chunkText.ts](../src/utils/chunkText.ts)、[src/utils/fuseRetrieval.ts](../src/utils/fuseRetrieval.ts)、[src/utils/retrievalWorkerClient.ts](../src/utils/retrievalWorkerClient.ts)：看 RAG 算法。
8. [src/api/ai.ts](../src/api/ai.ts)：看 SSE 解析。
9. [supabase/functions/ai-chat/index.ts](../supabase/functions/ai-chat/index.ts)：看服务端代理边界。
10. [src/utils/__tests__/](../src/utils/__tests__) 和 [e2e/chat.spec.ts](../e2e/chat.spec.ts)：看测试如何证明核心行为。

如果面试前只有 5 分钟，背这条：

```text
文档/文件 -> 切片 -> embedding -> IndexedDB 缓存 -> Worker 检索 -> RRF 融合 -> Prompt -> Edge Function -> SSE -> rAF/Markdown 增量渲染 -> 引用溯源
```
