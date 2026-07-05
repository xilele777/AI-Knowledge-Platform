# AI Knowledge Platform 项目亮点文档（整理版）

> 目标：把项目里真正能被源码、测试和构建结果支撑的亮点整理成一份能写简历、能讲项目、能抗面试追问的材料。  
> 口径：不把“调用大模型 API”包装成模型能力；重点讲 AI 应用工程、RAG 链路、前端性能、流式交互、权限边界、可观测和工程韧性。

## 1. 项目定位

这个项目最稳的定位是：

> 基于 Vue 3 + TypeScript + Supabase 的 AI 知识库/RAG 问答平台。项目不是自研大模型，而是把 OpenAI-compatible API 包装成一个具备知识入库、检索增强、流式问答、引用溯源、权限隔离、性能优化、可观测和测试保障的完整 AI 应用。

**推荐简历标题**

```text
AI 知识库平台 / RAG 问答系统
Vue 3 + TypeScript + Supabase + Edge Functions + OpenAI-compatible API
```

**一句话讲项目**

> 用户可以创建 Markdown 文档或上传 txt/md 文件，系统将内容切片并可选生成 embedding；用户提问时先从知识库召回相关片段，再构造带参考资料的 Prompt，通过 Supabase Edge Function 代理大模型流式回答，并保存来源片段用于引用溯源。

**不要写成**

- 自研大模型 / 自研 LLM
- 自研 Agent 框架
- 企业级向量数据库
- 高并发 AI 后端
- API Key 加密存储
- 支持任意格式文档解析

## 2. 第一梯队亮点：简历最值得写的 6 条

第一梯队标准：

1. 源码里有真实实现。
2. 能讲清设计取舍。
3. 面试官追问边界、失败场景、成本和取舍时能接住。

### 2.1 RAG 双路召回与 RRF 融合

**核心结论**

项目不是把用户问题直接丢给 AI，而是实现了客户端 RAG 检索链路：文档切片、embedding 入库、向量召回、中文 N-gram 关键词召回、RRF 融合和召回质量判断。

**实现链路**

```text
文档/文件
  -> chunkText 切片
  -> 可选生成 embedding
  -> 写入 knowledge_chunks

用户提问
  -> 拉取知识库切片
  -> 向量召回 topK
  -> 中文关键词召回 topK
  -> RRF 融合
  -> 判断召回是否有价值
  -> 构造 knowledge-enhanced prompt 或降级 general-ai
```

**源码证据**

- `src/utils/chunkText.ts`
- `src/api/knowledge.ts`
- `src/api/documents.ts`
- `src/utils/retrieveChunks.ts`
- `src/utils/fuseRetrieval.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/utils/buildQaPrompt.ts`

**简历写法**

> 设计并实现 AI 知识库 RAG 问答链路：将文档/文件切分为 300-500 字知识片段，结合 Embedding 向量召回与中文 N-gram 关键词召回，并基于 Reciprocal Rank Fusion 进行双路结果融合，提升语义改写和专有名词场景下的召回稳定性。

**面试讲法**

> 向量召回擅长语义相似，但对专有名词、缩写、版本号不一定稳定；关键词召回擅长精确命中，但不懂语义改写。所以我把两路召回都保留，各取 topK，再用 RRF 按排名融合，避免不同分数量纲带来的归一化调参问题。

**边界**

当前 embedding 存在 Postgres `double precision[]`，检索主要在客户端完成，适合中小型知识库。万级以上切片更适合演进到 pgvector/RPC 服务端检索。

---

### 2.2 IndexedDB 向量缓存 + Float32Array

**核心结论**

项目针对“每次问答重复拉取全量 embedding”做了 IndexedDB 向量缓存，并利用知识切片不可变特性做 id diff，一致性逻辑比较清楚。

**实现链路**

```text
服务端查询当前知识库 chunk ids
  -> 本地 IndexedDB 查询已缓存 chunk ids
  -> serverIds - cachedIds = missingIds
  -> cachedIds - serverIds = staleIds
  -> 只拉缺失 embedding
  -> 删除本地过期缓存
  -> 按服务端 id 顺序恢复切片列表
```

**源码证据**

- `src/utils/embeddingCache.ts`
- `src/api/chat.ts`
- `src/types/chat.ts`

