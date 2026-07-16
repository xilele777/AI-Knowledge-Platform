# AI Knowledge Platform 求职面试手册（前端岗）

> 用途：**面试唯一入口**——简历定稿、实测数据、亮点详解、问答话术、追问底牌全在这一份。学习路径与逐条论证见 [top5-highlights-analysis.md](top5-highlights-analysis.md)。
> 口径原则：只讲源码中真实存在的能力，所有数字均有实测或代码依据；对未完成、有边界的点，主动说明取舍。
> 沿革：由 `resume-highlights.md`、`frontend-interview-highlights.md`、综合手册与 `project-development-manual.md`（开发手册）合并而成；开发手册中对面试有用的内容已并入第 12/13 节，纯开发内容（启动部署、建表字段全表、改动指引）已删除，需要时从 git 历史找回。2026-07-06 微基准实测数据已回填。

## 目录

1. 项目定位
2. 简历怎么写（含定稿五条）
3. 实测数据速查
4. 第一梯队亮点详解
5. 第二梯队亮点
6. 前端 JD 对齐表
7. 2 分钟项目介绍稿
8. 面试高频问答
9. STAR 话术
10. 边界与不要吹的点
11. 补强清单
12. 项目全貌速览（追问底牌）
13. 关键文件地图
14. 面试前 5 分钟速记

## 1. 项目定位

这是一个基于 **Vue 3 + TypeScript + Supabase** 的 AI 知识库/RAG 问答平台。用户可以创建 Markdown 文档或上传 txt/md 文件，系统将内容切片并可选生成 embedding；用户提问时先从知识库召回相关片段，再构造带参考资料的 Prompt，通过 Supabase Edge Function 代理 OpenAI-compatible API 进行 SSE 流式回答，并保存来源片段用于引用溯源。

最稳的总定位（简历、面试通用）：

> 这个项目不是自研大模型，也不是自研 Agent 框架，而是把大模型 API 包装成一个具备知识入库、检索增强、流式交互、引用溯源、权限隔离、性能优化、可观测和测试保障的完整 AI 应用。

前端岗位定位：

> 懂 AI/RAG 业务链路的前端工程师，能在浏览器侧处理复杂数据、流式内容、长文本渲染、复杂状态和工程化质量。

推荐简历标题：

```text
AI 知识库平台 / RAG 问答系统
Vue 3 + TypeScript + Supabase + Edge Functions + OpenAI-compatible API
```

不要把主线讲成「我做了一个高并发 AI 后端 / 自研 Agent / 自研大模型」，应该讲成：

> 我负责 AI 知识库问答的前端核心闭环，包括知识库选择、问答配置、消息状态、流式响应、停止生成、Markdown 渲染、think 分流、引用溯源、来源高亮、性能优化和前端可观测。

## 2. 简历怎么写

### 2.1 主打五条（定稿推荐）

按「业务链路 → 交互 → 性能 → 深度 → 质量」的叙事顺序排列。每条都经过代码逐条核实（2026-07-06），数字来源见第 3 节。

**与 LabelHub 项目并列时的首选表述**（定稿，2026-07-10；同构小标题 + 问题→方案→结果，已针对两项目去重与 API 边界审计；Typst 粘贴版在 docs/项目描述v1.md，字节式动作风格版在 docs/项目描述v2.md——两种风格二选一，整份简历保持统一）：

- **检索增强**：实现向量 + 中文 N-gram 关键词双路混合检索，RRF（k=60）名次融合、召回不足自动降级通用回答；指代追问经 LLM 改写再检索，2.5s 超时回退原句。
- **流式交互**：EventSource 不支持 POST 与鉴权头，基于 fetch + ReadableStream 手写 OpenAI 兼容 SSE 解析，处理 UTF-8 解码与事件边界跨 chunk，AbortController 停止生成；长回答逐帧全文重解析越答越卡，rAF 合帧 + Markdown 稳定段/尾段增量渲染 + think 推理分流，实测 3.9 万字符长回答增量切分累计仅 13ms。
- **向量缓存**：每轮问答重复拉取全量 embedding（约 3MB）浪费网络与解析，利用切片不可变特性（重建即整批删旧插新）做服务端与本地 id 集合 diff，增量拉取、失效淘汰，向量以 Float32Array 存储，缓存命中后单轮传输降至 KB 级；IndexedDB 不可用自动回退全量拉取。
- **计算卸载**：向量相似度与关键词评分下放 Web Worker，embedding 打包为连续 Float32Array 矩阵、经 Transferable 转移 ArrayBuffer 避免大数组结构化克隆，源向量不转移防 detach；实测 1536 维 2000 条切片约 9ms，为知识库规模增长与低端设备预留主线程余量。
- **工程质量**：核心算法沉淀为纯函数，118 个 Vitest 用例覆盖切片/双路评分/RRF 融合/SSE 解析/流式切分，Playwright 全 mock 后端、无密钥跑通「登录→提问→流式回答」关键路径；线上按检索/首 token（TTFT）/流式三段计时定位 AI 链路瓶颈，CI 自动把关。

针对 LabelHub 的去重要点：**计算卸载**强调检索计算 + Transferable 矩阵 + 实测，与 LabelHub「导出序列化卸载」区分（LabelHub 侧建议去掉「Worker 异常主线程兜底」尾句，避免两条同尾）；**工程质量**把 TTFT 分段计时顶前、不写 Web Vitals（该维度由 LabelHub 的线上监控承担），与 LabelHub「CI 体积检查 + Web Vitals」区分；不含分包条（首屏维度由 LabelHub 承担）。

以下为完整句式版（单独成篇或非并列场景）：

```text
- 实现客户端 RAG 检索链路：Embedding 向量召回与中文 N-gram 关键词召回并行，基于 RRF（k=60）按排名融合双路结果、规避分数量纲问题，按召回质量自动切换知识增强/通用回答模式；针对多轮追问实现指代消解查询改写（仅用于检索，2.5s 超时回退原句）。
- 手写 OpenAI-compatible SSE 流式解析：基于 fetch + ReadableStream + TextDecoder(stream) 处理 UTF-8 跨 chunk 解码与事件边界缓冲，AbortController 支持停止生成；渲染侧以 rAF 合帧收敛高频更新，Markdown 按 stable/tail 增量解析并支持 <think> 推理块实时分流（实测 3.9 万字符回答 164 次流式切分累计仅 13ms）。
- 设计 IndexedDB 向量缓存：利用知识切片不可变特性（重建时整批删旧插新），以服务端与本地 id 集合 diff 实现增量拉取和失效淘汰，向量以 Float32Array 存储；缓存命中后单轮问答的 embedding 网络传输由约 3MB 降至 KB 级。
- 将向量相似度与关键词评分下放 Web Worker：多条 embedding 打包为连续 Float32Array 矩阵，经 Transferable 转移 ArrayBuffer 避免大数组结构化克隆，Worker 异常自动降级主线程；实测 1536 维 2000 条切片矩阵计算约 9ms，为知识库规模增长与低端设备预留主线程余量。
- 建立测试与可观测体系：核心算法沉淀为纯函数并以 118 个 Vitest 用例覆盖，Playwright 全 mock 后端（注入登录态、拦截 PostgREST/SSE）覆盖登录→提问→流式回答关键路径；采集 Web Vitals 与问答链路分段耗时（检索/TTFT/流式），前端错误三入口捕获并指纹去重限频，CI 自动执行 lint/单测/构建/E2E。
```

