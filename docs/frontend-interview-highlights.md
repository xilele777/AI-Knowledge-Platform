# 前端岗位面试亮点与 JD 对齐文档

> 目标：把 AI/RAG 项目翻译成前端岗位能快速识别的能力信号。  
> 核心口径：这不是“自研大模型/Agent 平台”，而是一个前端主导的复杂 AI 应用，重点体现浏览器侧性能优化、流式交互、复杂状态管理、组件边界、可观测和工程化。

## 1. 前端岗位定位

推荐定位：

> 懂 AI/RAG 业务链路的前端工程师，能在浏览器侧处理复杂数据、流式内容、长文本渲染、复杂状态和工程化质量。

不要把主线讲成：

```text
我做了一个高并发 AI 后端 / 自研 Agent / 自研大模型。
```

应该讲成：

```text
我负责 AI 知识库问答的前端核心闭环，包括知识库选择、问答配置、消息状态、流式响应、停止生成、Markdown 渲染、think 分流、引用溯源、来源高亮、性能优化和前端可观测。
```

## 2. 和前端 JD 的对应关系

| 前端 JD 关键词 | 项目里对应的内容 | 应该怎么讲 |
| --- | --- | --- |
| 复杂业务前端 | AI 知识库问答、文档入库、会话管理、管理后台 | 负责 AI/RAG 问答前端核心闭环 |
| 性能优化 | IndexedDB、Web Worker、Float32Array、Transferable、rAF、Markdown 增量渲染 | 解决浏览器侧大数据和长回答渲染卡顿 |
| 复杂状态管理 | 会话、消息、streaming/done/error、AbortController、重新生成、来源高亮 | 拆分 composable 管理状态边界 |
| 组件设计 | ChatView、ChatInput、ChatMessageList、AssistantMarkdown、SourceChunks | 容器组件/展示组件/composable/utils 分层 |
| 网络与流式交互 | fetch stream、SSE 解析、TextDecoder、AbortController | 手写 OpenAI-compatible 流式解析和中断 |
| 工程化 | Vitest、Playwright、CI、TypeScript、Vite 分包 | 核心纯函数可测，E2E 覆盖关键交互 |
| 可观测 | Web Vitals、TTFT、检索耗时、流式耗时、错误上报 | 用真实用户指标定位体验瓶颈 |
| 安全意识 | Edge Function 代理、RLS、Markdown 输出边界 | 不让前端直连第三方模型；AI 输出安全需谨慎表述 |

## 3. 前端核心闭环

这条是最适合面试讲的主线。

```text
知识库选择
  -> 问答配置
  -> 用户输入问题
  -> 必要时做多轮查询改写
  -> 浏览器侧检索知识切片
  -> 构造 Prompt
  -> 发起流式 AI 请求
  -> 消息进入 streaming 状态
  -> rAF 合帧更新回答
  -> Markdown 增量渲染
  -> think 推理块分流
  -> 停止生成 / 重新生成
  -> 保存消息与 sources
  -> 解析引用角标
  -> 点击引用定位来源片段
```

**面试话术**

> 我在这个项目里负责的是 AI 问答前端闭环，而不是只做几个页面。聊天页里既有知识库选择、问答配置、会话管理，也有流式回答、停止生成、重新生成、Markdown 渲染、think 分流和引用溯源。为了避免所有逻辑堆在一个 Vue 文件里，我把状态拆到 `useChatSession` 和 `useChatMessages`，把展示拆到 `ChatInput`、`ChatMessageList`、`AssistantMarkdown` 和 `SourceChunks`。

**源码证据**