**简历写法**

> 针对重复拉取全量 embedding 的性能问题，设计 IndexedDB 向量缓存层：利用知识切片“插入后不更新、重建时删旧插新”的不可变特性，通过服务端 id 集合与本地缓存集合 diff 实现增量拉取和失效淘汰，并以 `Float32Array` 存储向量降低缓存体积和后续矩阵计算成本。

**面试讲法**

> 缓存一致性最怕可变数据。我先观察切片写路径，发现文档重新同步时是删除旧切片再插入新切片，所以 chunk id 可以作为缓存一致性的判断依据。缓存里只放稳定字段和 embedding，不缓存易变的 sourceName，显示时再从服务端数据恢复来源信息。

**边界**

IndexedDB 不可用时会回退全量拉取。这个设计优先保证可用性，不是强一致缓存系统。

---

### 2.3 Web Worker + Float32Array 矩阵 + Transferable

**核心结论**

向量相似度和关键词评分都是 CPU 计算。项目把检索计算下放到 Web Worker，并且把多条 embedding 打包成连续 `Float32Array` 矩阵，通过 Transferable 转移 buffer，减少主线程阻塞和跨线程拷贝成本。

**源码证据**

- `src/utils/retrievalWorkerClient.ts`
- `src/workers/retrieval.worker.ts`
- `src/utils/similarity.ts`

**简历写法**

> 将知识库检索中的向量相似度计算和关键词评分下放 Web Worker；将多条 embedding 打包为行优先 `Float32Array` 矩阵，并通过 Transferable 转移 `ArrayBuffer`，避免大数组结构化克隆造成的主线程阻塞。

**面试讲法**

> Worker 本身不是亮点，关键是跨线程传什么。传 `number[][]` 会触发大量结构化克隆，所以我把 n 条向量复制进一个连续矩阵，只 transfer 一个 buffer。源缓存向量不直接 transfer，避免原始 buffer 被 detach。Worker 崩溃时会标记 broken，并回退主线程计算。

**边界**

这是浏览器端中小规模检索优化。更大规模数据仍应把召回迁移到数据库或后端向量检索服务。

---

### 2.4 SSE 流式解析 + 长回答渲染优化

**核心结论**

项目不是靠 SDK 黑盒流式输出，而是自己处理 OpenAI-compatible SSE：`fetch + ReadableStream + TextDecoder(stream)`、事件边界缓冲、AbortController 中断、rAF 合帧和 Markdown stable/tail 增量渲染。

**源码证据**

- `src/api/ai.ts`
- `src/utils/serverProxy.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/AssistantMarkdown.vue`
- `src/utils/streamingMarkdown.ts`
- `src/utils/streamingThinkParser.ts`

**简历写法**

> 实现 AI 问答流式交互链路：基于 `fetch + ReadableStream + TextDecoder(stream)` 手写 OpenAI-compatible SSE 解析，处理 UTF-8 跨 chunk 解码和 SSE 事件边界缓冲；通过 AbortController 支持停止生成，并结合 rAF 合帧与 Markdown stable/tail 增量渲染优化长回答性能。

**面试讲法**

> EventSource 不适合带 POST body 和 Authorization header，所以我用 fetch 读 stream。TextDecoder 的 stream 模式解决中文字符跨 chunk 问题，SSE event 用 buffer 按空行切分。流式更新时不是每个 chunk 都触发响应式渲染，而是用 rAF 合帧；Markdown 也不是全文重解析，而是拆成稳定段和尾段。

**边界**

这属于前端流式体验和渲染性能优化，不是模型推理能力。

---

### 2.5 多轮 RAG 查询改写 + 引用溯源可信闭环

**核心结论**

项目补了 RAG 中很实际的两个问题：

- 多轮追问里，“那它怎么部署？”这类问题直接检索会失败，所以检索前做查询改写。
- RAG 回答不能只生成文本，还要让用户能核对来源，所以保存 sources 并做引用定位。

**实现链路**

```text
多轮问题
  -> 判断是否含指代词/短追问
  -> 低成本 LLM 改写成自包含 query
  -> 改写结果只用于检索
  -> 展示和落库保留用户原句

RAG 回答
  -> Prompt 要求输出参考片段
  -> assistant message 保存 sources / answerMode
  -> 前端解析引用编号
  -> 点击引用定位并高亮来源切片
```