备选第 6 条（注意：另一项目 LabelHub 已有 -78% 的分包条，同一份简历不建议再写本条，仅作口头补充）：

```text
- 通过路由懒加载、Element Plus 按需引入与 manualChunks 定向分包，首屏 JS 由 1.24MB 降至 0.70MB（gzip 399KB → 222KB，-44%）。
```

定稿注意事项（2026-07-06 逐条核实后的结论）：

1. Worker 条叙事是「规模上限/低端设备预留」，不写「解决卡顿」——实测 500 条仅约 2ms，主线程本来不卡；面试主动报实测数字是加分项。
2. E2E 用精确表述「全 mock E2E 覆盖登录→提问→流式回答关键路径」（实际 1 个 spec、2 个用例），不写「覆盖核心链路」。
3. 不写内部函数名（如 packEmbeddingMatrix）和「一键转移」这类表述；测试规模只留「118 用例」。
4. 切片（300-500 字三级切分）含金量最低，压缩进项目描述即可，不单独占一条。
5. 引用溯源写进项目描述行，不单独占一条。

### 2.2 项目描述（前端岗位版）

```text
AI 知识库问答平台｜Vue 3 + TypeScript + Supabase
负责 AI 问答前端核心闭环：文档/文件切片入库、知识库选择、问答配置、RAG 检索、流式回答、Markdown 渲染、引用溯源、会话管理、浏览器侧检索性能优化和前端可观测。
```

### 2.3 最精简 4 条（版面紧张时）

```text
- 实现客户端 RAG 检索：向量 + 中文关键词双路召回，RRF 融合，按召回质量自动分流回答模式。
- 使用 IndexedDB + Float32Array 缓存知识切片 embedding，id diff 增量拉取，缓存命中后单轮网络传输由约 3MB 降至 KB 级。
- 将向量检索计算下放 Web Worker，Float32Array 矩阵 + Transferable 传输，异常自动降级主线程。
- 手写 SSE 流式解析与停止生成，rAF 合帧 + Markdown stable/tail 增量渲染优化 AI 长回答体验。
```

### 2.4 完整版 6 条（详细版简历）

```text
- 基于 Vue 3 + TypeScript + Supabase 搭建 AI 知识库平台，覆盖文档管理、知识库入库、RAG 问答、AI 写作、共享广场和管理后台。
- 设计 RAG 检索链路：文档/文件切片、Embedding、向量召回、中文 N-gram 关键词召回、RRF 秩融合，并根据召回质量自动切换知识增强/纯 AI 模式。
- 实现 IndexedDB 向量缓存：利用切片不可变特性进行服务端 id 与本地缓存 diff，减少重复下载全量 embedding；向量以 Float32Array 存储并参与 Worker 矩阵计算。
- 将检索重计算下放 Web Worker，向量打包为 Float32Array 矩阵后通过 Transferable 传输，Worker 不可用时自动降级主线程，保证可用性。
- 实现流式问答体验：手写 SSE 解析与中断、rAF 合帧、Markdown stable/tail 增量渲染、<think> 推理块分流和引用溯源定位。
- 建立工程质量与可观测体系：118 个 Vitest 用例覆盖核心纯函数，Playwright 全 mock 后端验证聊天关键路径，采集 Web Vitals、QA 检索/TTFT/流式耗时和前端错误。
```

### 2.5 不建议写与必须降级的表述

| 不建议写法 | 问题 | 更稳写法 |
| --- | --- | --- |
| 自研大模型 / 自研 LLM | 实际调用 OpenAI-compatible API | 集成 OpenAI-compatible API，重点实现 RAG 应用工程链路 |
| 自研 Agent 框架 | 没有工具调用规划、任务分解框架 | 支持多轮上下文、问题改写和知识增强问答 |
| 企业级向量数据库 | embedding 存 Postgres array，检索在客户端 | 客户端向量检索与缓存优化；大规模场景可演进 pgvector |
| API Key 加密存储 | 当前是 RLS 隔离 + Edge Function 代理 | API Key 通过 RLS 限制本人可见，并由 Edge Function 代理使用 |
| 支持任意文档解析 | 当前主要 txt/md 和 Markdown | 支持 txt/md 文本文件和 Markdown 文档入库 |
| 高并发后端架构 | Supabase BaaS + Edge Function | 基于 Supabase Auth/DB/RLS/Edge Functions 快速构建服务端能力 |
| 解决大模型幻觉 | RAG 不能根治幻觉 | 通过参考资料约束和引用溯源提升可验证性 |
| Worker 解决主线程卡顿 | 实测 500 条仅 ~2ms，本来不卡 | 为规模增长和低端设备预留主线程余量 |

## 3. 实测数据速查

面试时主动报数字比形容词有说服力。以下数据均可复现。

### 3.1 微基准（2026-07-06 实测）

复跑命令：

```bash
RUN_PERF_BENCH=1 npx vitest run src/utils/__tests__/perf.manual.test.ts
```

桌面 Node 环境中位数：

| 项目 | 结果 |
| --- | --- |
| 矩阵打包 + 余弦 top8（1536 维） | 100 条 ≈1ms，500 条 ≈2ms，1000 条 ≈3ms，2000 条 ≈9ms |
| Markdown 流式切分 | 39k 字符、164 次增量更新累计 13ms（≈0.08ms/次） |

数据怎么讲（重要）：

- 500 条规模主线程计算并不卡（约 2ms），所以 **Worker 的叙事是「规模上限和低端设备预留」，不是「解决卡顿」**。主动讲清这一点反而体现测量意识。
- 缓存的真实收益在**网络传输**：500 条 × 1536 维 float 的 JSON 每轮约 3MB，缓存命中后只拉 id 列表，降到 KB 级。

### 3.2 构建分包（README 记录）

- 首屏 JS：1.24MB → 0.70MB
- gzip：399KB → 222KB（约 -44%）
- 手段：路由懒加载、Element Plus 按需引入、manualChunks 仅分组首屏共享库（vendor-element-plus、vendor-supabase），ECharts/md-editor 等交给自动分包

### 3.3 测试与验证状态

- `npm test`：118 个 Vitest 用例通过
- `npm run build`：通过
- E2E：1 个 spec（e2e/chat.spec.ts），全 mock 后端，覆盖登录→提问→流式回答→think 面板关键路径
- 待积累：线上 qa_perf 事件的 TTFT/检索耗时 P50/P95（埋点已在采集，管理后台图表未做）

## 4. 第一梯队亮点详解