- `src/views/chat/ChatView.vue`
- `src/views/chat/composables/useChatSession.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/ChatInput.vue`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/AssistantMarkdown.vue`
- `src/views/chat/components/SourceChunks.vue`

## 4. 复杂状态管理

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

**已经做的拆分**

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

**简历写法**

> 拆分聊天页复杂状态管理：通过 `useChatSession` 管理会话、知识库选择和问答配置，通过 `useChatMessages` 管理消息收发、RAG 检索、流式生成、停止生成和重新生成逻辑，降低 ChatView 组件复杂度并提升状态边界清晰度。

**面试追问准备**

- 为什么不全部写在 `ChatView`？  
  因为会话/配置状态和消息/流式状态变化频率不同，职责不同，拆开后更容易维护和测试。

- 新建对话为什么不立刻落库？  
  点击新建只进入空白草稿态，用户发送第一条消息时再创建真实会话，避免产生空会话。

## 5. 浏览器侧性能优化

这是前端岗位最硬的部分。

### 5.1 IndexedDB 向量缓存

**问题**

知识切片 embedding 数据大，每次问答都拉全量 embedding 会浪费网络、JSON 解析和内存。

**方案**

- 用 IndexedDB 缓存切片和 embedding。
- embedding 转成 `Float32Array`。
- 基于服务端 chunk id 和本地缓存 id 做 diff。
- 只增量拉缺失切片，删除本地过期切片。
- IndexedDB 不可用时回退全量拉取。

**源码证据**

- `src/utils/embeddingCache.ts`
- `src/api/chat.ts`
- `src/types/chat.ts`

**简历写法**

> 使用 IndexedDB 缓存知识切片 embedding，并基于服务端 id 与本地缓存 id diff 实现增量拉取和失效淘汰，减少重复网络传输和 JSON 解析成本；向量以 `Float32Array` 存储，便于后续矩阵计算。

### 5.2 Web Worker + Float32Array + Transferable

**问题**

向量相似度计算和关键词评分是 CPU 密集任务，放主线程会影响输入、滚动和流式渲染。

**方案**

- 检索计算下放 Web Worker。
- 多条 embedding 打包成连续 `Float32Array` 矩阵。
- 通过 Transferable 转移 `ArrayBuffer`，减少结构化克隆成本。
- Worker 不可用或异常时回退主线程。

**源码证据**

- `src/utils/retrievalWorkerClient.ts`
- `src/workers/retrieval.worker.ts`
- `src/utils/similarity.ts`

**简历写法**

> 将向量相似度计算和关键词评分下放 Web Worker，使用 `Float32Array` 矩阵和 Transferable 降低跨线程传输成本与主线程阻塞，并提供 Worker 异常回退主线程的降级策略。

**面试话术**

> Worker 本身不难，关键是跨线程数据怎么传。如果直接传大量 `number[]`，结构化克隆成本很高。我把向量打包成连续矩阵，只 transfer 一个 buffer，减少复制成本；同时不直接 transfer IndexedDB 缓存里的源向量，避免原 buffer 被 detach。

### 5.3 rAF 合帧 + Markdown 增量渲染

**问题**

SSE chunk 到达频率可能高于屏幕刷新率，每个 chunk 都更新 Vue 响应式状态会造成高频渲染。长回答如果每次都全文 Markdown parse，会越生成越卡。

**方案**

- 用 `requestAnimationFrame` 合并高频 chunk 更新。
- 将 Markdown 拆成 stable 段和 tail 段。
- 稳定段不随每个 chunk 重复解析。
- 未闭合代码块临时补全，避免样式跳变。

**源码证据**

- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/AssistantMarkdown.vue`
- `src/utils/streamingMarkdown.ts`

**简历写法**

> 优化 AI 长回答渲染性能：通过 `requestAnimationFrame` 合并高频 SSE chunk 更新，并将 Markdown 拆分为稳定段与流式尾段，避免长回答每帧全文重解析。

## 6. 流式交互能力

### 6.1 SSE 解析与停止生成

**实现内容**

- 使用 `fetch + ReadableStream` 读取流。
- 使用 `TextDecoder(stream)` 处理 UTF-8 跨 chunk 解码。
- 使用 buffer 处理 SSE event 跨 chunk 边界。
- 解析 OpenAI-compatible `delta.content/message.content/text` 等不同字段。
- 使用 `AbortController` 支持停止生成。

**源码证据**

- `src/api/ai.ts`
- `src/utils/serverProxy.ts`
- `src/views/chat/composables/useChatMessages.ts`

**简历写法**

> 手写 OpenAI-compatible SSE 流式解析，基于 `fetch + ReadableStream + TextDecoder(stream)` 处理 UTF-8 跨 chunk 解码和 SSE 事件边界缓冲，并通过 AbortController 打通停止生成链路。

**面试话术**

> 我没有用 EventSource，因为它不适合 POST body 和 Authorization header。用 fetch 读 stream 时要处理两个边界：中文字符可能跨 chunk，SSE event 也可能跨 chunk。所以 TextDecoder 要用 stream 模式，SSE event 要用 buffer 按空行切。

### 6.2 think 分流和引用溯源

**实现内容**

- 推理模型输出 `<think>` 时，流式阶段实时分流到可折叠面板。
- 回答正文保持干净。
- 模型输出“参考片段”后解析为可点击引用。
- 点击引用后展开来源面板并高亮对应切片。

**源码证据**

- `src/utils/streamingThinkParser.ts`
- `src/utils/parseCitations.ts`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/SourceChunks.vue`

**简历写法**

> 实现 AI 回答流式交互细节：支持 `<think>` 推理块实时分流展示，并将 RAG 回答中的参考片段解析为可点击引用，联动来源面板定位和高亮对应知识切片。

## 7. 组件边界设计

当前聊天模块可以这样讲边界：

```text
ChatView
  容器组件，负责页面布局、组合 composable 和子组件。