**源码证据**

- `src/utils/rewriteQuestion.ts`
- `src/utils/buildQaPrompt.ts`
- `src/utils/parseCitations.ts`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/SourceChunks.vue`
- `src/views/chat/composables/useChatMessages.ts`

**简历写法**

> 针对多轮 RAG 中指代词导致的召回失败问题，实现检索前查询改写：基于历史轮次、问题长度和中文指代词判断是否触发低成本 LLM 改写，改写结果仅用于检索；同时构建引用溯源闭环，保存回答来源片段并支持引用角标定位高亮，提升 AI 回答可验证性。

**面试讲法**

> LLM 回答能看到历史，但检索器如果只拿“它怎么部署”去查，召回会失败。所以我在检索前做 query rewriting，但不是每次都调模型，而是满足短问题或指代词条件时才触发；失败或超时就回退原句。回答侧则保存 sources，并把模型输出的参考片段解析成可点击引用，降低不可核对回答的风险。

**边界**

不能说“解决幻觉”。更准确的是“提升回答可验证性，降低不可核对输出的风险”。

---

### 2.6 多级降级韧性 + 可观测 + 测试覆盖

**核心结论**

项目不是只写 happy path，而是对 AI 主链路做了多级降级，并采集 QA 分段耗时。核心算法也有较完整的单测覆盖。

**降级策略**

- 查询改写失败/超时 -> 回退原问题。
- 向量召回失败 -> 关键词召回兜底。
- Worker 不可用或崩溃 -> 主线程计算兜底。
- IndexedDB 缓存不可用 -> 全量拉取兜底。
- 管理端 Edge Function 失败 -> RPC fallback。
- Supabase env 缺失 -> 应用可启动，实际 API 操作时报明确错误。
- 旧 schema 字段不一致 -> fallback payload 或基础字段读写。

**可观测指标**

- 检索完成耗时。
- 首 token 时间 TTFT。
- 流式输出总耗时。
- `qa_mode`、`source_count`、`answer_length`、`status`、`aborted`。
- Web Vitals 和前端错误。

**源码证据**

- `src/utils/perfMetrics.ts`
- `src/utils/errorMonitor.ts`
- `src/utils/tracker.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/utils/__tests__/`
- `e2e/chat.spec.ts`
- `.github/workflows/ci.yml`

**简历写法**

> 围绕 AI 问答主链路设计多级降级与可观测体系：查询改写、向量召回、Worker、IndexedDB 和管理统计均提供 fallback；对检索完成、首 token、流式结束进行分段计时，并结合 qa_mode/source_count/status 等上下文上报埋点；使用 Vitest 覆盖核心纯函数，Playwright 全 mock 后端验证聊天关键路径。

**验证状态**

- `npm test`：118 passed。
- `npm run build`：通过。

## 3. 第二梯队亮点：面试展开和项目完整度

这些点不建议抢占简历第一屏，但被问到“还有什么工程细节”时很好用。

### 3.1 Supabase Auth / RLS / Edge Function 代理

**价值**

- 应用启动时先初始化用户 session，再挂载 router，减少刷新误跳登录页。
- 路由守卫支持登录重定向、公开页反跳、管理员路由隔离。
- 数据库通过 RLS 做用户数据隔离，API 层也显式追加 `owner_id` 过滤。
- AI 调用由 Edge Function 代理，前端不直接请求第三方模型端点。
- 用户可配置 OpenAI-compatible Base URL、API Key、模型名。

**源码证据**

- `src/main.ts`
- `src/router/index.ts`
- `src/stores/user.ts`
- `src/utils/serverProxy.ts`
- `src/api/userAiConfig.ts`
- `supabase/functions/_shared/aiConfig.ts`
- `supabase/functions/ai-chat/index.ts`
- `supabase/functions/ai-embeddings/index.ts`
- `supabase/sql/012_user_ai_config.sql`

**简历写法**

> 基于 Supabase Auth/RLS/Edge Functions 构建用户级 AI 配置代理链路：前端通过 Auth Token 调用 Edge Function，服务端按用户身份读取 RLS 保护的 AI 配置并代理 chat/embedding 请求，同时通过路由守卫和 RLS 实现页面与数据层隔离。

**边界**

当前 API Key 是 RLS 隔离 + Edge Function 代理，不是应用层加密存储。

---

### 3.2 管理端统计与运营分析

**价值**

- 管理后台覆盖用户、文档、文件、聊天记录和运营分析。
- 统计聚合放在 Postgres RPC 中，RPC 内部做 admin 校验。
- Edge Function 标准化统计入口，前端失败时 fallback 到 RPC。
- ECharts 路由级懒加载，避免进入首屏。

**源码证据**

- `src/api/admin.ts`
- `src/views/admin/AdminAnalyticsView.vue`
- `supabase/functions/admin-analytics/index.ts`
- `supabase/sql/005_admin_analytics_rpc.sql`

**简历写法**

> 实现管理端运营分析链路：使用 Postgres RPC 聚合登录、AI 调用、活跃用户、文档/文件增长和 Top events，RPC 内部执行管理员校验；前端优先通过 Edge Function 访问统计接口，失败时降级 RPC，并对 ECharts 做路由级懒加载。

---

### 3.3 文档/文件入库闭环

**价值**

- 支持站内 Markdown 文档和 txt/md 文件两种入口。
- 文件前端读取文本、切片、批量写入 knowledge_chunks。
- 文档可同步到知识库，维护 `knowledge_documents` 桥接关系。
- 同步时记录 chunk 数量、同步时间、文档标题快照。

**源码证据**

- `src/api/documents.ts`
- `src/api/knowledge.ts`
- `src/components/knowledge/FileUpload.vue`
- `supabase/sql/007_document_knowledge_bridge.sql`

**简历写法**

> 实现文档与知识库双入口入库流程：支持站内 Markdown 文档和 txt/md 文件切片入库，维护文档-知识库桥接关系并记录同步状态，为 RAG 问答提供可追踪的知识来源。

---

### 3.4 兼容旧 schema 的防御式 API

**价值**

项目对 Supabase schema 演进做了兼容：

- `knowledge_files` 兼容 `file_path/storage_path`、`mime_type/file_type` 差异。
- `chat_messages` 新增字段缺失时回退基础字段读写。
- SQL 迁移大量使用 `if not exists`。

**源码证据**

- `src/api/knowledge.ts`
- `src/api/chat.ts`
- `supabase/sql/001_knowledge_module.sql`
- `supabase/sql/003_chat_module.sql`
- `supabase/sql/007_document_knowledge_bridge.sql`

**简历写法**

> 在 Supabase schema 迭代中实现兼容式数据访问：针对历史字段命名和新增列缺失场景提供 fallback 读写路径，并配合幂等 SQL 迁移降低旧环境升级失败风险。

**边界**

这是兼容旧环境的防御式 API，不是完整灰度发布系统。

---

### 3.5 前端工程细节

**可以展开的点**

- `useAsyncState`：统一 idle/loading/success/error/streaming 状态，并处理 loading 防闪烁。
- `apiDedupe`：同 key 的 in-flight 请求复用 Promise。
- `useConfirmDelete`：乐观删除、撤销窗口、失败恢复。
- `useKeyboardShortcut`：Ctrl/Cmd/Mod 归一化，输入框误触保护。
- `documentDraft`：版本化 localStorage key + 结构校验。
- `useDarkMode` + `theme.css`：设计 token、暗色主题、用户偏好持久化。
- Vite：Element Plus 按需引入、路由懒加载、manualChunks 定向分包。

**源码证据**

- `src/composables/useAsyncState.ts`
- `src/utils/apiDedupe.ts`
- `src/composables/useConfirmDelete.ts`
- `src/composables/useKeyboardShortcut.ts`
- `src/utils/documentDraft.ts`
- `src/composables/useDarkMode.ts`
- `src/styles/theme.css`
- `vite.config.ts`

**合并写法**

> 围绕 AI 知识库产品闭环完善前端工程细节：封装异步状态机、请求去重、乐观删除撤销、快捷键、文档草稿保护、暗色主题和路由懒加载，使项目从单点 AI 调用扩展为可维护的知识管理应用。

## 4. 知识增强功能的面试讲法

这是最容易被问到的点，可以直接这样讲。

**短版**

> 知识增强本质是 RAG：知识库负责提供事实依据和上下文，AI 负责理解问题、组织语言和生成自然回答。我的实现是文档入库时先切片并可选生成 embedding；用户提问时对知识库做向量召回和中文关键词召回，再用 RRF 融合并做质量判断；如果召回结果可靠，就把相关切片作为参考资料构造成 Prompt 交给大模型回答，同时保存 sources 做引用溯源。如果召回质量不够，就降级为普通 AI 回答，避免低质量知识误导模型。

**详细链路**

```text
1. 入库
   文档/文件 -> chunkText 切片 -> 可选 embedding -> knowledge_chunks