第一梯队标准：源码里有真实实现；能讲清设计取舍；面试官追问边界、失败场景、成本时能接住。

### 4.1 RAG 双路召回与 RRF 融合

**核心结论**

项目不是把用户问题直接丢给 AI，而是实现了客户端 RAG 检索链路：文档切片、embedding 入库、向量召回、中文 N-gram 关键词召回、RRF 融合和召回质量判断。

**实现链路**

```text
文档/文件
  -> chunkText 切片（300-500 字，段落->句子->硬切三级）
  -> 可选生成 embedding
  -> 写入 knowledge_chunks

用户提问
  -> 必要时多轮查询改写
  -> 向量召回 top8 + 中文关键词召回 top8（并行）
  -> RRF 融合：score(d) = Σ 1/(k + rank_i(d))，k=60，取 top5
  -> 判断召回质量
  -> 构造 knowledge-enhanced prompt 或降级 general-ai
```

**算法细节（追问底牌）**

- 切片：统一换行清理 -> 按空行分段 -> 超长段按中英文标点拆句 -> 仍超长硬切 -> 短片段向后合并凑 minLength。不按 token 切是因为未引入 tokenizer，中文场景字符长度可粗略控制上下文体积——复杂度与收益的折中。
- 关键词评分：问题归一化后取英文/数字 token、中文连续词和 2-4 gram、去停用词；每个切片算 keywordScore（命中数/关键词数）、exactMatchScore（完整问题命中加分）、densityScore（命中数/√切片长度）。
- 召回价值门槛：top.score >= 0.1 且 top.hitCount >= 2 且 averageScore >= 0.06，不达标不算有效召回。
- 改写调用参数：temperature=0、maxTokens=120、2.5s 超时。
- Prompt：knowledge-enhanced 模式把片段按「【片段 x】」注入，要求优先使用资料、末尾输出「参考片段: [片段x,片段y]」。
- embedding 模型选择：用户配置的 model 名含 "embedding" 则直接使用，否则默认 text-embedding-3-small（由 Edge Function 代理调用）。

**源码证据**

- `src/utils/chunkText.ts`
- `src/utils/retrieveChunks.ts`
- `src/utils/similarity.ts`
- `src/utils/fuseRetrieval.ts`
- `src/utils/buildQaPrompt.ts`
- `src/views/chat/composables/useChatMessages.ts`

**面试讲法**

> 向量召回擅长语义相似，但对专有名词、缩写、版本号不一定稳定；关键词召回擅长精确命中，但不懂语义改写。所以我把两路召回都保留，各取 topK，再用 RRF 按排名融合，避免不同分数量纲带来的归一化调参问题。k=60 是 RRF 论文的经验值——我「设计」的是双路架构和质量门槛，不是算法本身，这点主动说清楚更稳。

质量门槛的产品思维：不是选了知识库就强行塞低质量片段，低质量召回会误导模型，所以召回不达标时自动降级 general-ai。

**边界**

当前 embedding 存 Postgres `double precision[]`，检索主要在客户端完成，适合中小型知识库。万级以上切片应演进到 pgvector/RPC 服务端检索。

### 4.2 SSE 流式解析 + 长回答渲染优化

**核心结论**

不靠 SDK 黑盒，自己处理 OpenAI-compatible SSE：`fetch + ReadableStream + TextDecoder(stream)`、事件边界缓冲、AbortController 中断、rAF 合帧和 Markdown stable/tail 增量渲染、`<think>` 分流。

**实现要点**

- `fetch` 而不是 `EventSource`：需要 POST body 和 Authorization header。
- `TextDecoder.decode(value, { stream: true })`：处理 UTF-8 多字节字符跨 chunk。
- buffer 按空行拆 SSE event：处理事件边界跨 chunk；malformed event 忽略不中断。
- 兼容 `delta.content`、`message.content`、`text` 等不同 OpenAI 兼容返回。
- rAF 合帧：chunk 到达只累加文本，一帧最多一次响应式更新。
- Markdown stable/tail：按围栏状态机找最后一个代码块外的空行，稳定段不重复解析，只重渲染尾段；未闭合代码块合成闭栏避免样式跳变。
- `<think>` 分流：每帧解析累积全文（支持标签跨 chunk），半截标签临时隐藏，推理进可折叠面板，落库保存原始全文。

**源码证据**

- `src/api/ai.ts`
- `src/utils/serverProxy.ts`
- `src/utils/streamingMarkdown.ts`
- `src/utils/streamingThinkParser.ts`
- `src/views/chat/composables/useChatMessages.ts`
- `src/views/chat/components/AssistantMarkdown.vue`

**面试讲法**

> 用 fetch 读 stream 要处理两个边界：中文字符可能跨 chunk，SSE event 也可能跨 chunk。所以 TextDecoder 要用 stream 模式，SSE event 要用 buffer 按空行切。渲染卡顿有两层原因：chunk 高频触发响应式更新，以及每次更新都全文 Markdown 解析。rAF 合帧解决更新频率，stable/tail 切分解决单帧解析量，两个优化解决的是不同维度。

**边界**

超长代码块内部没有安全切分点，增量渲染会退化为全文解析。这属于前端流式体验优化，不是模型推理能力。

### 4.3 IndexedDB 向量缓存 + Float32Array

**核心结论**

针对「每次问答重复拉取全量 embedding」做 IndexedDB 向量缓存，利用知识切片不可变特性做 id diff，一致性逻辑清晰、无需版本号或 TTL。

**实现链路**

```text
服务端只查当前知识库 chunk id 列表
  -> 本地 IndexedDB 查已缓存 id
  -> serverIds - cachedIds = missingIds（增量拉取）
  -> cachedIds - serverIds = staleIds（异步淘汰）
  -> missing 过半则整表拉取
  -> 按服务端 id 顺序恢复切片列表
```

**源码证据**

- `src/utils/embeddingCache.ts`
- `src/api/chat.ts`

**面试讲法**

> 缓存一致性最怕可变数据。我先观察切片写路径，发现文档重新同步时是删除旧切片再插入新切片、从不 update，所以 chunk id 可以作为一致性依据，集合 diff 就够了。缓存里只放稳定字段和 embedding；文件名、文档标题可变，不进缓存，展示时新鲜查询。

为什么不用 localStorage：同步 API 阻塞主线程、容量小、不能原生保存 TypedArray。
为什么用 Float32Array：IndexedDB 支持结构化存储 TypedArray，比 JSON `number[]` 体积小得多，传给 Worker 时可直接打包矩阵。

**边界**

IndexedDB 不可用时回退全量拉取，可用性优先。这不是强一致缓存系统。

### 4.4 Web Worker + Float32Array 矩阵 + Transferable

**核心结论**

检索计算下放 Web Worker，多条 embedding 打包成连续 `Float32Array` 矩阵，通过 Transferable 转移 `ArrayBuffer`。叙事重点是「规模余量」而非「解决卡顿」（见 3.1 实测）。

**源码证据**

