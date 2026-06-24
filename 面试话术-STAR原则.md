# 面试 STAR 话术 —— AI-Knowledge-Platform

> 每个点约 200 字，可直接背诵。面试时先报"亮点编号"，再按 S→T→A→R 顺序讲。

---

## 🔥 亮点一：自适应多策略 RAG 检索引擎

**S（背景）：** 项目是一个 AI 知识库问答平台，核心需求是让用户基于上传的文档/文件进行智能问答。但单一检索策略——纯关键词或纯向量——各有盲区：关键词漏召回语义相近但用词不同的内容，向量检索则依赖事先生成 Embedding，部分知识库切片可能没有向量数据。

**T（任务）：** 我需要设计一个能自适应选择最优检索策略的问答引擎，在有向量数据时优先语义检索，向量不可用时降级为关键词检索，检索结果质量不达标时再降级为纯 AI 通用回答，确保在任何数据状态下都能给出合理回答。

**A（行动）：**

我在 ChatView 中实现了 `prepareSmartQa()` 函数，设计了一套三级自适应检索管线。

**第一级：向量语义检索。** 先从知识库切片中筛选出 `embedding !== null` 的切片（文档同步入库的切片可能没有向量）。然后调用 Embedding API 把用户问题转成向量——这里用的是 OpenAI 的 `text-embedding-3-small` 模型，输出 1536 维的浮点数数组。调用路径是前端 `createEmbedding()` → Supabase Edge Function `ai-embeddings` 代理转发 → `POST {baseUrl}/embeddings`。走 Edge Function 中转是因为用户的 API Key 存在数据库里不能暴露给前端。用户在 Edge Function 配置层还有一个智能兜底：如果用户配的聊天模型名不包含 "embedding" 关键词，自动替换为 `text-embedding-3-small`，这样用 DeepSeek、硅基流动等兼容 API 也能正常生成向量。拿到问题向量后，与每个切片的向量用余弦相似度公式 `cosθ = (A·B) / (|A| × |B|)` 逐一计算——分子是点积，分母是两个向量的模长相乘做归一化，结果范围是 -1（完全相反）到 1（完全相同）。最后 `.sort((a,b) => b.similarity - a.similarity).slice(0, 5)` 取 Top5 最相关的切片。如果向量检索的 topScore < 0.2，说明语义匹配质量太差，触发降级；如果 Embedding API 本身报错，catch 异常后静默降级，不中断流程。

**第二级：中文 N-gram 关键词检索。** 用 2~4 字滑动窗口对用户问题提取 N-gram 碎片，过滤掉"的"、"如何"、"什么"等中英文停用词后得到关键词集合。每个切片按三维公式打分：`score = keywordScore + exactMatchScore + densityScore`。第一维命中率 `(hitCount / totalKeywords) × 0.75`，衡量用户问题关键词有多少比例落在切片里；第二维精确匹配加分 +0.25，如果切片内容原样包含用户问题原文（≥6 字），直接加分，奖励精准命中；第三维长度惩罚 `hitCount / √contentLength`，分母是内容长度的平方根——同样的命中数，短切片因为信息密度高得分远高于碰巧包含关键词的长切片。最后按 `score → hitCount → 内容长度` 三级排序取 Top5。

**第三级：纯 AI 通用回答。** 如果两轮检索都没拿到有价值结果——向量检索的 topScore < 0.1，关键词检索的 top hitCount < 2 或平均分 < 0.06——直接切换为 `general-ai` 模式，不注入任何知识片段，仅靠 AI 通用知识兜底回答。

**R（结果）：** 实现了三种检索策略的无感切换，用户无论知识库是否有向量数据、是否配置了 AI Key 都能获得合理回答。向量检索提供语义级匹配能力，对"怎么导出数据"和"下载"这类同义不同词的查询尤为有效；关键词检索的 N-gram + 停用词过滤对中文短问句命中率高。检索策略的选择和来源片段全程可追溯，前端展示匹配分数和命中关键词。

> 📍 代码位置：`src/views/chat/ChatView.vue:225-320`（prepareSmartQa 三级降级）、`src/utils/vectorEmbedding.ts:59-65`（createEmbedding）、`supabase/functions/ai-embeddings/index.ts:34-43`（Embedding API 调用）、`supabase/functions/_shared/aiConfig.ts:24-29`（模型智能替换）、`src/utils/vectorEmbedding.ts:78-118`（余弦相似度 + TopK）、`src/utils/retrieveChunks.ts:95-181`（N-gram 分词 + 三维评分）