2. 检索
   用户问题 -> 可选查询改写 -> 向量召回 + 关键词召回 -> RRF 融合

3. 判断
   有高质量来源 -> knowledge-enhanced
   没有可靠来源 -> general-ai

4. 生成
   用户问题 + 参考片段 -> Prompt -> Edge Function -> OpenAI-compatible API

5. 溯源
   保存 answerMode + sources -> 解析参考片段 -> 点击引用定位来源
```

**和“单纯调 API”的区别**

```text
单纯调 API：
用户问题 -> AI -> 回答

本项目：
用户问题 -> 检索知识库 -> 召回融合 -> 构造参考资料 Prompt -> AI -> 保存来源 -> 引用溯源
```

## 5. 简历版本建议

### 5.1 精简版：4 条最硬

```text
- 设计并实现 AI 知识库 RAG 问答链路：文档切片、Embedding 入库、向量检索 + 中文 N-gram 关键词检索，并基于 RRF 做双路召回融合和质量判断。
- 针对重复拉取全量 embedding 的问题，实现 IndexedDB 向量缓存，通过服务端 id 集合与本地缓存 diff 完成增量拉取和失效淘汰，并以 Float32Array 存储向量。
- 将向量相似度与关键词评分下放 Web Worker，使用 Float32Array 矩阵 + Transferable 降低跨线程传输与主线程阻塞。
- 手写 OpenAI-compatible SSE 流式解析，支持 TextDecoder 增量解码、事件边界缓冲、AbortController 停止生成，并通过 rAF 合帧和 Markdown 增量渲染优化长回答体验。
```

### 5.2 完整版：6 条

```text
- 基于 Vue 3 + TypeScript + Supabase 搭建 AI 知识库平台，覆盖文档管理、知识库入库、RAG 问答、AI 写作、共享广场和管理后台。
- 设计 RAG 检索链路：文档/文件切片、Embedding、向量召回、中文 N-gram 关键词召回、RRF 秩融合，并根据召回质量自动切换知识增强/纯 AI 模式。
- 实现 IndexedDB 向量缓存：利用切片不可变特性进行服务端 id 与本地缓存 diff，减少重复下载全量 embedding；向量以 Float32Array 存储并参与 Worker 矩阵计算。
- 将检索重计算下放 Web Worker，向量打包为 Float32Array 矩阵后通过 Transferable 传输，Worker 不可用时自动降级主线程，保证可用性。
- 实现流式问答体验：手写 SSE 解析与中断、rAF 合帧、Markdown stable/tail 增量渲染、<think> 推理块分流和引用溯源定位。
- 建立工程质量与可观测体系：118 个 Vitest 用例覆盖核心纯函数，Playwright 全 mock 后端验证聊天关键路径，采集 Web Vitals、QA 检索/TTFT/流式耗时和前端错误。
```

### 5.3 第一梯队排序

```text
1. RAG 双路召回与 RRF 融合。
2. IndexedDB 向量缓存 + Float32Array。
3. Web Worker + Float32Array 矩阵 + Transferable。
4. SSE 流式解析 + rAF 合帧 + Markdown 增量渲染。
5. 多轮查询改写 + 引用溯源可信闭环。
6. 多级降级韧性 + 可观测 + 测试覆盖。
```

## 6. 面试 2 分钟介绍稿

```text
这个项目是一个基于 Vue 3、TypeScript 和 Supabase 的 AI 知识库平台。用户可以创建 Markdown 文档或上传 txt/md 文件，系统会把内容切片、可选生成 embedding 并写入知识库。用户提问时，前端会先进行 RAG 检索，再构建 Prompt，通过 Supabase Edge Function 代理 OpenAI 兼容接口进行 SSE 流式回答。