- `src/utils/retrievalWorkerClient.ts`
- `src/workers/retrieval.worker.ts`
- `src/utils/similarity.ts`

**面试讲法**

> Worker 本身不是亮点，关键是跨线程传什么。传 `number[][]` 会触发大量结构化克隆，所以我把 n 条向量复制进一个连续矩阵，只 transfer 一个 buffer——传输成本从「复制数据」变成「转移所有权」。源缓存向量不直接 transfer，因为 transfer 后源 buffer 会 detach，缓存还要给后续调用用。Worker 不存在、创建失败、运行时报错都会回退主线程同步计算，性能优化不能成为可用性单点。
>
> 我实测过：1536 维下 500 条约 2ms、2000 条约 9ms。所以我不说 Worker 解决了卡顿——当前规模主线程本来不卡，这是为知识库增长和低端设备预留的余量。

**边界**

浏览器端中小规模检索优化，更大规模应迁移到数据库或后端向量检索服务。

### 4.5 多轮查询改写 + 引用溯源可信闭环

**核心结论**

补了 RAG 两个很实际的问题：多轮追问「那它怎么部署？」直接检索会失败，所以检索前做指代消解改写；RAG 回答要能核对来源，所以保存 sources 并做引用定位。

**实现链路**

```text
多轮问题
  -> 触发条件：有历史 且（问题长度 <= 12 或含指代词：它/这个/上述/该方案等）
  -> 低成本 LLM 改写为自包含 query（temperature=0，maxTokens=120，2.5s 超时）
  -> 改写结果只用于检索；展示和落库保留用户原句
  -> 失败/超时回退原句

RAG 回答
  -> Prompt 要求末尾输出「参考片段: [片段x, 片段y]」
  -> 保存 sources / answerMode
  -> parseCitations 宽容解析（全角/半角冒号、有无空格、去重、越界过滤、解析不出不改原文）
  -> 点击引用角标定位并高亮来源切片
```

**源码证据**

- `src/utils/rewriteQuestion.ts`
- `src/utils/parseCitations.ts`
- `src/views/chat/components/ChatMessageList.vue`
- `src/views/chat/components/SourceChunks.vue`

**面试讲法**

> LLM 回答能看到历史，但检索器只拿「它怎么部署」去查会失败。所以我在检索前做 query rewriting，但不是每次都调模型，而是命中短问题或指代词条件才触发，失败超时回退原句。引用不是模型天然给的能力，而是「检索 sources -> Prompt 要求引用 -> 回答解析引用 -> UI 定位」的闭环，任何一段断了体验都会断。

**边界**

不能说「解决幻觉」，只能说「通过参考资料约束和引用溯源提升回答可验证性」。改写依赖 LLM，有额外成本，已做触发收窄和超时降级。

### 4.6 多级降级韧性 + 可观测 + 测试覆盖

**降级策略**

- 查询改写失败/超时 -> 回退原问题
- 向量召回失败 -> 关键词召回兜底
- Worker 不可用或崩溃 -> 主线程计算兜底
- IndexedDB 不可用 -> 全量拉取兜底
- 管理端 Edge Function 失败 -> RPC fallback
- Supabase env 缺失 -> 应用可启动，API 操作时报明确错误
- 旧 schema 字段不一致 -> fallback payload 或基础字段读写

**可观测指标**

- Web Vitals 近似指标：LCP / CLS / INP（PerformanceObserver，visibilitychange/pagehide 上报）
- QA 链路分段耗时：`retrieval_ms`（提问到检索完成）、`ttft_ms`（检索完成到首 token）、`stream_ms`（首 token 到流结束），同时写 performance.mark/measure
- 上报上下文：`qa_mode`、`source_count`、`answer_length`、`status`、`aborted`
- 错误三入口：`window.onerror`、`unhandledrejection`、Vue `errorHandler`；同指纹最多 3 次、会话最多 30 次、消息截断、监控自身异常静默
- 统一埋点管道写入 `analytics_events`，埋点失败不影响主流程

**测试**

- Vitest 118 用例：chunkText、embeddingCache、chatHistory、fuseRetrieval、parseCitations、rewriteQuestion、retrieveChunks、similarity、SSE 解析、streamingMarkdown、streamingThinkParser
- Playwright 全 mock：localStorage 注入 session，page.route 拦截 Auth/PostgREST/Edge Function SSE，无密钥可跑；验证未选知识库时不请求 knowledge_chunks
- CI 双 job：lint + 单测 + 构建 / E2E（失败上传报告）

**源码证据**

- `src/utils/perfMetrics.ts`、`src/utils/errorMonitor.ts`、`src/utils/tracker.ts`
- `src/utils/__tests__/`、`e2e/chat.spec.ts`、`.github/workflows/ci.yml`

**面试讲法**

> AI 应用不能只看接口总耗时。用户最敏感的是首 token，所以我把 QA 链路拆成检索耗时、TTFT 和流式耗时，这样能判断慢在检索、模型首包还是前端渲染。核心算法抽成纯函数，测试不需要 mock DOM 或真实网络，快、稳、能覆盖边界。

## 5. 第二梯队亮点

不抢简历第一屏，被问「还有什么工程细节」时展开。

### 5.1 复杂状态管理与组件边界

聊天页状态不是简单 `loading + data`：`activeChatId`、`selectedKnowledgeBaseId`、`messages`、`sending`、单条消息的 `streaming/done/error`、`AbortController`、`lastQuestion`（重新生成依赖）、`qaConfigForm`、来源高亮、新建会话草稿态。

拆分方式：

```text
ChatView            容器：布局、组合 composable 和子组件
useChatSession      会话、知识库、QA 配置、新建/删除/切换
useChatMessages     消息加载、发送、RAG 检索、流式生成、停止、重新生成、落库
ChatInput           输入、发送、停止、重新生成按钮
ChatMessageList     消息列表、滚动吸底、引用点击
AssistantMarkdown   AI Markdown 增量渲染
SourceChunks        来源片段展示、定位、高亮
utils/*             纯函数算法：切片、检索、RRF、SSE、Markdown 拆分
```

面试话术：

> 我拆组件不是按 UI 碎片随意拆，而是按变化原因拆：会话和配置变化是一类，消息和流式生成是一类，Markdown 渲染和来源面板是展示细节。改检索逻辑不会影响输入组件，改渲染也不影响会话管理。

追问准备：

- 为什么不全写在 ChatView？——会话/配置状态和消息/流式状态变化频率不同、职责不同，拆开更易维护和测试。
- 新建对话为什么不立刻落库？——点击新建只进入空白草稿态，发送第一条消息才创建真实会话，避免空会话。

### 5.2 Supabase Auth / RLS / Edge Function 代理