useChatSession
  管理会话、知识库、QA 配置。

useChatMessages
  管理消息、RAG 检索、流式生成、停止/重新生成。

ChatInput
  负责输入框、发送、停止、重新生成按钮。

ChatMessageList
  负责消息列表、滚动吸底、引用点击交互。

AssistantMarkdown
  负责 AI Markdown 增量渲染。

SourceChunks
  负责来源片段展示、定位、高亮。

utils/*
  负责纯函数算法，如切片、检索、RRF、SSE 解析、Markdown 拆分。
```

**简历写法**

> 设计聊天模块组件与逻辑边界：以 `ChatView` 作为容器层，业务状态下沉到 `useChatSession/useChatMessages`，输入、消息列表、Markdown 渲染和来源面板拆成独立组件，核心算法沉淀为可测试纯函数。

**面试话术**

> 我拆组件不是按 UI 碎片随意拆，而是按变化原因拆：会话和配置变化是一类，消息和流式生成是一类，Markdown 渲染和来源面板是展示细节。这样后续改检索逻辑不会影响输入组件，改 Markdown 渲染也不会影响会话管理。

## 8. 前端可观测

**已经具备的能力**

- Web Vitals 近似指标：LCP / CLS / INP。
- QA 链路分段耗时：检索完成、首 token、流式结束。
- 上报上下文：`qa_mode`、`source_count`、`answer_length`、`status`、`aborted`。
- 错误入口：`window.error`、`unhandledrejection`、Vue `errorHandler`。
- 统一埋点管道写入 `analytics_events`。

**源码证据**

- `src/utils/perfMetrics.ts`
- `src/utils/errorMonitor.ts`
- `src/utils/tracker.ts`
- `src/constants/analyticsEvents.ts`
- `supabase/sql/004_analytics_events.sql`

**简历写法**

> 建立前端可观测链路：采集 Web Vitals、AI 问答检索耗时、TTFT、流式总耗时和前端异常，并结合 qa_mode/source_count/status 等上下文上报，辅助定位体验瓶颈。

**面试话术**

> AI 应用不能只看接口总耗时。用户最敏感的是首 token，所以我把 QA 链路拆成检索耗时、TTFT 和流式耗时。这样后续可以判断慢是慢在检索、模型首包，还是前端渲染。

## 9. 工程化与测试

**已经具备的能力**

- Vitest 覆盖核心纯函数。
- Playwright 全 mock Supabase/Auth/PostgREST/Edge Function SSE。
- GitHub Actions 执行 lint、单测、构建、E2E。
- Vite 路由懒加载和 manualChunks。
- Element Plus 按需引入。

**源码证据**

- `src/utils/__tests__/`
- `e2e/chat.spec.ts`
- `playwright.config.ts`
- `.github/workflows/ci.yml`
- `vite.config.ts`

**简历写法**

> 建立前端工程化测试体系：使用 Vitest 覆盖切片、检索、RRF、SSE、引用解析、Markdown 增量渲染和 think 状态机等纯函数；使用 Playwright 全 mock 后端验证聊天流式关键路径，并通过 CI 自动执行 lint、测试和构建。

**当前验证**

- `npm test`：118 passed。
- `npm run build`：通过。

## 10. 目前欠缺与建议补强

### 10.1 缺少性能 benchmark 数据

现在能讲设计，但还缺实测数字。建议补 4 组：

```text
1. IndexedDB 缓存命中前后请求体积
2. Worker vs 主线程检索耗时
3. Markdown 全量渲染 vs stable/tail 增量渲染耗时
4. build chunk 体积变化
```

有数据后可以写：

```text
缓存命中后 embedding 传输从 MB 级下降到 KB 级。
Worker 化后避免向量检索造成主线程长任务。
长回答渲染由全文解析优化为尾段更新。
```

### 10.2 缺少 RAG 引用溯源 E2E

建议补一个前端闭环 E2E：

```text
mock knowledge_chunks
-> 发送问题
-> mock 流式回答包含“参考片段”
-> 点击引用角标
-> 来源面板展开
-> 对应切片高亮
```

补完后可以写：

> Playwright 覆盖 RAG 回答从流式生成到引用溯源定位的完整前端交互闭环。

### 10.3 Markdown 安全边界需要确认

面试可能会问：

- AI 输出是否直接 `v-html`？
- Markdown 是否 sanitizer？
- 链接是否限制协议？
- XSS 怎么防？

如果源码里已经安全处理，可以写；如果没有，不要吹。建议后续补一层明确的 sanitizer 或安全配置。

### 10.4 大规模能力不要硬吹

前端岗位可以讲浏览器侧优化，但不要说单靠前端支持无限规模。

稳妥说法：

> 当前前端优化适合中小规模知识库；更大规模检索应迁移到 pgvector/RPC 等服务端向量检索。我的工作重点是浏览器侧性能优化和 AI 问答交互闭环。

## 11. 前端岗位版简历写法

### 11.1 项目描述

```text
AI 知识库问答平台｜Vue 3 + TypeScript + Supabase
负责 AI 问答前端核心闭环，覆盖知识库选择、问答配置、流式回答、Markdown 渲染、引用溯源、会话管理、浏览器侧检索性能优化和前端可观测。
```

### 11.2 推荐 bullet

```text
- 拆分聊天页复杂状态管理，通过 useChatSession 管理会话/知识库/QA 配置，通过 useChatMessages 管理消息收发、RAG 检索、流式生成、停止生成和重新生成逻辑。
- 使用 IndexedDB 缓存知识切片 embedding，并基于服务端 id 与本地缓存 id diff 实现增量拉取和失效淘汰，减少重复网络传输和 JSON 解析成本。
- 将向量相似度计算与关键词评分下放 Web Worker，结合 Float32Array 矩阵与 Transferable 降低主线程阻塞和跨线程拷贝成本。
- 手写 OpenAI-compatible SSE 流式解析，处理 UTF-8 跨 chunk 解码、SSE 事件边界缓冲和 AbortController 停止生成。
- 通过 requestAnimationFrame 合并高频 chunk 更新，并将 Markdown 拆分为 stable/tail 片段，优化 AI 长回答流式渲染性能。
- 构建 RAG 回答引用溯源交互，解析模型输出的参考片段编号，联动来源面板定位并高亮对应知识切片。
- 建立前端可观测和测试体系，采集 Web Vitals、检索耗时、TTFT、流式耗时和前端异常，并使用 Vitest/Playwright 覆盖核心纯函数和聊天关键路径。
```

### 11.3 最精简 4 条

```text
- 负责 AI 问答前端核心闭环，覆盖知识库选择、流式回答、停止生成、重新生成、Markdown 渲染和引用溯源。
- 使用 IndexedDB + Float32Array 缓存知识切片 embedding，并通过 id diff 实现增量拉取和本地失效淘汰。
- 将向量检索和关键词评分下放 Web Worker，结合 Float32Array 矩阵与 Transferable 降低主线程阻塞。
- 手写 SSE 流式解析，并通过 rAF 合帧与 Markdown stable/tail 增量渲染优化 AI 长回答体验。
```

## 12. 前端面试回答模板

### 12.1 你这个 AI 项目里主要做了什么前端工作？

> 我负责的是 AI 问答前端核心闭环，而不是模型本身。包括知识库选择、问答配置、用户提问、流式回答、停止生成、重新生成、Markdown 渲染、think 推理块分流、引用溯源和来源高亮。实现上我把状态拆成 `useChatSession` 和 `useChatMessages`，展示拆成输入、消息列表、Markdown 和来源面板组件，核心算法抽成纯函数做测试。

### 12.2 你做了哪些前端性能优化？

> 主要有三类。第一是 IndexedDB 缓存 embedding，避免每次问答重复拉全量向量。第二是把向量相似度和关键词评分放到 Web Worker，并用 Float32Array 矩阵和 Transferable 降低跨线程传输成本。第三是流式渲染优化，用 rAF 合并高频 chunk 更新，并把 Markdown 拆成稳定段和尾段，避免长回答全文重解析。

### 12.3 为什么说不是简单调 AI API？

> 简单调 API 是“用户问题 -> 模型 -> 回答”。这个项目在前端侧做了完整链路：先检索知识库，向量召回和关键词召回融合，再构造带参考资料的 Prompt；回答过程中做 SSE 流式解析、停止生成、Markdown 增量渲染；回答后保存 sources 并支持引用定位。AI API 只是生成环节，前端负责了检索、交互、性能和可信溯源闭环。

### 12.4 如果数据量更大怎么办？

> 当前前端方案适合中小规模知识库。我在前端侧做了 IndexedDB、Worker 和 TypedArray 优化，目标是提升浏览器侧体验。但如果进入万级以上切片，应该把向量检索迁移到服务端 pgvector/RPC，前端只负责 query、流式展示和引用交互。我不会把纯前端方案包装成无限规模架构。

## 13. 最终总结

前端岗位最稳的包装方式是：

> 这是一个 AI/RAG 业务背景下的复杂前端应用。我负责把大模型问答做成可交互、可验证、性能可控、状态清晰、可观测和可测试的前端产品闭环。

这句话比“我做了一个 AI/Agent 项目”更适合前端岗位，也更不容易被追问穿。