我重点做的不是简单调 API，而是 AI 应用工程链路。检索侧做了向量召回和中文 N-gram 关键词召回，并用 RRF 融合；多轮场景下还做了检索前查询改写，解决“它、这个、怎么部署”这类追问召回失败的问题。性能侧做了 IndexedDB 向量缓存、Float32Array 矩阵和 Web Worker 计算卸载。交互侧手写了 SSE 流式解析、停止生成、rAF 合帧、Markdown 增量渲染、think 推理块分流和引用溯源。

另外我补了工程化能力：核心算法抽成纯函数，有 118 个 Vitest 单测；Playwright 全 mock Supabase 和 SSE 验证聊天关键路径；线上可观测方面采集 Web Vitals、QA 检索耗时、TTFT、流式时长和前端错误。这个项目的定位不是自研模型，而是把大模型 API 做成可用、可验证、性能可控的 RAG 产品。
```

## 7. 不建议写或必须降级表述的点

| 不建议写法 | 问题 | 更稳写法 |
| --- | --- | --- |
| 自研大模型 / 自研 LLM | 实际调用 OpenAI-compatible API | 集成 OpenAI-compatible API，重点实现 RAG 应用工程链路 |
| 自研 Agent 框架 | 没有工具调用规划、任务分解和多工具执行框架 | 支持多轮上下文、问题改写和知识增强问答 |
| 企业级向量数据库 | embedding 存 Postgres array，检索主要在客户端 | 客户端向量检索与缓存优化；大规模场景可演进 pgvector |
| API Key 加密存储 | 当前是 RLS 隔离 + Edge Function 代理 | API Key 通过 RLS 限制本人可见，并由 Edge Function 代理使用 |
| 支持任意文档解析 | 当前主要 txt/md 和 Markdown | 支持 txt/md 文本文件和 Markdown 文档入库 |
| 高并发后端架构 | Supabase BaaS + Edge Function | 基于 Supabase Auth/DB/RLS/Edge Functions 快速构建服务端能力 |
| 解决大模型幻觉 | RAG 不能根治幻觉 | 通过参考资料约束和引用溯源提升可验证性 |

## 8. 后续补强后更好写的点

### 8.1 补 `documents` 建表迁移

当前后续 SQL 依赖 `public.documents`，但没有看到完整建表迁移。补上后可以写：

> 完善 Supabase 数据库迁移链路，支持空库按编号一键初始化。

### 8.2 API Key 应用层加密

如果后续补 Edge Function 加密/解密或 KMS，可以写：

> 对用户 API Key 做服务端加密存储，结合 RLS 和 Edge Function 代理调用降低密钥泄露风险。

当前不能这么写。

### 8.3 知识增强 + 引用溯源 E2E

可以补一条完整 E2E：

```text
mock knowledge_chunks
-> 触发 knowledge-enhanced
-> mock 模型输出参考片段
-> 点击引用角标
-> 断言来源面板定位高亮
```

补完后可以写：

> E2E 覆盖 RAG 检索、流式回答和引用溯源完整闭环。

### 8.4 检索 benchmark

建议记录：

- 全量拉 embedding 请求大小。
- 缓存命中后请求大小。
- Worker vs 主线程检索耗时。
- TTFT 前后对比。

有实测数据后简历会更硬：

> 缓存命中后单次问答检索数据传输从 MB 级下降到 KB 级。

### 8.5 pgvector 服务端检索

如果要把项目往更后端/更 AI 基础设施方向讲，可以补：

- `vector` extension。
- `embedding vector(1536)`。
- RPC `match_knowledge_chunks`。
- 小知识库客户端检索，大知识库 pgvector。

补完后可以写：

> 设计客户端缓存检索与 pgvector 服务端检索的双策略召回架构。

## 9. 最终收束

最稳的总结是：

> 这个项目的价值不是“我会调 AI API”，而是我把大模型 API 包装成了一个具备知识入库、检索增强、流式交互、引用溯源、性能优化、权限隔离、可观测和测试保障的完整 AI 应用。

这句话符合源码实际，也最抗面试追问。