- 启动顺序：先注册 Pinia -> 恢复登录态 -> 再挂 router，减少刷新误跳登录页。
- 安全三层：前端路由守卫（体验层）、API 层 owner 过滤、数据库 RLS 强制 `auth.uid() = owner_id`。
- AI 调用由 Edge Function 代理：前端带 Auth Token 调用，服务端按用户身份读取 RLS 保护的 AI 配置再转发模型请求，前端不直连第三方模型端点。
- Edge Function 二次裁剪 history（最多 20 条 / 24000 字符）：客户端不可信，服务端做防御性成本保护。

面试口径：

> 前端路由守卫只是体验层，不能作为安全边界。真正的数据隔离靠 Supabase RLS、RPC 内的 admin 校验、Edge Function 里的 auth.getUser()。前端能被绕过，数据库策略不能。

### 5.3 管理端统计与运营分析

统计聚合放 Postgres RPC（内部做 admin 校验），Edge Function 标准化入口，前端失败时 fallback RPC；ECharts 路由级懒加载不进首屏。

### 5.4 文档/文件入库闭环

站内 Markdown 文档和 txt/md 文件双入口切片入库；`knowledge_documents` 维护文档-知识库桥接，记录 chunk 数、同步时间、标题快照；重新同步删旧插新（这正是缓存 id diff 成立的前提）。

### 5.5 兼容旧 schema 的防御式 API

`knowledge_files` 兼容 `file_path/storage_path`、`mime_type/file_type` 差异；`chat_messages` 新增列缺失时回退基础字段读写；SQL 迁移大量 `if not exists` 幂等。是兼容旧环境的防御式 API，不是灰度发布系统。

### 5.6 前端工程细节

- `useAsyncState`：统一 idle/loading/success/error/streaming，loading 防闪烁
- `apiDedupe`：同 key in-flight 请求复用 Promise
- `useConfirmDelete`：乐观删除、撤销窗口、失败恢复
- `useKeyboardShortcut`：Ctrl/Cmd/Mod 归一化、输入框误触保护
- `documentDraft`：版本化 localStorage key + 结构校验，保存成功后清理
- `useDarkMode` + theme.css：设计 token、暗色主题、偏好持久化

## 6. 前端 JD 对齐表

| 前端 JD 关键词 | 项目里对应的内容 | 应该怎么讲 |
| --- | --- | --- |
| 复杂业务前端 | AI 知识库问答、文档入库、会话管理、管理后台 | 负责 AI/RAG 问答前端核心闭环 |
| 性能优化 | IndexedDB、Web Worker、Float32Array、Transferable、rAF、Markdown 增量渲染、分包 -44% | 浏览器侧大数据与长回答渲染优化，有实测数字 |
| 复杂状态管理 | 会话、消息、streaming/done/error、AbortController、重新生成、来源高亮 | 按变化原因拆 composable，管理状态边界 |
| 组件设计 | ChatView、ChatInput、ChatMessageList、AssistantMarkdown、SourceChunks | 容器/展示/composable/utils 分层 |
| 网络与流式交互 | fetch stream、SSE 解析、TextDecoder、AbortController | 手写 OpenAI-compatible 流式解析和中断 |
| 工程化 | Vitest、Playwright、CI、TypeScript、Vite 分包 | 核心纯函数可测，E2E 覆盖关键交互 |
| 可观测 | Web Vitals、TTFT、检索耗时、流式耗时、错误上报 | 用真实用户指标定位体验瓶颈 |
| 安全意识 | Edge Function 代理、RLS、Markdown 输出边界 | 前端不直连模型端点；AI 输出安全谨慎表述 |

## 7. 2 分钟项目介绍稿

> 我做的是一个 AI 知识库平台，技术栈是 Vue 3、TypeScript、Element Plus、Pinia、Vue Router 和 Supabase。主线是用户创建 Markdown 文档或上传文件后，系统把内容切片并可选生成 embedding，写入知识库；用户提问时，前端从知识库召回相关片段构建 Prompt，再通过 Supabase Edge Function 代理 OpenAI 兼容接口，用 SSE 流式返回答案。
>
> 这个项目我重点做了四块。第一是 RAG 检索链路：文本切片、向量检索、中文 N-gram 关键词检索和 RRF 融合，多轮追问还做了检索前指代消解改写。第二是性能优化：embedding 进 IndexedDB 缓存、缓存命中后单轮网络传输从约 3MB 降到 KB 级，检索计算下放 Web Worker 并用 Transferable 传向量矩阵。第三是流式体验：手写 SSE 解析、支持中断、rAF 合帧、Markdown 增量渲染和 think 推理分流。第四是工程化：118 个 Vitest 单测、Playwright 全 mock E2E、CI，线上采集 Web Vitals、检索耗时、TTFT 和前端错误。
>
> 从架构取舍看，我没有一上来就引入自建后端和向量数据库，而是用 Supabase 快速完成 Auth、RLS、DB、RPC 和 Edge Functions，把复杂度集中在前端可控的 RAG 和流式体验上。这个方案适合中小规模知识库；如果切片规模上万，我会演进成客户端检索和 pgvector 服务端检索按阈值切换的混合架构。

## 8. 面试高频问答

### A. 项目定位类

**Q：你这个 RAG 和普通聊天有什么区别？**

普通聊天是用户问题直接给模型。本项目会先把文档/文件切成可检索片段并保存 embedding；问答时先召回相关片段，双路召回 RRF 融合后把片段作为参考资料注入 Prompt；回答后保存来源切片并支持引用定位。AI API 只是生成环节，项目重点是检索增强、流式交互和可验证来源闭环。

**Q：你这个 AI 项目里主要做了什么前端工作？**

我负责的是 AI 问答前端核心闭环，而不是模型本身：知识库选择、问答配置、流式回答、停止生成、重新生成、Markdown 渲染、think 分流、引用溯源和来源高亮。状态拆成 useChatSession 和 useChatMessages，展示拆成输入、消息列表、Markdown 和来源面板组件，核心算法抽成纯函数做测试。

**Q：为什么不用 LangChain？**

这个项目的目标是展示前端对 RAG 链路的可控能力，所以切片、检索、融合、Prompt 和流式解析都是源码级实现。LangChain 能加速原型，但会封装掉关键细节，比如前端缓存、Worker 检索、流式 Markdown 和引用定位。生产中如果团队已有 LangChain 生态，我会评估复用。

**Q：为什么不用后端统一做所有事情？**

后端统一做更适合大规模和强安全场景，但这个项目用 Supabase 做 BaaS，目标是快速完成闭环并体现前端深度。客户端检索让小规模知识库少一次服务端往返，还能利用 IndexedDB、Worker 和 TypedArray 优化体验。边界我也明确：大规模、敏感数据、复杂解析应迁到服务端。

### B. 检索与 RAG 类

**Q：为什么检索放前端，不直接用 pgvector？**