---

## 🔥 亮点二：多供应商兼容的 SSE 流式解析器

**S（背景）：** 项目支持用户配置自己的 OpenAI 兼容 API（自定义 baseUrl/apiKey/model），不同供应商的 SSE 流式响应格式差异很大：有的返回 `choices[0].delta.content`（OpenAI 标准），有的返回 `output_text` 数组，有的将内容嵌套在 `data.result.answer` 深层路径中，甚至 `content` 字段可能是字符串或对象数组。

**T（任务）：** 我需要实现一个能兼容多种 AI 供应商响应格式的 SSE 流式解析器，既不能对每种供应商写死适配代码，又要保证在各种响应结构下都能正确提取文本内容。

**A（行动）：** 我没有按供应商去写一堆特判逻辑，而是把整个解析方案做成“两层处理”。第一层先按主流 OpenAI 兼容格式去提取文本，优先覆盖最常见的返回路径，同时把 `content` 这种不稳定字段统一收敛成纯文本，避免因为它有时是字符串、有时是数组而解析失败。第二层再做通用兜底，用限制深度的递归方式遍历返回 JSON 里几个高频语义字段，尽量从非标准嵌套结构里捞出第一个有效文本，保证字段位置变了也不会整段丢内容。流式读取上，我按 chunk 消费 SSE 数据，并用 buffer 机制处理跨 chunk 的半包问题，确保每个事件都是拼完整之后再解析。最后我补了冒烟测试，专门覆盖标准流式、数组 content、深层嵌套和非标准 text 返回这几类典型格式。

**R（结果）：** 解析器可以兼容 OpenAI、Azure、DeepSeek、硅基流动等至少 4 种 OpenAI 兼容格式的供应商，不需要任何供应商特判代码。streaming 过程中逐 chunk 回调更新 UI，用户看到逐字输出的实时效果。冒烟测试覆盖了标准格式和非标准嵌套格式。

> 📍 代码位置：`src/api/ai.ts:54-173`（提取器）、`src/api/ai.ts:184-253`（流式读取）、`scripts/stream-parser-smoke.mjs`（冒烟测试）

### 🧠 面试追问应对：两层降级解析架构

> **追问：「两层降级解析具体怎么设计的？」**
>
> **第一层（结构化提取）：** `extractStreamDeltaText()` 按优先级尝试 `delta.content → message.content → text` 三个路径提取文本。`extractTextFromUnknownContent()` 处理 `content` 可能是字符串 "hello" 或数组 `[{type:"text", text:"hello"}]` 两种情况，保证都能拿到字符串。
>
> **第二层（深度兜底）：** `extractFirstDeepText()` 用递归深度优先搜索（最大深度 8 层），按 `content → text → output_text → answer → response → message → result` 优先级键名遍历 JSON 树，找到第一个有效文本片段就返回。这是保底方案——前两层都拿不到内容时，绝不在 JSON 层级上放弃。
>
> **SSE 解析层：** `ReadableStream.getReader()` 逐块读取，buffer 机制处理跨 chunk 的不完整事件。因为 SSE 是 `data: {...}\n\n` 格式，TCP 分包可能把一个事件拆成两个 chunk，buffer 拼接保证完整性。
>
> 📍 代码：`src/api/ai.ts:54-85`（extractStreamDeltaText）、`src/api/ai.ts:87-115`（extractTextFromUnknownContent）、`src/api/ai.ts:117-157`（extractFirstDeepText 递归DFS）、`src/api/ai.ts:184-253`（ReadableStream + buffer）

---

## 🔥 亮点三：数据库渐进式迁移 + 自动降级兼容

**S（背景）：** 项目使用 Supabase 作为后端，数据库 schema 通过 12 个 SQL 迁移脚本逐步演进。当新增字段（如 `answer_mode`、`status`、`error_message`）时，如果用户的数据库还没执行对应迁移，直接插入这些列会导致 SQL 错误，整个功能不可用。

**T（任务）：** 我需要让前端代码兼容不同迁移进度的数据库，当新列不存在时自动降级为只操作基础列，确保应用在任何迁移阶段都能正常运行，而不是强制用户必须执行全部迁移。

