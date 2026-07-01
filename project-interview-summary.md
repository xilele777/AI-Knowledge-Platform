# AI-Knowledge-Platform 面试复盘总稿

> **一句话背诵：** 我用 Vue3 和 Supabase 搭了一个 AI 知识平台，核心是把文档或文件切片入库，问答时召回相关片段构建 Prompt，再通过 SSE 流式生成可追溯回答，同时补齐了登录权限、AI 配置、共享、埋点和管理后台。

---

## 目录

- [1. 一句话定位](#1-一句话定位)
- [2. 项目目录结构](#2-项目目录结构)
- [3. 项目整体目标](#3-项目整体目标)
- [4. 项目主线](#4-项目主线)
- [5. 核心业务流程（8 阶段走查）](#5-核心业务流程8-阶段走查)
- [6. 数据模型全景](#6-数据模型全景)
- [7. 功能模块总表](#7-功能模块总表)
- [8. 技术栈一览](#8-技术栈一览)
- [9. 模块调用关系图](#9-模块调用关系图)
- [10. 10 大设计决策（含原因/替代方案/权衡）](#10-10-大设计决策含原因替代方案权衡)
- [11. 技术债与风险清单](#11-技术债与风险清单)
- [12. 如果重来一次](#12-如果重来一次)
- [13. 面试高频深挖问答](#13-面试高频深挖问答)
- [14. STAR 亮点话术（3 个核心亮点）](#14-star-亮点话术3-个核心亮点)
- [15. 一页速记卡](#15-一页速记卡)
- [16. 2 分钟项目介绍逐字稿](#16-2-分钟项目介绍逐字稿)
- [17. 高级工程师视角收尾](#17-高级工程师视角收尾)

---

## 1. 一句话定位

这是一个轻量级 AI 知识平台，围绕 **文档生产、知识沉淀、检索增强问答、内容共享、后台运营** 形成完整闭环。

> **面试回答版：** 我做的不是单纯的 AI 聊天页，而是把内容生产、知识入库、RAG 问答和后台治理串成了一套可落地的平台。

---

## 2. 项目目录结构

面试时如果被问到"代码怎么组织的"，可以快速回答：

```
AI-Knowledge-Platform/
├── src/
│   ├── main.ts                          # 应用入口：bootstrap 顺序编排
│   ├── App.vue                          # 根组件
│   ├── router/
│   │   └── index.ts                     # 路由表 + beforeEach 守卫（三层路由）
│   ├── stores/
│   │   ├── index.ts                     # Pinia 实例
│   │   ├── user.ts                      # 用户登录态、角色、AuthStateChange 监听
│   │   └── aiConfig.ts                  # 用户 AI 配置懒加载、完整度检查
│   ├── api/                             # 数据访问层（前端直连 Supabase）
│   │   ├── auth.ts                      # 注册/登录/登出/Session恢复
│   │   ├── documents.ts                 # 文档 CRUD + addDocumentToKnowledgeBase()
│   │   ├── knowledge.ts                 # 知识库/文件/切片 CRUD + batchInsert
│   │   ├── chat.ts                      # 会话/消息 CRUD + getKnowledgeChunksForQa()
│   │   ├── ai.ts                        # AI 文本生成 + 流式解析 + 多供应商兼容
│   │   ├── userAiConfig.ts             # 用户 AI 配置 upsert/delete
│   │   └── admin.ts                     # 后台统计（Edge Function + RPC fallback）
│   ├── utils/                           # 纯函数工具
│   │   ├── supabase.ts                  # Supabase 客户端初始化
│   │   ├── serverProxy.ts               # Edge Function 调用封装（invoke + fetchStream）
│   │   ├── aiConfig.ts                  # 配置解析/默认值补齐/完整度校验
│   │   ├── chunkText.ts                 # 文本切片算法（段落→句子→硬截断→合并）
│   │   ├── retrieveChunks.ts            # 关键词检索（N-gram + 停用词 + 评分）
│   │   ├── vectorEmbedding.ts           # 向量生成 + 余弦相似度 + TopK
│   │   ├── buildQaPrompt.ts             # Prompt 构建（knowledge-enhanced / general-ai）
│   │   ├── documentDraft.ts             # localStorage 草稿缓存
│   │   ├── aiAssistantPrompts.ts        # AI 写作助手 Prompt 模板
│   │   └── tracker.ts                   # 埋点工具
│   ├── types/                           # TypeScript 类型定义
│   │   ├── ai.ts, chat.ts, document.ts, knowledge.ts
│   ├── views/                           # 页面组件
│   │   ├── docs/                        # 文档列表 + 编辑器 + AI 写作面板
│   │   ├── knowledge/                   # 知识库列表 + 详情 + 文件上传
│   │   ├── chat/                        # 问答页面 + 消息列表 + 输入框 + 引用展示
│   │   ├── admin/                       # 管理后台（用户/文档/文件/聊天/统计）
│   │   ├── shared/                      # 共享广场
│   │   ├── login/ & register/           # 登录/注册
│   │   └── ProfileView.vue             # 个人中心 + AI 配置
│   ├── components/                      # 跨页面复用组件
│   ├── layouts/                         # MainLayout / AdminLayout
│   └── plugins/                         # Element Plus 安装
│
└── supabase/
    ├── sql/                             # 12 个数据库迁移脚本（按编号顺序执行）
    │   ├── 001_knowledge_module.sql     # 知识库/文件/切片表 + RLS
    │   ├── 003_chat_module.sql          # 会话/消息表 + RLS + 触发器
    │   ├── 007_document_knowledge_bridge.sql  # 文档-知识库桥接
    │   ├── 012_user_ai_config.sql       # 用户 AI 配置表
    │   └── ...                          # 分析事件/管理RPC/分享/QA配置等
    └── functions/                       # 3 个 Edge Functions（Deno 运行时）
        ├── _shared/
        │   ├── cors.ts                  # CORS 头 + 响应工具函数
        │   └── aiConfig.ts              # 服务端 AI 配置解析（Deno 侧）
        ├── ai-chat/index.ts             # 聊天代理：转发到 OpenAI 兼容接口
        ├── ai-embeddings/index.ts       # Embedding 代理：转发 + 模型智能选择
        └── admin-analytics/index.ts     # 后台统计聚合
```

分层逻辑：**types → utils → api → stores → views**。上层可以依赖下层，下层不感知上层。`api/` 层是前端直连 Supabase 的唯一入口，`utils/` 是纯函数工具，`stores/` 管理全局状态，`views/` 负责页面渲染。

---

## 3. 项目整体目标

### 3.1 产品目标

这个项目想解决的是：用户写出来、上传进来的内容，不能只是一次性消费，而应该变成后续还能被检索、复用、问答的知识资产。

| # | 目标 | 说明 |
|---|------|------|
| 1 | 持续生产内容 | Markdown 文档、经验总结、资料整理 |
| 2 | 沉淀为知识 | 站内文档 + 站外 `txt/md` 文件 |
| 3 | 加工成 AI 可用结构 | 切片、向量化、知识库组织 |
| 4 | 智能问答 | 基于知识库做 RAG，不让模型脱离上下文瞎答 |
| 5 | 产品化能力 | 认证、共享、后台、埋点和运营分析 |

### 3.2 技术目标

- 用相对轻量的架构快速完成完整业务闭环
- 大量复用 `Supabase` 的 Auth、DB、RLS、RPC、Edge Functions
- 以前端为主做业务编排
- 通过 Edge Function 统一代理 AI 请求
- 在不引入重型基础设施的前提下实现基础可用的 RAG

---

## 4. 项目主线

这项目最值得讲的是这条主线：

```
登录鉴权 → 文档编辑 → 文本切片 → 写入知识库 → 检索相关片段 → 构建 Prompt → AI 流式回答 → 保存消息和引用来源
```

这条链路能同时体现：业务完整度、数据建模能力、AI 集成能力、前后端协作方式、产品化意识。

---

## 5. 核心业务流程（8 阶段走查）

### 阶段 1：应用启动和鉴权

入口：[src/main.ts](src/main.ts)

启动流程是一个 `async bootstrap()` 函数，按严格顺序执行：

```
createApp(App) → app.use(pinia) → userStore.initialize() → app.use(router) → installElementPlus(app) → app.mount('#app')
```

**关键设计：Pinia 和 Router 的初始化顺序不可颠倒。** Pinia 先注册，Store 在 Router 之前完成 `initialize()`，这样路由守卫中通过 `useUserStore(pinia)` 拿到的 Store 一定是已经恢复过登录态的。

**`userStore.initialize()` 做了三件事：**

1. 调用 `getCurrentSession()` 获取当前 Session（Supabase 在 localStorage 中持久化了 refresh token，`getSession()` 会从本地恢复，不会发起网络请求）
2. 如果有 Session，再调用 `getCurrentUser()` 获取用户信息
3. 调用 `bindAuthListener()` 注册 `onAuthStateChange` 监听，当用户在其他标签页登录/登出时，当前页面自动同步状态

**角色解析：** Store 的 `resolveRole()` 通过检查 `user.app_metadata?.role`、`user.user_metadata?.role`、`app_metadata?.is_admin`、`user_metadata?.is_admin` 四个字段来判断用户是否为 admin，优先取 `app_metadata`（服务端设置，不可被客户端篡改）。

**路由守卫** 在 [src/router/index.ts](src/router/index.ts) 中，`beforeEach` 逻辑：

- 如果 Store 尚未初始化，先 `await userStore.initialize()`（防御性编程，理论上 `main.ts` 已经初始化过）
- 未登录且目标路径不在 `['/login', '/register']` 白名单中 → 重定向到 `/login`，并通过 `query.redirect` 保存原始路径
- 已登录但访问 `/login` 或 `/register` → 重定向到 `/dashboard`
- 目标路由的 `meta.requiresAdmin` 为 true 但当前用户不是 admin → 重定向到 `/dashboard`

路由结构分三层：
- 公开路由：`/login`、`/register`（`meta.public: true`）
- 认证路由：`/` 下的业务页面（`meta.requiresAuth: true`），包括文档、知识库、聊天、个人中心、共享广场
- 管理员路由：`/admin` 下的后台页面（`meta.requiresAuth: true, requiresAdmin: true`），包括用户管理、文档管理、文件管理、聊天管理、统计分析

核心文件：
- [src/main.ts](src/main.ts)
- [src/router/index.ts](src/router/index.ts)
- [src/api/auth.ts](src/api/auth.ts) — 封装 `signUp`、`signInWithPassword`、`getUser`、`getSession`、`signOut`、`onAuthStateChange`
- [src/stores/user.ts](src/stores/user.ts) — 管理 `user`、`session`、`role`、`initialized`、`loading` 五个状态

---

### 阶段 2：用户配置 AI

这个功能解决的核心问题是：**平台不承担模型调用成本，用户自带 API Key，系统只做安全代理。**

#### 数据模型

`user_ai_config` 表（[supabase/sql/012_user_ai_config.sql](supabase/sql/012_user_ai_config.sql)）：

```sql
user_ai_config (
  id uuid pk,
  user_id uuid unique → auth.users(id),  -- 一个用户一条配置
  api_base_url text,   -- OpenAI 兼容接口地址
  api_key text,        -- 用户自己的 API Key
  model text,          -- 模型名称
  created_at / updated_at
)
-- RLS: 四个策略全部限定 auth.uid() = user_id
```

#### 前端三层

**API 层** — [src/api/userAiConfig.ts](src/api/userAiConfig.ts)：
- `getUserAiConfig()` — `select * from user_ai_config where user_id = $uid`，用 `maybeSingle()` 返回单条或 null
- `saveUserAiConfig()` — `upsert` + `onConflict: 'user_id'`，一条语句覆盖插入和更新
- `deleteUserAiConfig()` — 按 `user_id` 删除

**Store 层** — [src/stores/aiConfig.ts](src/stores/aiConfig.ts)：
- `loadConfig()` 带防并发机制：用 `loadingPromise` 复用，多个组件同时调用只发一次请求
- `ensureConfig()` 是懒加载入口：未初始化则先 `loadConfig()`，然后返回 `resolvedConfig`
- `resolvedConfig`（computed）调用 `resolveAiConfigFromUserConfig()` 补齐默认值
- `isComplete` / `missingFields` 判断配置完整性：只检查 `baseUrl` 和 `apiKey` 是否非空，model 有默认值 `gpt-4o-mini`

**配置解析** — [src/utils/aiConfig.ts](src/utils/aiConfig.ts)：
- `resolveAiConfigFromUserConfig()` — 自动去尾部斜杠，空字段补默认值（`baseUrl` → `https://api.openai.com/v1`，`model` → `gpt-4o-mini`）
- `isAiConfigComplete()` — 只校验 `baseUrl` 和 `apiKey`，model 有默认值不强制

**配置页面** — [src/views/ProfileView.vue](src/views/ProfileView.vue)：
- 三个输入框：API Base URL、API Key（密码框 + 可切换明文）、Model
- 保存后通过 `aiConfigStore.setConfig()` 同步 Store
- 顶部 Tag 实时显示"已配置/未配置"状态

#### 服务端消费

Edge Function 在发起模型请求时，通过 [supabase/functions/_shared/aiConfig.ts](supabase/functions/_shared/aiConfig.ts) 中的 `resolveUserAiConfig(authHeader)` 函数：

1. 用前端传来的 `Authorization` header 初始化 Supabase 客户端
2. `client.auth.getUser()` 解析出当前用户
3. 查 `user_ai_config` 表取 `{ api_base_url, api_key, model }`
4. 补默认值，如果 `api_key` 为空直接抛错 `"请先在个人中心配置您的 AI API Key"`

---

### 阶段 3：用户生产内容

文档编辑是内容生产的主入口，页面 [src/views/docs/DocEditorView.vue](src/views/docs/DocEditorView.vue)，API 层 [src/api/documents.ts](src/api/documents.ts)。

#### 文档 CRUD

`documents` 表核心字段：`id`、`owner_id`、`title`、`content_md`、`summary`、`status`（`draft` / `published` / `archived`）、`is_shared`、`shared_at`。

所有 API 都通过 `requireUserId()` 获取当前用户，然后带 `eq('owner_id', userId)` 条件操作，双重保障（RLS + 业务层校验）。

- `createDocument()` — 默认 status 为 `draft`，`is_shared` 为 false
- `updateDocument()` — 支持部分更新，切换 `isShared` 时自动设置/清空 `shared_at` 时间戳
- `getMyDocuments()` — 支持 `searchTitle` 模糊搜索（`ilike`）、分页（`range`）
- `getDocumentById()` — 双条件 `eq('id', id).eq('owner_id', userId)`
- `deleteDocument()` — 同样双条件校验

#### 草稿保护

[src/utils/documentDraft.ts](src/utils/documentDraft.ts) 基于 `localStorage` 实现：

- Key 格式：`doc_draft_v1:{documentId}`，带版本号前缀方便后续迁移
- `writeDocumentDraft(id, title, content)` — 写入 `{ title, content, savedAt: Date.now() }`
- `readDocumentDraft(id)` — 读取并校验结构完整性，任一字段缺失都返回 null
- `clearDocumentDraft(id)` — 保存成功后清除

#### AI 写作助手

[src/components/document/AIAssistantPanel.vue](src/components/document/AIAssistantPanel.vue) 嵌入在文档编辑器中，支持润色、扩写、总结、续写四种操作。Prompt 模板在 [src/utils/aiAssistantPrompts.ts](src/utils/aiAssistantPrompts.ts)，实际调用走 `generateAiTextStream()` 流式输出，边生成边展示。

#### 文档分享

`getSharedDocuments()` 和 `getSharedDocumentById()` 查询条件为 `eq('is_shared', true)`，不需要登录即可访问（在共享广场路由中）。

---

### 阶段 4：内容沉淀进知识库

内容入库有两条入口，最终都汇聚到同一套切片存储流程。

#### 入口 A：文档加入知识库

主逻辑位于 `addDocumentToKnowledgeBase()`（[src/api/documents.ts](src/api/documents.ts) 第 347-489 行），完整步骤：

1. **校验归属权** — 分别查 `documents` 和 `knowledge_bases` 表，两条都带 `eq('owner_id', userId)`，任何一条查不到就返回错误
2. **读取文档内容** — 取 `documentData.content_md`
3. **切片** — 调用 `chunkText(content, { minLength: 300, maxLength: 500 })`。切片算法分四步：
   - 先按双换行拆段落
   - 超长段落按标点符号（`。！？!?；;.`）拆句子
   - 仍超长的句子硬截断（`maxLength` 字符一刀切）
   - 短片段向前合并，保证每个片段 ≥ `minLength` 且 ≤ `maxLength`
4. **upsert 桥接关系** — 写入 `knowledge_documents` 表（桥接表），`onConflict: 'knowledge_base_id,document_id'`，记录 `title_snapshot`、`last_chunk_count`、`last_synced_at`
5. **删除旧切片** — 按 `knowledge_base_id + document_id + owner_id` 三条件删除
6. **批量写入新切片** — 调用 `batchInsertKnowledgeChunks()`，每个切片带 `chunk_index`、`content`、`token_count`、`meta`（含 `sourceType: 'document'`、`documentId`、`documentTitle`）
7. **生成 Embedding** — 如果调用方传入了 `aiConfig`，`batchInsertKnowledgeChunks` 内部会调用 `createBatchEmbeddings()` 为每个切片生成向量，然后写入 `embedding` 字段（`double precision[]` 类型）
8. **更新桥接表** — 再次更新 `knowledge_documents` 的 `last_chunk_count` 和 `last_synced_at`

迁移文件：[supabase/sql/007_document_knowledge_bridge.sql](supabase/sql/007_document_knowledge_bridge.sql) — 定义了 `knowledge_documents` 桥接表，以及 `knowledge_chunks` 表新增 `document_id`、`source_type` 字段。

#### 入口 B：上传文件进入知识库

主逻辑在 [src/components/knowledge/FileUpload.vue](src/components/knowledge/FileUpload.vue) + [src/api/knowledge.ts](src/api/knowledge.ts)：

1. **上传文件** — 用户选择本地 `txt/md` 文件
2. **前端读取文本** — 使用 `FileReader` 读取文件内容
3. **切片** — 同样调用 `chunkText()`
4. **创建文件记录** — 调用 `createKnowledgeFile()` 写入 `knowledge_files` 表，状态为 `pending`。这里有一个 schema 兼容逻辑：`createKnowledgeFile` 会尝试 4 种不同的 insert payload（是否包含 `storage_path` / `file_path`，是否包含 `file_type`），以适应不同迁移版本的表结构
5. **更新状态为 `processing`** — 调用 `updateKnowledgeFileStatus()`
6. **分批写入切片** — 调用 `batchInsertKnowledgeChunks()`，`sourceType` 为 `'file'`
7. **生成 Embedding** — 同上，如果 AI 配置完整则生成
8. **更新状态为 `done` 或 `failed`**

#### 切片算法详解

[src/utils/chunkText.ts](src/utils/chunkText.ts) 的实现：

1. `normalizeText()` — 统一换行符（`\r\n` → `\n`），去除空字符，trim
2. `splitParagraphs()` — 按 `\n{2,}`（双换行）拆段落，若无段落则按单换行拆
3. 对每个段落，若长度 ≤ `maxLength`（默认 500），直接放入 bucket
4. 超长段落 → `splitSentenceByPunctuation()` 按标点拆句 → 仍超长则 `hardSplit()` 按 `maxLength` 硬截断
5. 合并阶段：遍历 bucket，将相邻片段用 `\n` 连接，若合并后 ≤ `maxLength` 则合并；否则当前片段独立成块
6. 后处理：如果某个片段 < `minLength`（默认 300），尝试与下一个片段合并
7. 最终输出 `TextChunk[]`，每个包含 `{ index, content, length }`

#### 知识库表结构

核心表关系（[supabase/sql/001_knowledge_module.sql](supabase/sql/001_knowledge_module.sql)）：

```
knowledge_bases 1──N knowledge_chunks
                1──N knowledge_files 1──N knowledge_chunks
                1──N knowledge_documents (桥接 documents)
```

- `knowledge_chunks.embedding` 字段类型为 `double precision[]`，存储向量数组，不是专业向量引擎
- 所有表都开启 RLS，`knowledge_chunks` 的 insert 策略额外校验：`knowledge_base_id` 归属当前用户，且 `file_id`（如果有）也归属当前用户

---

### 阶段 5：用户发起知识问答

主页面：[src/views/chat/ChatView.vue](src/views/chat/ChatView.vue)，约 1130 行，是整个项目最复杂的前端页面。完整链路如下：

#### 页面初始化 (`bootstrap`)

1. 并行加载三件事：`loadKnowledgeBases()` + `loadChats()` + `aiConfigStore.loadConfig()`
2. 从 URL query 中读取 `knowledgeBaseId`，如果有则选中对应知识库
3. 如果没有 URL 参数但有知识库列表，默认选中第一个
4. 加载当前选中会话的历史消息
5. 从历史消息中找到最后一条用户消息，记录为 `lastQuestion`（用于重新生成）

#### 发送消息 (`handleSend`)

```typescript
async handleSend(question: string) {
  // 1. 防并发：sending 锁
  // 2. 确保有活跃会话：如果没有就 createChat()，标题取问题前 30 字
  // 3. 先创建本地占位消息（id = 'pending-xxx'），立即渲染到 UI
  // 4. 调用 createChatMessage() 保存用户消息到数据库，成功后替换本地消息的 id
  // 5. 记录 lastQuestion / lastQuestionChatId（用于重新生成）
  // 6. 调用 callAssistantAnswer() 核心流程
}
```

#### 核心问答流程 (`callAssistantAnswer`)

1. **`prepareSmartQa()`** — 检索 + 策略选择 + Prompt 构建（详见阶段 6）
2. **创建本地 AI 占位消息** — `buildLocalPendingMessage({ role: 'assistant', status: 'streaming' })`，预填 `sources` 和 `answerMode`，content 为空
3. **检查 AI 配置完整性** — `aiConfigStore.ensureConfig()` + `isComplete` + `missingFields`
4. **调用 `generateAiTextStream()`** — 传入 `{ userPrompt: prepared.prompt }`，`onChunk` 回调中累加 `finalText` 并通过 `updateMessageById()` 实时更新 UI
5. **流式结束后** — 更新本地消息的 `status` 和 `errorMessage`
6. **`persistAssistantFinal()`** — 将最终结果保存到 `chat_messages` 表（含 `sources`、`answer_mode`、`status`、`error_message`），成功后替换本地消息 id
7. **更新会话列表排序** — 调用 `prependOrUpdateChat()` 将当前会话置顶
8. **埋点** — `track(ANALYTICS_EVENTS.QA_SEND, { ... })` 记录问答行为

#### 重新生成 (`handleRegenerate`)

与发送流程基本相同，但复用 `lastQuestion` 和 `lastQuestionChatId`，不重新创建用户消息。

#### 知识库问答配置

每个知识库可以独立配置 QA 行为（`knowledge_bases.qa_config` jsonb 字段），支持：
- `systemPrompt` — 自定义系统指令
- `answerStyle` — 回答风格描述
- `useKnowledgeEnhanced` — 是否启用知识增强
- `aiProvider` / `customAi` — 未来扩展：知识库级 AI 供应商覆盖

配置通过 `updateKnowledgeBaseQaConfig()` 保存，`normalizeKnowledgeQaConfig()` 统一处理默认值和类型安全。

---

### 阶段 6：检索与 Prompt 构建

这是整个 RAG 链路的核心，入口函数是 `prepareSmartQa()`（[ChatView.vue](src/views/chat/ChatView.vue) 第 225-320 行）。

#### 6.1 拉取知识切片

`getKnowledgeChunksForQa(knowledgeBaseId, 500)` — 从 `knowledge_chunks` 表拉取最多 500 条切片，同时通过 `Promise.all` 并行查询 `knowledge_files`（取文件名）和 `documents`（取文档标题），构建 `sourceName` 映射。

#### 6.2 关键词检索

[src/utils/retrieveChunks.ts](src/utils/retrieveChunks.ts) — `retrieveRelevantChunks(question, chunks, options)`

**分词策略（`tokenize`）：**
- 拉取所有英文/数字连续 2+ 字符片段
- 拉取所有中文连续 2+ 字符词
- 中文 N-gram（2-gram 到 4-gram）：对纯中文字符串做滑动窗口
- 过滤停用词：中文 30 个（的、了、和、是、我们、如何、什么 等），英文 18 个（the、a、an、is、how、what 等）

**评分策略（`scoreChunk`）：**
- `keywordScore` = `(命中关键词数 / 问题关键词总数) × keywordBoost`（默认 0.75）
- `exactMatchScore` = 问题长度 ≥ 6 且片段包含完整问题 → `exactQuestionBoost`（默认 0.25）
- `densityScore` = `命中数 × 1/sqrt(片段长度)`，惩罚长片段稀释命中密度
- 总分 = `keywordScore + exactMatchScore + densityScore`

**TopK 逻辑：** `clampTopK(K)` 将 K 限制在 [3, 5]，`minScore` 默认 0.02，先过滤再排序，排序优先级：`score → hitCount → 内容长度`（越短越靠前）。

**价值判断（`hasValuableRetrievedChunks`）：** 用于判断检索结果是否值得注入模型：
- 最高分 ≥ 0.1
- 最高命中数 ≥ 2
- 平均分 ≥ 0.06

#### 6.3 向量检索

[src/utils/vectorEmbedding.ts](src/utils/vectorEmbedding.ts)

**生成 Embedding：** `createEmbedding(text, config)` → 调用 `invokeEdgeFunction('ai-embeddings', { input })` → 走 Edge Function 代理到 OpenAI 兼容 Embedding 接口 → `normalizeEmbeddingResponse()` 按 index 排序后截取前 N 个。

**余弦相似度：** `cosineSimilarity(vecA, vecB)` 纯前端计算：
```
dotProduct / (sqrt(normA) * sqrt(normB))
```
维度不一致直接抛错，任一方范数为 0 则返回 0。

**TopK 相似度检索：** `findTopSimilarChunks(queryEmbedding, chunks, topK=5, minSimilarity=0.0)` — 在内存中遍历所有切片计算相似度，过滤 → 排序 → 取 TopK。

#### 6.4 智能策略选择

`prepareSmartQa()` 的核心逻辑：

```
if (启用知识增强 && 有知识库ID) {
  拉取切片 → 筛选有 embedding 的切片
    if (有 embedding 切片 && AI 配置完整) {
      尝试向量检索:
        createEmbedding(问题) → findTopSimilarChunks()
        → 成功 → retrievalStrategy = 'vector'
        → 失败 → 日志 warn，回退到关键词检索
    }
    if (不是向量检索 || 向量结果不够好) {
      执行关键词检索:
        retrieveRelevantChunks(问题, 所有切片)
        → retrievalStrategy = 有结果 ? 'keyword' : 'none'
    }
}

判断检索结果价值:
  if (向量检索) → hasValuableVectorChunks: topScore>=0.2 && avgScore>=0.12
  if (关键词检索) → hasValuableRetrievedChunks: topScore>=0.1 && hitCount>=2 && avgScore>=0.06

决定最终模式:
  if (启用知识增强 && 有可用的检索结果) → mode = 'knowledge-enhanced'
  else → mode = 'general-ai'
```

关键设计：**向量检索失败时不会阻塞整个问答流程，而是静默回退到关键词检索；关键词结果也差时，直接走纯 AI 模式。**

#### 6.5 Prompt 构建

[src/utils/buildQaPrompt.ts](src/utils/buildQaPrompt.ts)

**`buildKnowledgeEnhancedPrompt(question, chunks, options)`：**
```
【系统指令】默认: "你是智能问答助手。请优先结合给定参考资料回答用户问题..."
【回答风格要求】默认: "先给出结论，再给关键依据；必要时使用 1-4 条要点..."
【用户问题】{question}
【参考资料】
  【片段 1】ID: xxx / 来源: 文档 / xxx / 相关度: 0.85 / 命中关键词: xxx
  {内容（最大 1200 字符，超出截断加...）}
  【片段 2】...
【输出要求】1. 优先使用参考资料... 2. 参考资料不足时可补充... 3. 末尾补充参考片段
```

**`buildGeneralAiPrompt(question, options)`：**
```
【系统指令】默认: "你是智能问答助手。当前没有可用参考资料，请直接基于通用知识..."
【回答风格要求】默认: "优先给出可执行结论，再补充原因或步骤..."
【用户问题】{question}
【输出要求】1. 直接回答问题... 2. 若信息不足，先给常见假设...
```

每个片段格式化时包含：`sourceType`（文档/文件）、`sourceName`、`score`（可选）、`matchedKeywords`（最多 8 个）。

---

### 阶段 7：AI 请求与流式输出

#### 7.1 请求代理架构

```
浏览器 ──fetch──> Supabase Edge Function (ai-chat)
                        │
                        ├─ resolveUserAiConfig(authHeader) → 读 user_ai_config 表
                        ├─ fetch(config.baseUrl + '/chat/completions')
                        │     headers: Authorization: Bearer {config.apiKey}
                        │     body: { model, messages, stream: true, ... }
                        └─ 透传响应流
```

**为什么不直连？** 浏览器直连会暴露 API Key；Edge Function 作为代理，Key 只在服务端使用，前端只传 Supabase JWT。

#### 7.2 Edge Function 实现

[supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts)：
- 接收 `{ params: { systemPrompt, userPrompt, ... }, stream: boolean }`
- 从 `authHeader` 解析用户 → 查 `user_ai_config` 获取 `{ baseUrl, apiKey, model }`
- 调用 `fetch(config.baseUrl + '/chat/completions')`，透传 `temperature`、`max_tokens`、`top_p` 等参数
- 如果是流式请求，直接透传 `upstream.body`，设置 `Content-Type: text/event-stream`
- 如果是非流式，`upstream.json()` 后返回 JSON

#### 7.3 前端流式解析

[src/api/ai.ts](src/api/ai.ts) 中的 `generateAiTextStream()` 和 `readStreamResponse()`：

1. **获取流式 Response** — `fetchEdgeFunctionStream('ai-chat', { params, stream: true })` 走 `fetch()` 而非 `supabase.functions.invoke()`，因为后者不支持流式读取
2. **`readStreamResponse()`**：`response.body.getReader()` → `ReadableStream`
3. **Buffer 拼接**：`decoder.decode(value, { stream: true })` 追加到 buffer，按 `\r?\n\r?\n` 分割事件块，最后一块留在 buffer 中等待下一次 `reader.read()`
4. **SSE 事件解析**：`parseSseDataLines()` 提取 `data:` 开头的行，过滤 `[DONE]`
5. **Delta 文本提取**：`extractStreamDeltaText()` 按优先级尝试 `delta.content` → `message.content` → `text`
6. **多供应商兼容**：`extractTextFromUnknownContent()` 支持 `string`、`string[]`、`{ text }`、`{ content }`、`{ delta: { text } }` 等多种格式；`extractFirstDeepText()` 深度遍历 JSON 树，按 `content → text → output_text → answer → response → message → result` 优先级查找文本
7. **回调通知**：每解析到一个 delta 文本块，调用 `onChunk(content)` 通知页面更新 UI
8. **返回元数据**：`{ id, model, finishReason }`

#### 7.4 Embedding 代理

[supabase/functions/ai-embeddings/index.ts](supabase/functions/ai-embeddings/index.ts) 结构类似，调用 `config.baseUrl + '/embeddings'`，默认模型为 `text-embedding-3-small`。`resolveEmbeddingModel()` 会智能判断：如果用户配置的 model 名称包含 "embedding"，则直接使用，否则用默认模型。

---

### 阶段 8：结果落库与后台运营

#### 8.1 消息持久化

`chat_messages` 表（[supabase/sql/003_chat_module.sql](supabase/sql/003_chat_module.sql)）核心字段：

```sql
chat_messages (
  id uuid pk,
  chat_id uuid → chats(id) cascade,
  owner_id uuid → auth.users(id) cascade,
  role text check (user | assistant | system),
  content text,
  sources jsonb default '[]',       -- 引用来源
  answer_mode text,                  -- general-ai | knowledge-enhanced | strict-knowledge
  status text default 'done',        -- streaming | done | error
  error_message text,                -- 错误信息
  created_at timestamptz
)
```

**保存策略：用户消息先落库，AI 消息流式结束后再落库。** 原因：
- 用户消息是确定性事件，可以立即持久化
- AI 消息需要流式接收、本地拼接，中间状态不宜频繁写库
- 断流风险：如果最终落库失败，存在"前端看到了但数据库没有"的窗口。更稳健的方案是先插入一条 `status='streaming'` 的空消息，逐步更新，但当前实现选择了更简单的"先本地渲染、最后落库"

**Schema 兼容：** `createChatMessage()` 和 `getChatMessages()` 在遇到 `sources`/`answer_mode`/`status`/`error_message` 列不存在时，自动降级为基础字段（只写 `chat_id, owner_id, role, content`），前端补默认值。

**触发器：** `touch_chat_updated_at()` 在 `chat_messages` insert 后自动更新 `chats.updated_at`，保证会话列表按最后活跃时间排序。

#### 8.2 后台运营

后台管理页面在 [src/views/admin/](src/views/admin/) 目录下，通过 [src/api/admin.ts](src/api/admin.ts) 访问数据。

统计数据获取：优先走 Edge Function `admin-analytics`（[supabase/functions/admin-analytics/index.ts](supabase/functions/admin-analytics/index.ts)），失败时 fallback 到 Supabase RPC 存储过程。

统计页面 [src/views/admin/AdminAnalyticsView.vue](src/views/admin/AdminAnalyticsView.vue) 使用 ECharts 展示用户、文档、文件、聊天等多维度数据。

#### 8.3 埋点

[src/utils/tracker.ts](src/utils/tracker.ts) 提供 `track(event, data)` 方法，关键行为（如问答发送）在业务成功后异步调用，失败只 `console.warn`，不阻塞主流程也不抛异常。

---

## 6. 数据模型全景

面试中"数据库怎么设计的"是必问题。以下是 8 张核心表的关系和设计意图。

### 6.1 ER 关系

```
auth.users (Supabase 内置)
  │
  ├── 1:1 ── user_ai_config          用户 AI 配置（API Key 等）
  │
  ├── 1:N ── documents               用户创作的文档
  │
  ├── 1:N ── knowledge_bases         用户创建的知识库
  │             │
  │             ├── 1:N ── knowledge_files         上传的文件（txt/md）
  │             │             │
  │             │             └── 1:N ── knowledge_chunks    文件切片 + Embedding
  │             │
  │             ├── N:M ── knowledge_documents     文档-知识库桥接表
  │             │             │
  │             │             └── (document_id → documents.id)
  │             │
  │             └── 1:N ── knowledge_chunks (document_id)   文档切片 + Embedding
  │
  └── 1:N ── chats                  聊天会话
                │
                └── 1:N ── chat_messages          聊天消息（含 sources/answer_mode/status）
```

### 6.2 每张表的设计意图

| 表名 | 定位 | 关键设计 |
|------|------|----------|
| `user_ai_config` | 用户 AI 配置 | `user_id` 唯一约束，一个用户一条；RLS 四策略全隔离；前端 upsert 一条语句覆盖插入/更新 |
| `documents` | 内容资产 | `status` 三态（draft/published/archived）；`is_shared` 控制公开可见；既是编辑器产物，也是知识库数据源 |
| `knowledge_bases` | 知识集合 | `qa_config` jsonb 存问答配置（system_prompt/answer_style/use_knowledge_enhanced）；一个知识库聚合文档和文件两种来源 |
| `knowledge_files` | 外部资料 | `status` 追踪处理进度（pending→processing→done/failed）；`file_path`/`storage_path` 兼容新旧 schema |
| `knowledge_documents` | 文档-知识库桥接 | 存 `title_snapshot`（加入时的文档标题快照）、`last_chunk_count`、`last_synced_at`；`(knowledge_base_id, document_id)` 联合唯一 |
| `knowledge_chunks` | 知识片段 | 核心表：`content` 存切片文本，`embedding` 存 `double precision[]` 向量；`chunk_index` 保持原始顺序；同时挂 `file_id` 和 `document_id`；`source_type` 区分来源 |
| `chats` | 聊天会话 | 关联 `knowledge_base_id`；`title` 取首条问题前 30 字；`updated_at` 由 `chat_messages` insert 触发器自动更新 |
| `chat_messages` | 消息记录 | `role` 三态（user/assistant/system）；`sources` jsonb 存引用快照；`answer_mode` 区分 knowledge-enhanced/general-ai；`status` 追踪 streaming/done/error；`error_message` 记录异常 |

### 6.3 为什么不用外键关联切片和消息

`chat_messages.sources` 存的是 jsonb 快照而非外键。原因：切片内容可能被后续同步更新或删除，如果外键关联，历史消息里的引用来源就会悬空或丢失。jsonb 快照保证了"这条回答当时依据了什么"的完整追溯性。

---

## 7. 功能模块总表

| 模块 | 用途 | 核心文件 | 可讲亮点 |
|------|------|----------|----------|
| 应用启动 | 初始化 Vue 应用、恢复登录态 | [src/main.ts](src/main.ts) | 先恢复用户会话，再启动路由，避免刷新误跳登录 |
| 路由与权限 | 访问控制 | [src/router/index.ts](src/router/index.ts) | 路由守卫做体验层拦截，真实安全靠 RLS |
| 用户认证 | 注册/登录/登出/恢复 Session | [src/api/auth.ts](src/api/auth.ts)、[src/stores/user.ts](src/stores/user.ts) | Supabase Auth + Pinia 统一登录态管理 |
| 文档列表与编辑 | 文档 CRUD、Markdown 编辑 | [src/views/docs](src/views/docs)、[src/api/documents.ts](src/api/documents.ts) | 文档既是内容资产，也是知识库数据源 |
| AI 写作助手 | 润色、扩写、总结、续写 | [src/components/document/AIAssistantPanel.vue](src/components/document/AIAssistantPanel.vue) | AI 嵌进生产流程，不是独立聊天 |
| 草稿缓存 | 避免丢稿 | [src/utils/documentDraft.ts](src/utils/documentDraft.ts) | localStorage 轻量保障编辑体验 |
| 知识库 | 组织内容、QA 配置 | [src/api/knowledge.ts](src/api/knowledge.ts)、[src/views/knowledge](src/views/knowledge) | 把文件/文档统一沉淀成知识集合 |
| 文件上传 | 外部资料入库 | [src/components/knowledge/FileUpload.vue](src/components/knowledge/FileUpload.vue) | 支持站外文本资料转知识切片 |
| 文本切片 | 长文本拆片 | [src/utils/chunkText.ts](src/utils/chunkText.ts) | 为 RAG 预处理准备数据 |
| 问答链路 | 检索、Prompt、流式回答 | [src/views/chat/ChatView.vue](src/views/chat/ChatView.vue) | 会话、检索、流式、引用、落库闭环 |
| 来源引用 | 回答依据展示 | [src/views/chat/components/SourceChunks.vue](src/views/chat/components/SourceChunks.vue) | 让 AI 回答可追溯 |
| 共享广场 | 文档公开浏览 | [src/views/shared](src/views/shared) | 轻量内容社区能力 |
| 管理后台 | 用户/文档/文件/聊天/统计 | [src/views/admin](src/views/admin)、[src/api/admin.ts](src/api/admin.ts) | 体现平台治理和运营能力 |
| 埋点 | 关键行为统计 | [src/utils/tracker.ts](src/utils/tracker.ts) | 数据支持后续分析优化 |

---

## 8. 技术栈一览

| 分类 | 技术 | 用途 | 关键位置 |
|------|------|------|----------|
| 前端框架 | Vue 3 | 主框架 | [src/main.ts](src/main.ts) |
| 类型系统 | TypeScript | 类型约束、业务建模 | [src/types](src/types) |
| 构建工具 | Vite | 开发和构建 | [vite.config.ts](vite.config.ts) |
| 路由 | Vue Router | 路由与鉴权 | [src/router/index.ts](src/router/index.ts) |
| 状态管理 | Pinia | 全局状态 | [src/stores](src/stores) |
| UI 库 | Element Plus | 组件库 | [src/plugins/element-plus.ts](src/plugins/element-plus.ts) |
| 编辑器 | md-editor-v3 | Markdown 编辑 | [src/views/docs/DocEditorView.vue](src/views/docs/DocEditorView.vue) |
| 认证 | Supabase Auth | 用户认证 | [src/api/auth.ts](src/api/auth.ts) |
| 数据库 | Supabase Postgres | 主数据存储 | [supabase/sql](supabase/sql) |
| 权限 | Supabase RLS | 数据权限隔离 | 各 SQL 迁移文件 |
| 服务端 | Supabase Edge Functions | AI/Embedding/统计代理 | [supabase/functions](supabase/functions) |
| 存储过程 | Supabase RPC | 后台统计 | [src/api/admin.ts](src/api/admin.ts) |
| AI 接口 | OpenAI 兼容 API | 聊天和 Embedding | [src/api/ai.ts](src/api/ai.ts) |
| 流式协议 | SSE | 流式回答 | [src/api/ai.ts](src/api/ai.ts) |
| 图表 | ECharts / vue-echarts | 后台图表 | [src/views/admin/AdminAnalyticsView.vue](src/views/admin/AdminAnalyticsView.vue) |
| 缓存 | localStorage | 文档草稿缓存 | [src/utils/documentDraft.ts](src/utils/documentDraft.ts) |

> **一句话技术主线：** 前端用 `Vue3 + TS + Pinia + Router` 承接业务编排，后端能力大量依赖 `Supabase`，AI 通过 `OpenAI 兼容接口 + Edge Functions + SSE + RAG` 实现。

---

## 9. 模块调用关系图

以下按一次完整问答请求的时序，展示各模块如何协作：

### 9.1 启动阶段

```
main.ts
  ├─ createApp(App)
  ├─ app.use(pinia)  → 注册所有 Store 模块
  ├─ userStore.initialize()
  │     ├─ getCurrentSession()  → supabase.auth.getSession()  [本地恢复，无网络]
  │     ├─ getCurrentUser()     → supabase.auth.getUser()     [网络请求]
  │     └─ bindAuthListener()   → onAuthStateChange()         [注册跨标签页同步]
  ├─ app.use(router)
  │     └─ beforeEach 守卫
  │           ├─ 未登录 + 非公开页 → 重定向 /login
  │           ├─ 已登录 + 公开页   → 重定向 /dashboard
  │           └─ 非 admin + /admin  → 重定向 /dashboard
  └─ app.mount('#app')
```

### 9.2 文档编辑与入库

```
DocEditorView.vue
  ├─ 编辑时: writeDocumentDraft() → localStorage
  ├─ 保存时: updateDocument() → supabase.from('documents').update()
  │                               └─ RLS 校验: auth.uid() = owner_id
  ├─ 分享时: updateDocument({ isShared: true }) → shared_at 自动设时间戳
  └─ 加入知识库: addDocumentToKnowledgeBase()
        ├─ 校验: documents.owner_id + knowledge_bases.owner_id
        ├─ chunkText(content, { minLength: 300, maxLength: 500 })
        │     ├─ normalizeText → splitParagraphs → splitSentence → hardSplit → merge
        │     └─ 返回 TextChunk[]: { index, content, length }
        ├─ upsert knowledge_documents (桥接表)
        ├─ delete old knowledge_chunks
        ├─ batchInsertKnowledgeChunks()
        │     ├─ 写入 knowledge_chunks 表
        │     └─ (可选) createBatchEmbeddings() → invokeEdgeFunction('ai-embeddings')
        └─ update knowledge_documents.last_synced_at
```

### 9.3 文件上传入库

```
FileUpload.vue
  ├─ 用户选择文件 → FileReader.readAsText()
  ├─ chunkText(content)  [同上]
  ├─ createKnowledgeFile()
  │     └─ 4 种 payload 重试: storage_path/file_path × file_type 组合
  ├─ updateKnowledgeFileStatus('processing')
  ├─ batchInsertKnowledgeChunks()  [同上]
  └─ updateKnowledgeFileStatus('done' | 'failed')
```

### 9.4 问答核心链路（一次完整请求）

```
ChatView.vue  handleSend(question)
  │
  ├─ ensureActiveChat(question)
  │     └─ createChat({ knowledgeBaseId, title: question.slice(0, 30) })
  │
  ├─ createChatMessage({ role: 'user', content: question })  ← 用户消息立即落库
  │
  └─ callAssistantAnswer({ chatId, question, qaConfig })
        │
        ├─ prepareSmartQa(question, knowledgeBaseId, qaConfig)
        │     │
        │     ├─ getKnowledgeChunksForQa(knowledgeBaseId, 500)
        │     │     ├─ supabase.from('knowledge_chunks').select('*')
        │     │     └─ Promise.all → 并行查 knowledge_files.file_name + documents.title
        │     │
        │     ├─ 向量检索分支 (if 有 embedding 且 AI 配置完整):
        │     │     ├─ aiConfigStore.ensureConfig()
        │     │     ├─ createEmbedding(question, config)
        │     │     │     └─ invokeEdgeFunction('ai-embeddings', { input })
        │     │     │           └─ Edge Function → fetch(config.baseUrl + '/embeddings')
        │     │     └─ findTopSimilarChunks(embedding, chunks, topK=5, minSimilarity=0.1)
        │     │           └─ 内存遍历: cosineSimilarity() 逐个计算
        │     │
        │     ├─ 关键词检索分支 (if 向量不可用 或 结果不理想):
        │     │     └─ retrieveRelevantChunks(question, chunks, { topK: 5, minScore: 0.03 })
        │     │           ├─ tokenize(question) → 中文Ngram + 英文词 + 停用词过滤
        │     │           ├─ scoreChunk() → keywordScore + exactMatchScore + densityScore
        │     │           └─ 排序 → 取 TopK (3-5)
        │     │
        │     ├─ 质量判断:
        │     │     ├─ hasValuableVectorChunks: topScore>=0.2 && avgScore>=0.12
        │     │     └─ hasValuableRetrievedChunks: topScore>=0.1 && hitCount>=2 && avgScore>=0.06
        │     │
        │     └─ 构建 Prompt:
        │           ├─ mode='knowledge-enhanced' → buildKnowledgeEnhancedPrompt()
        │           └─ mode='general-ai'        → buildGeneralAiPrompt()
        │
        ├─ 创建本地 AI 占位消息 (status='streaming', sources 预填)
        │
        ├─ aiConfigStore.ensureConfig() → 检查完整性
        │
        ├─ generateAiTextStream({ userPrompt: prepared.prompt }, config, onChunk)
        │     │
        │     └─ fetchEdgeFunctionStream('ai-chat', { params, stream: true })
        │           ├─ fetch(supabaseUrl + '/functions/v1/ai-chat', { Authorization: Bearer JWT })
        │           │
        │           └─ Edge Function ai-chat:
        │                 ├─ resolveUserAiConfig(authHeader)
        │                 │     ├─ createClient(SUPABASE_URL, ANON_KEY, { Authorization })
        │                 │     ├─ client.auth.getUser() → 解析用户
        │                 │     └─ supabase.from('user_ai_config').select('api_base_url, api_key, model')
        │                 │
        │                 └─ fetch(config.baseUrl + '/chat/completions', { stream: true })
        │                       └─ 透传 upstream.body → Response (SSE)
        │
        ├─ readStreamResponse(response, model, onChunk)
        │     ├─ reader.read() 循环
        │     ├─ buffer 拼接 → 按 \r?\n\r?\n 分割 SSE 事件
        │     ├─ parseSseDataLines() → 提取 data: 行 → 过滤 [DONE]
        │     ├─ extractStreamDeltaText() → delta.content / message.content / text
        │     └─ onChunk(content) → 累加 finalText → updateMessageById() 实时渲染
        │
        └─ persistAssistantFinal({ content, mode, sources, status, errorMessage })
              └─ createChatMessage({ role: 'assistant', content, sources, answer_mode, status })
```

### 9.5 管理后台统计

```
AdminAnalyticsView.vue
  └─ admin.ts
        ├─ try: invokeEdgeFunction('admin-analytics')
        │     └─ Edge Function → 跨表聚合查询
        └─ catch: supabase.rpc('get_admin_analytics')
              └─ PostgreSQL 存储过程 → 直接返回聚合数据
```

---

## 10. 10 大设计决策（含原因/替代方案/权衡）

> **面试通用表达模板：**
> "我当时这样设计，核心是因为当前项目优先追求完整业务闭环和迭代效率。这个方案的优点是 X，缺点是 Y。如果继续往生产化演进，我会切到 Z 方案。"

---

### 设计点 1：为什么选择 Supabase，而不是传统后端

相关文件：[src/utils/supabase.ts](src/utils/supabase.ts) · [src/api](src/api) · [supabase/sql](supabase/sql)

| 维度 | 内容 |
|------|------|
| **原因** | 中小型 AI 平台，优先追求快速闭环；Auth、DB、RLS、RPC、Functions 现成复用；精力集中在知识链路和问答体验上 |
| **替代方案** | 自建 Node/NestJS + Postgres / Java Spring Boot + Postgres / Firebase + Cloud Functions |
| **优点** | 开发效率高、闭环完整 |
| **缺点** | 复杂服务端逻辑扩展性一般，前端编排会偏重 |

---

### 设计点 2：为什么前端承担大量业务编排

相关文件：[src/views/chat/ChatView.vue](src/views/chat/ChatView.vue) · [src/views/docs/DocEditorView.vue](src/views/docs/DocEditorView.vue)

| 维度 | 内容 |
|------|------|
| **原因** | 业务本质是页面交互 + API 串联；当前架构偏轻后端；前端就近编排迭代更快 |
| **替代方案** | 下沉到服务端 API / 用工作流服务统一编排 |
| **优点** | 开发快、交互改动集中 |
| **缺点** | 页面文件容易变重，后期维护压力大 |

---

### 设计点 3：为什么 AI 请求走 Edge Function，而不是浏览器直连

相关文件：[src/utils/serverProxy.ts](src/utils/serverProxy.ts) · [supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts) · [supabase/functions/ai-embeddings/index.ts](supabase/functions/ai-embeddings/index.ts)

| 维度 | 内容 |
|------|------|
| **原因** | 避免浏览器直接暴露第三方调用链路；统一适配 OpenAI 兼容接口；后续方便做限流、监控、供应商切换 |
| **替代方案** | 浏览器直连模型服务 / 独立后端模型网关 |
| **优点** | 安全边界更清晰 |
| **缺点** | 多了一层转发 |

---

### 设计点 4：为什么用户 AI 配置单独落表

相关文件：[src/api/userAiConfig.ts](src/api/userAiConfig.ts) · [supabase/sql/012_user_ai_config.sql](supabase/sql/012_user_ai_config.sql) · [supabase/functions/_shared/aiConfig.ts](supabase/functions/_shared/aiConfig.ts)

| 维度 | 内容 |
|------|------|
| **原因** | 用户可以自带模型和 Key；平台不承担统一模型成本；兼容多个 OpenAI 兼容供应商 |
| **替代方案** | 平台统一模型 / 管理员级模型池 / 多租户模型配置 |
| **优点** | 灵活、适配性强 |
| **缺点** | 用户配置门槛高，平台难做统一 SLA |

---

### 设计点 5：为什么知识切片要落库，而不是问答时临时计算

相关文件：[src/utils/chunkText.ts](src/utils/chunkText.ts) · [src/api/knowledge.ts](src/api/knowledge.ts) · [supabase/sql/001_knowledge_module.sql](supabase/sql/001_knowledge_module.sql)

| 维度 | 内容 |
|------|------|
| **原因** | 切片是知识加工的一部分；每次提问临时切片成本高且结果不稳定 |
| **替代方案** | 实时切片 / 异步后台切片任务 |
| **优点** | 问答阶段性能稳定 |
| **缺点** | 内容更新后要重新同步 |

---

### 设计点 6：为什么同时保留向量检索和关键词检索

相关文件：[src/utils/retrieveChunks.ts](src/utils/retrieveChunks.ts) · [src/utils/vectorEmbedding.ts](src/utils/vectorEmbedding.ts) · [src/views/chat/ChatView.vue](src/views/chat/ChatView.vue)

| 维度 | 内容 |
|------|------|
| **原因** | 向量检索效果更强，但依赖 Embedding 和配置；关键词检索简单稳定，适合兜底 |
| **替代方案** | 只做关键词 / 只做向量 / 混合检索 + rerank |
| **优点** | 效果与可用性兼顾 |
| **缺点** | 策略复杂度更高 |

---

### 设计点 7：为什么消息要存 sources / answer_mode / status / error_message

相关文件：[src/api/chat.ts](src/api/chat.ts) · [supabase/sql/008_chat_answer_mode.sql](supabase/sql/008_chat_answer_mode.sql) · [supabase/sql/010_chat_stream_status.sql](supabase/sql/010_chat_stream_status.sql)

| 维度 | 内容 |
|------|------|
| **原因** | 要追踪回答依据、区分回答模式、记录流式状态和错误 |
| **替代方案** | 只存纯文本 / 单独拆来源表 |
| **优点** | 落地快、上下文完整 |
| **缺点** | jsonb 不利于复杂关系分析 |

---

### 设计点 8：为什么文档和文件是两条知识入口

相关文件：[src/views/docs/DocEditorView.vue](src/views/docs/DocEditorView.vue) · [src/components/knowledge/FileUpload.vue](src/components/knowledge/FileUpload.vue) · [supabase/sql/007_document_knowledge_bridge.sql](supabase/sql/007_document_knowledge_bridge.sql)

| 维度 | 内容 |
|------|------|
| **原因** | 平台内内容和平台外资料都要支持；文档适合边写边沉淀；文件适合直接导入已有资料 |
| **替代方案** | 只保留文档入口 / 只保留文件入口 |
| **优点** | 来源更丰富 |
| **缺点** | 模型和数据关系更复杂 |

---

### 设计点 9：为什么流式结果先本地渲染，再最终落库

相关文件：[src/views/chat/ChatView.vue](src/views/chat/ChatView.vue) · [src/api/ai.ts](src/api/ai.ts)

| 维度 | 内容 |
|------|------|
| **原因** | 流式交互体验更好；每个 chunk 落库成本太高；先本地拼接，结束后统一保存更实用 |
| **替代方案** | 每个 chunk 增量持久化 / 不做流式，只返回最终结果 |
| **优点** | 体验和复杂度平衡较好 |
| **缺点** | 中间态恢复能力弱 |

---

### 设计点 10：为什么强调 RLS

相关文件：[supabase/sql/001_knowledge_module.sql](supabase/sql/001_knowledge_module.sql) · [supabase/sql/003_chat_module.sql](supabase/sql/003_chat_module.sql) · [supabase/sql/011_document_sharing.sql](supabase/sql/011_document_sharing.sql)

| 维度 | 内容 |
|------|------|
| **原因** | 前端权限只影响体验，不是最终安全边界；当前项目很多表是前端 SDK 直连，必须依赖 RLS 做最终数据权限隔离 |
| **替代方案** | 所有请求都走传统后端 |
| **优点** | 权限边界清晰 |
| **缺点** | RLS 策略复杂，调试成本高 |

---

## 11. 技术债与风险清单

| # | 问题 | 风险 | 典型文件 | 优化方向 |
|---|------|------|----------|----------|
| 1 | 页面编排逻辑过重 | 单文件复杂度高，牵一发动全身 | [ChatView.vue](src/views/chat/ChatView.vue)、[DocEditorView.vue](src/views/docs/DocEditorView.vue) | 抽离工作流/状态机 |
| 2 | 检索能力偏轻量 | 数据规模变大时性能受限 | [retrieveChunks.ts](src/utils/retrieveChunks.ts)、[vectorEmbedding.ts](src/utils/vectorEmbedding.ts) | 引入成熟向量检索引擎 |
| 3 | Embedding 仅数组存储 | 无 ANN 索引，不是专业向量引擎 | [001_knowledge_module.sql](supabase/sql/001_knowledge_module.sql) | pgvector / 外部向量库 |
| 4 | 用户 AI Key 明文存储 | 即便有 RLS 也不是最佳实践 | [userAiConfig.ts](src/api/userAiConfig.ts)、[012_user_ai_config.sql](supabase/sql/012_user_ai_config.sql) | 加密存储 / KMS / 统一网关 |
| 5 | 流式中间态恢复弱 | 断流时用户看到的内容可能丢失 | [ChatView.vue](src/views/chat/ChatView.vue)、[ai.ts](src/api/ai.ts) | 增量持久化 streaming 状态 |
| 6 | 文件类型支持不足 | 只支持 txt/md | [FileUpload.vue](src/components/knowledge/FileUpload.vue) | 扩展 PDF/DOCX 等 |
| 7 | 后端职责偏弱 | 复杂业务沉到前端 | 整体架构 | 逐步下沉服务端 |
| 8 | 埋点是弱一致 | 失败只 warn，统计不够强一致 | [tracker.ts](src/utils/tracker.ts) | 增强可靠性 |
| 9 | schema 兼容逻辑多 | 历史迁移兼容成本高 | [chat.ts](src/api/chat.ts)、[knowledge.ts](src/api/knowledge.ts) | 统一迁移管理 |
| 10 | 测试体系不足 | 问答/切片/迁移链路靠人工验证 | — | 补自动化测试 |

---

## 12. 如果重来一次

这部分是面试中展示反思能力的关键——不是被动承认技术债，而是主动说"我知道了更好的做法"。

### 1. 会先把数据模型定清楚再写代码

当前项目是边写功能边改 schema，导致 12 个 SQL 迁移文件中有大量 `alter table add column` 和兼容逻辑。如果重来，会先画 ER 图确定核心表关系，再写第一版迁移，后续迁移用版本号严格管理，避免前端出现 `createKnowledgeFile()` 那种"4 种 insert payload 逐个尝试"的兼容代码。

### 2. 会把检索下沉到服务端

当前向量检索是前端从数据库拉 500 条切片到内存，再逐个算余弦相似度。数据量小的时候没问题，但 500 条是硬上限，知识库大了就需要分页或者降级。如果重来，会选择 pgvector 扩展在数据库层做 ANN 检索，或者至少把检索逻辑放在 Edge Function 中，前端只传问题、收结果。

### 3. 会把问答工作流从页面中抽离

当前 ChatView.vue 1130 行，状态机、检索策略、Prompt 构建、流式解析、消息持久化、埋点全混在一起。如果重来，会把这些逻辑抽成独立的 composable（`useQaWorkflow`、`useRetrieval`、`useMessagePersistence`），页面只负责 UI 渲染和事件绑定。这样不仅易维护，也方便单测。

### 4. 会先搭 CI 和基础测试

当前项目没有自动化测试，问答链路、切片链路、迁移兼容链路全靠人工验证。如果重来，至少会在三个关键节点加测试：`chunkText()` 的单元测试（边界情况多）、`retrieveRelevantChunks()` 的评分精度测试、问答主链路的集成测试。CI 管道至少跑 lint + type check + 单元测试。

### 5. 会对 AI Key 做加密存储

当前明文存储，虽然 RLS 限制了访问，但安全性不够。如果重来，至少会用 Supabase Vault 或 pgcrypto 做静态加密，Edge Function 读取时解密，前端永远看不到明文 Key。更进一步可以引入 API Gateway 做统一模型代理，用户只需要在平台配置一次。

---

## 13. 面试高频深挖问答

### Q1: 你们的 RAG 怎么做的？

完整流程是：内容入库时先 `chunkText()` 切片（300-500 字符/片，按段落→句子→硬截断三级拆分），写入 `knowledge_chunks` 表。如果用户配置了 AI，同时生成 Embedding 存入 `embedding` 字段（`double precision[]` 类型）。问答时 `prepareSmartQa()` 先拉取切片，有 embedding 且 AI 配置完整就走向量检索——`createEmbedding()` 生成问题向量，`findTopSimilarChunks()` 在内存中做余弦相似度计算取 TopK。向量检索失败或结果不理想（topScore < 0.2）则自动回退关键词检索——中文 N-gram 分词 + 停用词过滤 + 命中率/密度评分。最后根据检索质量决定走 `knowledge-enhanced`（注入参考资料）还是 `general-ai`（纯模型回答）。

相关文件：[chunkText.ts](src/utils/chunkText.ts) · [retrieveChunks.ts](src/utils/retrieveChunks.ts) · [vectorEmbedding.ts](src/utils/vectorEmbedding.ts) · [buildQaPrompt.ts](src/utils/buildQaPrompt.ts)

---

### Q2: 为什么问答不一定走知识增强？

因为检索结果的质量参差不齐。差的片段注入 Prompt 不仅没用，反而会污染模型回答。所以在 `prepareSmartQa()` 里做了质量判断：向量检索要求 topScore >= 0.2 且 avgScore >= 0.12，关键词检索要求 topScore >= 0.1 且 hitCount >= 2 且 avgScore >= 0.06。达不到阈值就退回到 `general-ai` 模式，让模型基于通用知识回答，而不是硬塞一堆不相关的"参考资料"。

---

### Q3: 为什么不让浏览器直接请求模型？

三个原因。一是安全：浏览器直连会暴露用户的 API Key，走 Edge Function 代理后 Key 只在服务端使用。二是统一协议适配：不同供应商的返回格式有差异，Edge Function 做一层归一化，前端不需要关心底层差异。三是治理能力：后续要做限流、监控、供应商切换，在 Edge Function 层改一处即可，不用改前端代码。

---

### Q4: 文档和知识文件为什么分开建模？

来源不同，生命周期不同。文档是用户在平台内写的，随时可能修改、发布、分享，需要通过 `knowledge_documents` 桥接表关联知识库，同步时删除旧切片重新生成。文件是外部上传的 txt/md，上传后基本不变，也没有分享、发布等状态流转。两者如果共用一张表，会出现大量互斥的可选字段，schema 会很臃肿。

---

### Q5: 为什么把 sources 放消息表？

这是一次问答执行结果的快照。如果用外键关联切片表，切片内容后续被更新或删除，消息里的引用就会悬空，追溯性就没了。`jsonb` 存快照的好处是落地快、查询简单，能完整保留"这条回答当时依据了什么"。缺点是如果要做跨消息的引用来源分析，jsonb 就不太方便了——但那是后续的优化空间。

---

### Q6: 权限怎么做？

三层控制。第一层路由守卫：未登录不能进业务页，非 admin 不能进 `/admin`。这一层是体验层，不是安全边界。第二层 Pinia Store：`userStore` 管理登录态和角色，`isAdmin` getter 驱动 UI 显隐。第三层 RLS：所有表都开了 Row Level Security，select/insert/update/delete 策略全部限定 `auth.uid() = owner_id`。前两层做体验拦截，第三层做最终数据隔离。

---

### Q7: SSE 流式输出怎么做？

前端不通过 `supabase.functions.invoke()`（它不支持流式），而是直接 `fetch()` Edge Function 的 URL，带 `Authorization: Bearer {supabase_access_token}`。拿到 `Response` 后 `body.getReader()` 获取 `ReadableStream`，`TextDecoder` 解码 → buffer 拼接 → 按 `\r?\n\r?\n` 分割 SSE 事件块 → `parseSseDataLines()` 提取 `data:` 行 → 过滤 `[DONE]` → `extractStreamDeltaText()` 按优先级提取 `delta.content` / `message.content` / `text`。每解析到一个 delta 就回调 `onChunk()` 让页面实时更新。多供应商兼容额外做了深度遍历 JSON 树的 fallback 逻辑。

---

### Q8: 为什么用户消息先保存，AI 消息最后保存？

用户消息是一个确定性事件——用户点了发送，内容就是确定的，可以立即落库。AI 消息是流式过程——内容在逐步生成，中间状态不宜频繁写库。如果每个 chunk 都写一次，数据库压力大且没有实际意义。所以策略是：用户消息立即 `createChatMessage()`，AI 消息先本地拼接流式文本，等流结束或出错后，调用 `persistAssistantFinal()` 一次性写入完整内容 + sources + answer_mode + status + error_message。

---

### Q9: 你觉得当前最大技术债是什么？

四个：页面编排过重（ChatView.vue 1130 行，状态机、工作流、异常处理混在一起）；检索偏轻量（向量检索是前端内存遍历，没有 ANN 索引，数据大了就扛不住）；Key 管理还不够平台化（用户级明文配置，没有加密、审计、用量统计）；流式中间态恢复弱（断流后用户看到的内容可能丢失，没有 checkpoint 机制）。

---

### Q10: 如果继续演进，你优先做什么？

1. 抽离问答工作流——把 ChatView.vue 里的状态机、检索策略、持久化逻辑抽到独立的 composable/服务中
2. 引入 pgvector 或外部向量库——替换 `double precision[]` 存储，加上 ANN 索引，让向量检索真正可扩展
3. 扩展文件类型——PDF/DOCX 解析和切片，目前只支持 txt/md
4. 完善 AI Key 安全治理——加密存储、用量统计、异常告警
5. 补测试和可观测性——单元测试覆盖切片、检索、Prompt 构建，集成测试覆盖问答主链路

---

### Q11: 为什么选 Supabase 而不是自己写后端？

这个项目本质是 AI 知识平台，早期更重要的是快速打通认证、文档、知识库、问答、后台这条链路，而不是花时间写用户系统、权限系统、API 网关。Supabase 提供了 Auth、Postgres、RLS、RPC 和 Edge Functions 五个核心能力，开箱即用。特别是 RLS——前端 SDK 直连数据库时，如果没有 RLS，任何用户都能通过浏览器 DevTools 查到别人的数据。Supabase 把这个问题在数据库层解决了，我不需要自己写中间件。

---

### Q12: 前端直连 Supabase，安全边界在哪里？

安全边界不在前端。前端的路由守卫和按钮显隐只是 UX 层，任何用户都可以绕过。真正安全依赖的是 Supabase Auth + Postgres RLS 的"双层控制"：Auth 验证用户身份，RLS 在每条 SQL 执行前强制注入 `auth.uid() = owner_id` 条件。比如 `getMyDocuments()` 即使前端代码里忘了加 `eq('owner_id', userId)`，RLS 也会在数据库层拦截不属于当前用户的数据。所以我强调：前端做体验拦截，数据库做最终权限隔离。

---

### Q13: 用户 AI Key 存数据库有风险吗？

有。当前方案是明文存储，虽然 RLS 保证了只有用户本人能读到自己的 Key，但生产环境里这不是最佳实践——数据库备份、日志、管理后台都可能泄露 Key。生产化时我会把 Key 收回到服务端代理，前端只传 Supabase JWT，Edge Function 从加密存储中读取 Key 转发给模型服务。更进一步可以做 KMS 加密、用量审计、异常检测。

---

### Q14: 这个项目的 RAG 不是把全文塞进模型吗？

不是。它是先切片入库，问答时检索出最相关的 TopK（3-5 个）片段，每个片段最多 1200 字符，和问题一起构造成 Prompt。模型看到的是"问题 + 局部相关上下文"，不是全文硬塞。切片大小 300-500 字符是经过权衡的——太小语义不完整，太大检索精度下降。如果全文塞进去，不仅 token 消耗巨大，还会让模型注意力分散，回答质量反而下降。

---

### Q15: Embedding 真的用起来了吗？

用起来了。文件上传和文档入知识库时，如果 AI 配置完整（baseUrl + apiKey 不为空），就会调用 `createBatchEmbeddings()` 为每个切片生成 Embedding 并存入 `knowledge_chunks.embedding` 字段。问答时如果切片有 embedding 且 AI 配置完整，优先走向量检索。如果用户没配置 AI 或 Embedding 生成失败，关键词检索仍然可用，系统不会因此中断。

---

### Q16: 为什么还要关键词 fallback？

因为向量检索有依赖条件：用户必须配置了 AI、切片必须有 embedding 数据、Embedding API 调用必须成功。这三个条件不一定总满足。关键词检索是纯规则计算，不依赖外部服务，零成本、零延迟、零失败率。虽然效果不如向量检索，但能保证主功能不因为 Embedding 失败而中断。这是"可用性优先于最优效果"的工程抉择。

---

### Q17: 文本切片为什么按字符长度，不按 token？

当前是工程上的轻量取舍。按字符长度实现简单、落地快，不需要引入 tokenizer 库。但它和真实 token 不完全一致——中文一个字可能是一个 token 也可能是多个，英文一个单词可能被拆成多个 subword token。300-500 字符大约对应 400-800 token（中英文混合），在 GPT 模型的上下文窗口内是安全的。如果继续演进，会切到 `tiktoken` 或类似的 tokenizer，做更精确的 token 级切片。

---

### Q18: 聊天消息保存失败怎么办？

当前是用户消息先保存，AI 结果先本地流式渲染，结束后统一持久化。如果最终落库失败，确实存在"前端看到了但数据库没有"的风险——用户刷新页面后消息就丢了。更稳健的方案是先插入一条 `status='streaming'` 的空消息，流式过程中定期更新 content，结束改为 `done`。这样即使中间断流，至少有一条 partial 消息可恢复。当前选择更简单的方案是因为项目规模不大，且流式保存失败的实际概率很低。

---

### Q19: 后台统计和管理会不会被 RLS 卡住？

会，所以后台场景更适合走 RPC 或 Edge Function。普通表的跨用户查询——比如管理员想看所有用户列表、所有文档列表——如果前端 SDK 直连，会被 RLS 拦截（因为管理员不是这些数据的 owner）。解决方案是后台统计走 `admin-analytics` Edge Function 或 Supabase RPC，这些服务端能力不受 RLS 限制，可以跨用户查询。生产化时应该统一收敛到受控的服务端能力，而不是让前端 SDK 绕过 RLS。

---

## 14. STAR 亮点话术（3 个核心亮点）

### 亮点一：自适应多策略 RAG 检索

**S — 情境：** 项目核心需求是让用户基于知识库做智能问答，但单一检索策略有明显短板：纯关键词容易漏掉语义相近表达，纯向量检索又依赖 Embedding 是否存在和是否可用。

**T — 任务：** 设计一个能根据数据状态自适应切换的问答引擎，保证有 Embedding 时优先做语义检索，Embedding 不可用时能回退关键词检索，检索质量太差时再退回纯通用 AI。

**A — 行动：** 在 `ChatView.vue` 里实现了 `prepareSmartQa()`：
- 先拉取知识切片
- 若切片有 embedding 且 AI 配置完整，优先走向量检索
- 通过 `createEmbedding()` 生成问题向量，再用 `findTopSimilarChunks()` 做余弦相似度排序
- 如果向量结果不足够好，再回退到 `retrieveRelevantChunks()` 的关键词检索
- 最后根据结果质量决定走 `knowledge-enhanced` 还是 `general-ai`

**R — 结果：** 知识库有向量时能获得更好的语义召回；没向量时问答链路也不会断；整个系统对用户来说是无感切换的。

相关文件：[ChatView.vue](src/views/chat/ChatView.vue) · [retrieveChunks.ts](src/utils/retrieveChunks.ts) · [vectorEmbedding.ts](src/utils/vectorEmbedding.ts)

---

### 亮点二：多供应商兼容的流式解析

**S — 情境：** 项目支持用户自定义 `baseUrl / apiKey / model`，不同 OpenAI 兼容服务返回的流式结构可能不完全一致。

**T — 任务：** 做一个尽量不依赖供应商特判的流式解析器，兼容多种返回格式。

**A — 行动：** 在 [src/api/ai.ts](src/api/ai.ts) 里做了两层处理：
- 第一层优先解析主流 OpenAI 兼容结构，比如 `delta.content`
- 第二层通过更宽松的文本提取逻辑，兼容 `message.content`、`text`、数组 content 等情况
- 流式读取采用 `ReadableStream + buffer`，处理半包和事件块拼接

**R — 结果：** 前端不需要为每个供应商写单独适配逻辑，系统可以更稳定地接入多家 OpenAI 兼容服务。

---

### 亮点三：渐进式 schema 兼容

**S — 情境：** 项目数据库通过多份 SQL 迁移逐步演进，真实环境里可能存在迁移没执行完全的情况。

**T — 任务：** 让前端在新旧 schema 下都尽量能工作，而不是因为某一列缺失直接整个功能不可用。

**A — 行动：** 在 [src/api/chat.ts](src/api/chat.ts) 里，对 `sources / answer_mode / status / error_message` 做了兼容：
- 先按完整字段读写
- 若发现列不存在，则自动降级为基础字段模式
- 前端再补默认值，保证业务可继续运行

**R — 结果：** 降低了迁移不一致带来的发布风险，让项目在不同环境下更稳。

---

## 15. 一页速记卡

| 维度 | 速记内容 |
|------|----------|
| 项目定位 | AI 知识平台：文档管理、知识库构建、RAG 问答、AI 写作、共享广场、管理后台 |
| 技术栈 | Vue3 + TypeScript + Vite + Pinia + Vue Router + Element Plus + Supabase + OpenAI 兼容 API + SSE + ECharts |
| 核心链路 | 登录鉴权 → 文档编辑 → 文本切片 → 写入知识库 → 检索相关片段 → 构建 Prompt → AI 流式回答 → 保存消息和引用 |
| 数据模型 | 8 张核心表：`documents` → `knowledge_bases` → `knowledge_chunks`（切片+向量），`knowledge_documents`/`knowledge_files` 为桥接，`chats` → `chat_messages`（含 sources/answer_mode/status），`user_ai_config` 独立存储 API Key |
| 状态管理 | `userStore` 管登录态和角色；`aiConfigStore` 管用户 AI 配置 |
| RAG 实现 | `chunkText` 切片 → `retrieveChunks` 关键词召回 / `vectorEmbedding` 向量召回 → `buildQaPrompt` 注入上下文 |
| 权限设计 | 路由守卫（体验层） + Supabase RLS（数据层） |
| 可讲亮点 | "我做的是一条完整的内容资产化到 AI 问答的链路，不只是 CRUD" |
| 最大风险 | 前端编排偏重、检索偏轻量、AI Key 安全治理不足、测试体系薄弱 |
| 后续优化 | 抽离工作流、引入成熟向量检索、扩展文件类型、加强 Key 管理和可观测性 |

---

## 16. 2 分钟项目介绍逐字稿

> 大家好，我这个项目本质上是一个 AI 知识平台，核心目标是把内容生产、知识沉淀和智能问答串成一个完整闭环。
>
> 技术上，前端我主要用了 Vue3、TypeScript、Pinia、Vue Router 和 Element Plus，后端没有走传统重服务，而是基于 Supabase 来做认证、数据库、RLS、RPC 和 Edge Function。AI 相关能力则是通过 Supabase Edge Function 去代理调用 OpenAI 兼容模型接口。
>
> 从业务流程上看，用户先登录系统，然后可以在文档模块里写 Markdown 文档。写作过程中系统支持自动保存草稿，同时集成了 AI 写作助手，可以做润色、扩写、总结和续写。用户写完后，可以把文档直接加入知识库，或者上传 txt、md 文件到知识库。
>
> 进入知识库之后，系统会先对内容进行切片，把长文本拆成多个知识片段并写入数据库；如果用户已经配置了 AI，还会进一步生成 Embedding，这样后续问答时既可以走关键词检索，也可以走向量检索。
>
> 在问答模块里，用户选择知识库后输入问题，系统会先去知识库里检索最相关的片段，再把问题和这些片段一起组装成 Prompt 发给大模型。回答是通过 SSE 流式返回的，所以前端可以做到边生成边展示。等回答结束后，系统还会把问题、答案、引用来源和回答模式一起落库，方便后续追溯和管理。
>
> 所以我觉得这个项目最大的价值，不是单独做了一个 AI 聊天框，而是完整实现了一个轻量级 RAG 平台，从内容输入、知识加工，到知识消费和后台运营都覆盖到了。

---

## 17. 高级工程师视角收尾

> 这个项目最有价值的地方，不是单点接入了 AI，而是围绕知识生命周期搭建了完整闭环：用户先生产内容，系统把内容加工成知识，用户再通过检索增强问答消费知识。同时在实现上，我也考虑了权限、流式体验、来源追踪、埋点和后台运营这些产品化问题。

如果面试官继续深挖，优先往这四个方向展开：

1. **为什么这样分层** — 前端编排 vs 后端下沉的权衡
2. **为什么 AI 走 Edge Function** — 安全边界与治理能力
3. **为什么检索做双策略** — 可用性与效果的平衡
4. **当前有哪些技术债，下一步怎么演进** — 展现工程成熟度意识

---

> **最后一句总结：** 这个项目已经不是简单的 AI Demo，而是一个具备轻量级 RAG、文档生产、知识沉淀、智能问答、共享和后台运营能力的完整产品雏形。