先澄清：embedding 生成和回答生成都在 Edge Function（服务端），放前端的只有「检索计算」这一段。这是约束下的选择，不是通用架构，四个前提让它在本项目成立：一是规模——个人知识库几百条切片，1536 维暴力余弦实测约 2ms，此规模 ANN 索引零收益；二是设施——没有自建后端，Supabase 下的服务端方案要么开 pgvector（小规模过度设计）、要么 Edge Function 每次拉全量计算（比客户端缓存后本地算更慢还多一跳）；三是数据归属——知识库数据本就属于用户本人，RLS 限制只能拉自己的切片，下发到本人浏览器没有额外暴露面（多租户绝不能这么做，单用户个人工具可以）；四是缓存红利——命中后检索零网络往返，弱网体验更好。边界同样明确：万级切片、多租户、数据不属于当前用户，任一条件出现即失效，应迁 pgvector——所以预留了阈值切换的演进路径。

**Q：为什么向量召回对专有名词不稳定？**

embedding 表达的是整句话的语义梗概。专有名词、缩写、型号这类低频词，模型学到的表征弱，在整句向量里占的权重也小——「RRF 是什么」的向量主要表达「询问某个东西的定义」这个句式含义，「RRF」本身贡献很小，同句式的其他片段可能排在真正含 RRF 的片段前面；「配置 Nginx 超时」和「配置 Redis 超时」的向量几乎一样，区分它们的恰恰是那个被稀释的专有名词。关键词检索按字面精确命中，正好补这个盲区——这就是双路召回的动机。

**Q：RRF 为什么比加权平均好？**

向量相似度和关键词评分量纲不同，强行加权需要归一化和调参，脆弱。RRF 只依赖排名，天然免归一化。k=60 是论文经验值。

**Q：多轮追问为什么要问题改写？**

检索器只能看到 query，看不到对话语境。用户问「那它怎么部署」时，「它」没有检索意义。改写把追问变成自包含问题，只用于检索，不改变用户看到的原句。为什么设 2.5s 超时——改写是检索前的一次额外网络调用，卡在关键路径上，它不完成检索就没法开始；改写只是优化，不值得让用户为它干等，超时或失败就回退原句检索，效果可能打折但可用性不打折（与 Worker 回退主线程、IndexedDB 回退全量拉取同一模式：优化不能成为可用性单点）。

**Q：你的向量检索有索引吗（HNSW/IVF）？**

没有，是全量暴力余弦计算——几百条 × 1536 维实测约 2ms，这个规模构建 ANN 索引是负收益。万级以上切片才需要索引，那时应该迁 pgvector（HNSW）做服务端检索，而不是在浏览器里造索引。什么时候不需要索引，和什么时候需要，都是规模判断问题。

**Q：你的关键词评分和 BM25 什么关系？**

是简化的密度评分：关键词命中率、完整问题命中加分、命中密度除以切片长度平方根，没有做 IDF——因为客户端没有全局词频表，且切片规模小，简化评分够用又便于单测。规模大了应该上 BM25 或服务端全文检索。这是有意简化，不是不知道 BM25。

**Q：真要迁 pgvector，怎么迁？**

不推翻重做，做阈值切换：保留客户端检索作为小库路径；新增 Supabase RPC（入参 knowledge_base_id / query_embedding / top_k，返回相似 chunks）；切片数超阈值走 RPC，小库仍走 IndexedDB + Worker；关键词路可留前端也可换服务端全文检索；RRF 融合逻辑复用，只是一路候选换成服务端。

**Q：如果模型乱答，怎么兜底？**

先提升召回质量：混合检索、RRF、多轮改写。再增强 Prompt 约束：要求基于资料回答并给出引用。再做模式约束：strict-knowledge 下没有高质量片段就提示知识库不足。最后承认边界：RAG 能降低不可核对输出的风险，但不能数学上保证模型不编。

### C. 缓存与 Worker 类

**Q：IndexedDB 缓存怎么保证一致性？**

依赖数据不变量：切片行不可变，重新同步是删旧插新、从不 update。所以只需对比服务端 id 集合和本地 id 集合：服务端有本地无就增量拉取，本地有服务端无就淘汰。不需要版本号或 TTL。

**Q：为什么 sourceName 不进缓存？**

文件名和文档标题可变，embedding 和 content 不变。缓存只存稳定字段，展示名每次按 fileId/documentId 新鲜查询，避免重命名后显示旧名称。

**Q：Worker 为什么还要降级？**

Worker 是性能优化，不应成为功能依赖。旧浏览器、构建异常、运行时报错都可能发生，失败时回主线程同步计算，最多变慢，不能让问答不可用。

**Q：Worker 真的解决了卡顿吗？**

（主动报实测）我测过：1536 维下 500 条约 2ms、2000 条约 9ms，当前规模主线程并不卡。Worker 的价值是为知识库规模增长和低端设备预留余量，同时把跨线程传输做对——矩阵打包 + Transferable，避免结构化克隆。

### D. 流式与渲染类

**Q：为什么不用 EventSource？**

EventSource 只能 GET，不能带 POST body 和 Authorization header。项目要通过 Edge Function 发带参数的 POST 请求，所以用 fetch + ReadableStream 手写解析。

**Q：SSE chunk 切在半个 UTF-8 字符怎么办？**

`TextDecoder.decode(value, { stream: true })`。stream 模式会保留不完整字节序列，等下一段补齐再解码。

**Q：chunk 切在半个 SSE event 怎么办？**

维护 buffer，新解码文本拼进去，按空行拆完整 event，最后一个不完整片段留在 buffer 等下一轮。

**Q：流式 Markdown 为什么会卡？怎么优化？**

两层原因：chunk 高频触发响应式更新；每次更新全文 Markdown 解析。先用 rAF 合帧降低更新频率，再用 stable/tail 切分让每帧只解析尾段。实测 39k 字符、164 次增量更新的切分成本累计只有 13ms。

**Q：`<think>` 跨 chunk 怎么解析？**

不按单个 chunk 解析，而是每帧解析累积全文，`<thi` + `nk>` 下一帧自然拼成完整标签；结尾半截标签临时隐藏，避免闪现残缺文本。落库保存原始全文，展示层再解析。

### E. 安全类

**Q：API Key 安全怎么做？**

用户配置存 `user_ai_config`，RLS 限制只有本人可读写；模型请求由 Edge Function 用用户 token 读取配置后代理，前端不直接把 Key 发给第三方模型端点。严格说不是应用层加密存储，后续可加服务端加密或密钥托管。

**Q：为什么 Edge Function 还要裁剪 history？**

前端裁剪是体验和成本优化，但客户端不可信。服务端再限最多 20 条、24000 字符，是防御性成本保护，避免绕过前端导致上游 token 成本失控。

### F. 工程化类

**Q：怎么保证测试稳定？**

核心算法抽成纯函数，Vitest 测边界，不需要 mock DOM 或真实网络。E2E 不依赖真实 Supabase 或 AI Key，Playwright route mock Auth、PostgREST 和 SSE，避免网络和模型输出的不确定性。

**Q：如果用户说回答慢，你怎么优化？**

先拆指标再定位：检索慢看 chunk 拉取、缓存命中率、Worker 耗时；首 token 慢看 Edge Function 到上游的 TTFT；总时长慢看模型输出速度和 maxTokens；渲染慢看合帧和增量渲染。项目里 QA timeline 埋点就是按这个分段设计的。