**A（行动）：** 我在 `chat.ts` 的消息读写函数中实现了"列级错误检测 + 自动降级重试"模式。以 `createChatMessage()` 为例：先尝试插入完整 payload（含 sources/answer_mode/status/error_message），如果 Supabase 返回错误，用 `isMissingSourcesColumnError()` 等函数检测错误信息中是否包含 `'sources'` 和 `'chat_messages'` 关键词。若命中，说明是列缺失而非其他错误，自动用 `supabase.from().insert()` 仅插入基础字段（chat_id/owner_id/role/content）作为降级方案，成功后在前端补齐新字段的默认值。读取消息时同理：先 select 全部列，失败则降级为只 select 基础列，缺失字段用 `sources: []`, `status: 'done'` 等默认值填充。

**R（结果）：** 实现了 12 个迁移脚本的渐进式兼容，新旧数据库都能正常工作。用户可以先使用核心功能，后续再执行迁移获得完整能力。这个模式在后续新增 `answer_mode` 和 `status` 字段时无需修改降级逻辑，只需增加对应的错误检测函数即可。

> 📍 代码位置：`src/api/chat.ts:91-110`（列缺失检测）、`src/api/chat.ts:381-456`（插入降级）、`src/api/chat.ts:322-378`（查询降级）

### 🧠 面试追问应对：列级错误检测模式

> **追问：「怎么判断是列缺失而不是其他错误？」**
>
> `isMissingSourcesColumnError()` 检测 Supabase 返回的 error 对象中是否**同时**包含 `'sources'` 和 `'chat_messages'` 关键词。双关键词 AND 条件避免误判——比如一条 unrelated 错误消息碰巧包含 "sources" 不会触发降级。
>
> 检测到列缺失后的降级策略：
> - **插入时**：`insert([完整payload])` 失败 → 检测到列缺失 → `insert([基础字段])` 重新插入 → 成功后在内存中补齐 `sources:[]`, `status:'done'` 等默认值。
> - **读取时**：`select('*')` 失败 → 检测到列缺失 → `select('id, chat_id, owner_id, role, content')` 只查基础列 → 返回后用默认值填充缺失字段。
>
> 这个模式的好处是**可扩展**：后续新增 `answer_mode` 和 `status` 字段时，只需增加对应的 `isMissingXxxError()` 检测函数，降级框架不用动。
>
> 📍 代码：`src/api/chat.ts:91-110`（5个列缺失检测函数）、`src/api/chat.ts:381-456`（插入降级完整流程）

---

## 💡 难点一：文档同步知识库时的 file_id 约束冲突

**S（背景）：** 项目的知识库切片表 `knowledge_chunks` 有一个 `file_id` 外键列，在早期 schema 设计中 `file_id` 是 NOT NULL 约束——因为当时只支持"上传文件→切片"这一条路径。后来新增了"文档直接同步到知识库"功能，但文档没有对应的 `file_id`，直接插入切片会触发 not-null 约束报错。

**T（任务）：** 我需要在不修改数据库 schema（用户可能没执行新迁移）的前提下，让文档也能正常切片入库，同时不影响已有的文件上传→切片流程。

**A（行动）：** 我在 `addDocumentToKnowledgeBase()` 中设计了"约束冲突检测 + 合成文件兜底"两阶段策略。第一阶段：文档切片后直接批量插入 `knowledge_chunks`，`file_id` 传 null。如果插入成功，说明用户的数据库已更新为 file_id 可空。如果失败，用 `isFileIdNotNullError()` 检测错误信息中是否包含 `file_id` 和 `not null` 关键词。若命中，进入第二阶段：自动调用 `createKnowledgeFile()` 创建一个合成文件记录（file_name 为 `{文档标题}.md`，meta 中标记 `synthetic: true`），然后用这个合成文件的 id 作为 file_id 重试切片插入。整个过程对用户透明，前端只需等待同步完成的提示。

**R（结果）：** 文档同步知识库功能在两种数据库 schema 下都能正常工作。合成文件在知识库文件列表中可见，用户能追溯切片的来源。这个方案避免了强制用户执行数据库迁移的运维负担，保证了功能的向前兼容性。

> 📍 代码位置：`src/api/documents.ts:68-72`（约束检测）、`src/api/documents.ts:355-549`（完整同步流程）、`src/api/documents.ts:466-505`（合成文件兜底）