**Q：这个项目最能体现你前端能力的是哪里？**

不是页面数量，而是浏览器侧复杂链路处理：聊天页同时处理会话状态、知识库配置、RAG 检索、流式网络、停止生成、长文本渲染、think 分流、引用溯源和错误状态。我把它拆成 api、utils、composables 和展示组件，单测覆盖纯函数、E2E 覆盖关键路径。

**Q：如果让你重构，第一步做什么？**

第一步不动 UI，先补数据边界：补 `documents` 建表迁移让空库可一键初始化；把 API Key 升级为应用层加密或密钥托管;给知识库规模设阈值，超过走 pgvector。这些是系统边界问题，收益比堆页面高。

### G. 线上问题排查类

排查题的答题心法：先按链路切层定位，再落到具体模块，不要泛泛说「看日志」。

**Q：登录后一直跳登录，怎么排查？**

先分三类：认证态恢复失败、路由守卫误判、权限角色不足。项目里登录态由 user store 统一恢复（先 Pinia、恢复 session、再挂 router），守卫只消费 store 的 isLoggedIn/isAdmin，排查点很集中：env 配置 -> Supabase client 初始化 -> initialize() 是否恢复 session -> 守卫重定向逻辑 -> admin 页再看 role 判断。

**Q：AI 问答没有返回，怎么定位？**

按链路切：AI 配置完整性 -> 是否创建/选择会话 -> 是否选知识库和问答模式 -> 切片是否取到 -> 检索是否异常 -> Edge Function 是否调用成功 -> SSE 是否解析到 delta -> 消息是否落库。常见原因：没配 apiKey/baseUrl、知识增强模式下知识库无切片、Edge Function 读不到配置（Authorization 或 RLS 问题）、上游不是标准 OpenAI SSE 格式。

**Q：知识库问答答非所问，怎么办？**

先看 sources 分流：sources 里没有相关片段 = 检索侧问题（依次查切片是否切碎语义、关键词是否命中、向量相似度、RRF 排序、多轮是否触发改写）；sources 相关但回答乱编 = Prompt 约束或模型侧问题。RAG 的问题不能只怪模型。

**Q：引用角标不显示或点了没反应？**

引用是四环闭环：检索 sources -> Prompt 要求输出参考片段 -> 前端解析引用编号 -> UI 定位高亮。断哪环查哪环：模型末尾是否输出约定格式、解析是否得到有效序号、sources 是否落库成功、序号是否越界（越界会被过滤）。

## 9. STAR 话术

### 9.1 客户端 RAG 检索性能优化

- **S**：每次提问要从 Supabase 拉最多 500 条切片和 embedding，JSON 每轮约 3MB，网络和解析成本高。
- **T**：不引入自建向量库的前提下提升检索体验，保留前端主导架构。
- **A**：设计 IndexedDB 向量缓存，用服务端/本地 id 集合 diff 增量拉取；embedding 用 Float32Array 存储；检索计算下放 Web Worker，向量打包矩阵用 Transferable 传输。
- **R**：缓存命中时请求从约 3MB 的全量 embedding 降到 KB 级 id 列表；重计算不占主线程（实测 2000 条约 9ms，为规模增长预留余量）。万级切片再切 pgvector。

### 9.2 混合检索和多轮追问增强

- **S**：单纯向量检索漏专有名词，单纯关键词检索不懂语义改写，多轮追问因指代词召回失败。
- **T**：提升 RAG 召回质量，让问答更稳定。
- **A**：向量 top8 和关键词 top8 并行，RRF（k=60）融合；短问题和含指代词问题在检索前用低成本 LLM 改写为自包含 query（2.5s 超时回退）；设质量门槛，不强行使用低质量片段。
- **R**：语义问题和专有名词问题都能兼顾，多轮追问尽量命中上下文，召回不达标自动降级通用回答。

### 9.3 流式体验和可观测性

- **S**：SSE 流式回答的高频 chunk 和长 Markdown 全文渲染会导致卡顿，且优化效果没有埋点很难证明。
- **T**：让流式输出顺滑，并能采集真实运行指标。
- **A**：手写 SSE 解析，支持边界缓冲和 AbortController；渲染用 rAF 合帧和 stable/tail 增量 Markdown；采集 QA 检索耗时、TTFT、流式时长、Web Vitals，接入错误监控。
- **R**：流式 UI 的性能瓶颈分层解决（实测 39k 字符切分累计 13ms）；后续可用埋点数据看 P50/P95，不靠主观感觉。

## 10. 边界与不要吹的点

最容易被追问的边界，主动讲比被戳穿好：

- API Key 不是数据库级加密保存（是 HTTPS + RLS + Edge Function 代理）。
- 当前不是 pgvector 服务端检索，客户端检索有规模上限。
- `documents` 建表迁移需要补齐（空库初始化不完整）。
- 切片没有 token 精确预算和 overlap。
- 文件解析主要覆盖 txt/md，不支持任意格式。
- RAG 不能根治幻觉，只能提升可验证性。
- Markdown 输出安全边界（sanitizer、链接协议、XSS）需要持续确认，源码没做就不要吹。
- 共享广场在登录布局内，真要公开分享需把路由与 RLS 调整为匿名可读并脱敏作者信息。
- qa_perf/fe_error 事件已入库，管理后台图表展示未做。

被问「你哪里没做好」的标准答案：

> 我最想补三点：第一，补齐 documents 建表迁移，保证空库可一键初始化；第二，API Key 做应用层加密或密钥托管；第三，知识库切片超过阈值时切到 pgvector RPC。现在的客户端检索是有意识的阶段性取舍，不是最终大规模架构。

## 11. 补强清单

做完以下任一项，简历可以对应升级：

| 补强项 | 补完后可以写 |
| --- | --- |
| `documents` 建表迁移 | 完善 Supabase 数据库迁移链路，支持空库按编号一键初始化 |
| API Key 应用层加密 / KMS | 对用户 API Key 做服务端加密存储，结合 RLS 和 Edge Function 代理降低泄露风险 |
| RAG 引用溯源 E2E（mock 片段 -> 点击角标 -> 断言高亮） | E2E 覆盖 RAG 检索、流式回答和引用溯源完整闭环 |
| qa_perf 线上数据积累 + 后台图表 | 报 TTFT / 检索耗时 P50/P95 线上真实数字 |
| pgvector RPC 双策略检索 | 设计客户端缓存检索与 pgvector 服务端检索的双策略召回架构 |
| 检索质量评测集（20-30 问：专有名词/语义改写/指代追问三类，人工标注相关片段，跑单路 vs 双路对比） | 「双路融合使专有名词类问题命中率从 a% 提升至 b%」——检索增强条从无 result 变成有硬数字，优先级最高 |

## 12. 项目全貌速览（追问底牌）

面试官深挖「项目怎么组织的」「提问之后发生了什么」「数据怎么存的」时的事实底牌，来自原开发手册。

### 12.1 技术栈

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 框架 | Vue 3 Composition API | 页面、组件、响应式状态 |
| 语言 | TypeScript | 类型约束、数据模型表达 |
| 构建 | Vite | 开发服务器、生产构建、分包 |
| UI | Element Plus + 自定义主题 | 表单、弹窗、布局、后台组件 |
| 状态 | Pinia | 登录态、AI 配置等全局状态 |
| 路由 | Vue Router | 路由、登录/管理员守卫、懒加载 |
| BaaS | Supabase | Auth、Postgres、RLS、RPC、Edge Functions |
| 编辑器 | md-editor-v3 | Markdown 编辑与预览 |
| 图表 | ECharts + vue-echarts | 管理后台统计 |
| 测试 | Vitest / Playwright | 纯函数单测 / 全 mock E2E |
| CI | GitHub Actions | lint、单测、构建、E2E |

### 12.2 分层与启动

分层依赖（下层不依赖上层）：

```text
types / utils（无 DOM、无网络的纯函数，便于单测）
    ↑
api（访问 Supabase 与 Edge Functions 的唯一入口）
    ↑
stores（Pinia：user、aiConfig）
    ↑
views / components（组合状态、交互、渲染）
```

启动顺序（src/main.ts）：

```text
createApp -> initErrorMonitor（尽早覆盖三类错误入口）
-> use(pinia) -> userStore.initialize()（先恢复登录态）
-> use(router)（守卫首次执行时登录态已就绪，避免刷新误跳登录页）
-> mount -> initWebVitalsReporting
```

路由三类权限：公开页（/login、/register）；业务页（/dashboard、/docs、/knowledge、/chat、/profile、/shared，需登录）；管理页（/admin/*，需登录且 admin）。守卫先等 initialize 完成再判断，未登录跳 login 并带 redirect 参数。

### 12.3 发送问题完整链路（必背）

「点击发送之后发生了什么」是最高频的深挖题：

```text
handleSend(question)
-> ensureActiveChat：无会话则创建（新建对话的草稿态此时才落库）
-> 本地追加 pending 用户消息 -> createChatMessage 落库
-> buildChatHistory 构建多轮历史
-> prepareSmartQa：
   知识增强开启且选了知识库 -> 取切片（IndexedDB 缓存优先）
   -> 必要时改写追问 -> 向量检索 + 关键词检索并行
   -> RRF 融合 -> 质量门槛决定 knowledge-enhanced / general-ai
   -> 构建 Prompt
-> 本地追加 streaming 占位 assistant 消息
-> generateAiTextStream：SSE chunk 累加 finalText，rAF 合帧刷新
-> 流结束/失败/停止 -> assistant 消息落库 -> 替换占位
-> track QA_SEND + QA_PERF（检索/TTFT/流式分段）
```

两个细节追问：**重新生成**复用 lastQuestion，且会排除当前问题之后的旧回答，避免旧答案污染新答案；**停止生成**走 AbortController，停止时一个字都没生成就删占位不落库，已有部分内容则保留落库。

### 12.4 核心数据表速览

| 表 | 一句话职责 |
| --- | --- |
| knowledge_bases | 知识库容器（含 qa_config 默认问答配置） |
| knowledge_files | 上传文件元数据（status: pending/processing/done/failed） |
| knowledge_chunks | 检索最小单位：content + embedding（double precision[]），文件和文档都落这里 |
| knowledge_documents | 站内文档与知识库的桥接（title_snapshot、last_chunk_count、last_synced_at） |
| documents | 站内 Markdown 文档（含共享字段 is_shared/shared_at） |
| chats / chat_messages | 会话与消息；消息带 sources jsonb、answer_mode、status，旧库缺列自动回退基础字段 |
| analytics_events | 统一埋点落点：业务事件 + Web Vitals + qa_perf + fe_error |
| profiles | 用户资料与 role（auth.users 触发器自动同步） |
| user_ai_config | 每用户一条 AI 配置（baseUrl/apiKey/model），RLS 限本人 |

所有个人数据表都带 owner_id/user_id，RLS 强制 auth.uid() 匹配。

## 13. 关键文件地图

被要求「打开代码讲讲」时的快速定位表：

| 想看什么 | 文件 |
| --- | --- |
| 应用启动 | src/main.ts |
| 路由和权限 | src/router/index.ts |
| 登录态/角色 | src/stores/user.ts |
| AI 配置状态 | src/stores/aiConfig.ts |
| Edge Function 调用封装 | src/utils/serverProxy.ts |
| 聊天 API（切片取数、缓存接入） | src/api/chat.ts |
| AI/SSE 解析 | src/api/ai.ts |
| 会话编排 | src/views/chat/composables/useChatSession.ts |
| 消息/RAG 编排（发送主链路） | src/views/chat/composables/useChatMessages.ts |
| 切片算法 | src/utils/chunkText.ts |
| 关键词检索 | src/utils/retrieveChunks.ts |
| 向量相似度 | src/utils/similarity.ts |
| RRF 融合 | src/utils/fuseRetrieval.ts |
| 向量缓存 | src/utils/embeddingCache.ts |
| Worker 客户端 / Worker | src/utils/retrievalWorkerClient.ts / src/workers/retrieval.worker.ts |
| Prompt 构建 | src/utils/buildQaPrompt.ts |
| 多轮历史裁剪 | src/utils/chatHistory.ts |
| 问题改写 | src/utils/rewriteQuestion.ts |
| 引用解析 | src/utils/parseCitations.ts |
| Markdown 增量渲染 | src/utils/streamingMarkdown.ts |
| think 分流 | src/utils/streamingThinkParser.ts |
| 性能度量/错误监控/埋点 | src/utils/perfMetrics.ts / errorMonitor.ts / tracker.ts |
| AI 聊天/Embedding 代理 | supabase/functions/ai-chat / ai-embeddings |
| 微基准 | src/utils/__tests__/perf.manual.test.ts |
| E2E | e2e/chat.spec.ts |

## 14. 面试前 5 分钟速记

主链路：

```text
文档/文件 -> 切片 -> embedding -> IndexedDB 缓存 -> Worker 检索
-> RRF 融合 -> Prompt -> Edge Function -> SSE
-> rAF/Markdown 增量渲染 -> 引用溯源
```

要背的数字：

```text
118 单测 | 首屏 -44%（1.24MB->0.70MB, gzip 399->222KB）
缓存命中：每轮 ~3MB -> KB 级
矩阵计算：500 条 ~2ms / 2000 条 ~9ms（1536 维）
流式切分：39k 字符 164 次共 13ms
切片 300-500 字 | RRF k=60，双路 top8 融 top5 | 改写 2.5s 超时
```

最终收束：

> 这个项目的价值不是「我会调 AI API」，而是我把大模型 API 包装成了一个具备知识入库、检索增强、流式交互、引用溯源、性能优化、权限隔离、可观测和测试保障的完整 AI 应用。