---

## 💡 难点二：多用户 AI 配置的异步加载竞态问题

**S（背景）：** 项目支持每个用户配置自己的 AI API Key/Base URL/Model，配置存储在 Supabase 的 `user_ai_config` 表中。AI 调用遍布多个模块（问答、写作助手、Embedding 生成），任何一个 AI 调用发起时都必须确保配置已加载且完整。如果配置还未加载完成就开始调用 AI，会拿到空的 API Key 导致请求失败。

**T（任务）：** 我需要设计一个全局 AI 配置状态管理方案，保证：配置只加载一次（避免重复请求）、加载完成前阻塞所有 AI 调用、加载完成后所有等待者同时释放、配置缺失时给出明确的缺失字段提示。

**A（行动）：** 我在 Pinia Store 中使用 Composition API 设计了配置加载的状态机。核心是 `loadingPromise` 防重机制：当多个组件同时调用 `loadConfig()` 时，只有第一个调用真正发起请求，后续调用者 await 同一个 Promise。`ensureConfig()` 方法作为所有 AI 调用的前置入口：如果未初始化则自动触发加载，加载完成后返回解析后的配置。配置解析层 `resolveAiConfigFromUserConfig()` 实现了两层默认值兜底：baseUrl 默认 `https://api.openai.com/v1`，model 默认 `gpt-4o-mini`。`isAiConfigComplete()` 检查 apiKey 和 baseUrl 是否非空，缺失时 `missingFields` 计算属性返回中文提示文案（如"API Key"），前端直接展示给用户。

**R（结果）：** 无论用户从哪个入口（问答页、写作助手、Embedding 生成）发起 AI 调用，配置都能保证加载完成后再执行。多个并发调用共享同一个加载 Promise，不会重复请求。配置缺失时用户看到明确的中文提示，而非模糊的"请求失败"。

> 📍 代码位置：`src/stores/aiConfig.ts:26-49`（loadingPromise 防重）、`src/utils/aiConfig.ts:24-41`（两层解析与默认值）、`src/stores/aiConfig.ts:17-24`（完整性检查）

### 🧠 面试追问应对：loadingPromise 防重 + 状态机设计

> **追问：「怎么保证配置只加载一次，多个调用者不重复请求？」**
>
> 核心是 Pinia Store 中的 `loadingPromise` 防重机制。当多个组件同时调用 `loadConfig()` 时，只有第一个调用真正发起 Supabase 请求，把返回的 Promise 存到 `loadingPromise` 变量中。后续调用者发现 `loadingPromise` 已经存在，直接 `await` 同一个 Promise。所有等待者同时释放，不会产生重复请求。加载完成后清空 `loadingPromise`。
>
> `ensureConfig()` 是状态机入口：未初始化 → 自动触发 `loadConfig()` → 阻塞等待 → 加载完成返回解析后的配置。所有 AI 调用（问答、写作助手、Embedding 生成）都会先 `await ensureConfig()`，保证配置可用再发请求。
>
> **追问：「配置不完整怎么提示用户？」**
>
> `isAiConfigComplete()` 检查 apiKey 和 baseUrl 是否非空，`missingFields` 计算属性返回中文提示文案（如 `["API Key"]`、`["模型名称"]`），前端直接渲染给用户，而不是模糊的"请求失败"。
>
> 📍 代码：`src/stores/aiConfig.ts:26-49`（loadingPromise 状态机）、`src/utils/aiConfig.ts:24-41`（两层默认值兜底）

---

## 📋 面试一句话总结（电梯演讲）

> 我独立开发了一个**全栈 AI 知识库平台**，前端用 **Vue 3 + TypeScript + Pinia**，后端用 **Supabase**（Auth + PostgreSQL + RLS），核心实现了一套**自适应 RAG 检索管线**（向量语义检索 + 中文 N-gram 关键词检索 + 智能降级），支持用户**自带 API Key 接入多供应商 AI**（OpenAI 兼容协议），并通过 **SSE 流式解析** 实现逐字输出。整个项目从数据库 schema 设计（12 个迁移脚本）到前端 12 个页面全部独立完成，覆盖了认证鉴权、文档管理、知识库、AI 问答、管理后台和埋点统计的完整业务闭环。
