# 前端优化方案清单

> 目标：把 AI 功能从"能用"做到"有深度"，堵住面试深挖时的架构漏洞，同时新增可量化、可演示的前端亮点。
> 每项包含：现状问题 → 实施方案 → 涉及文件 → 验收标准 → 面试话术要点。

## 优先级总览

> ✅ 2026-07-05：除 P2-2（虚拟滚动）外全部完成。P2-2 与增量渲染改造耦合度高、
> 收益场景（500+ 条消息的会话）较少，暂缓——面试可作为「已识别、有方案、按 ROI 排期」的权衡案例讲。

| 优先级 | 项目 | 类型 | 状态 |
|--------|------|------|------|
| P0 | 1. 检索向量 IndexedDB 缓存 + Transferable 零拷贝 | 性能/架构 | ✅ 完成 |
| P0 | 3. 流式 Markdown 增量渲染 | 渲染性能 | ✅ 完成 |
| P0 | 4. 引用溯源交互 | AI 体验 | ✅ 完成 |
| P0 | 8. GitHub Actions CI | 工程化 | ✅ 完成 |
| P1 | 5. 混合检索 RRF 融合 | AI 算法 | ✅ 完成 |
| P1 | 6. 多轮问题改写（指代消解） | RAG 质量 | ✅ 完成 |
| P1 | 9. 运行时性能度量 | 可观测性 | ✅ 完成（后台图表待做） |
| P2 | 2. 消息列表虚拟滚动 | 渲染性能 | ⏸ 暂缓 |
| P2 | 7. `<think>` 推理块流式折叠 UI | AI 体验 | ✅ 完成 |
| P2 | 10. Playwright E2E | 工程化 | ✅ 完成 |
| P2 | 11. 前端错误监控 | 工程化 | ✅ 完成（后台展示待做） |

---

## P0-1 检索向量 IndexedDB 缓存 + Transferable 零拷贝

**现状问题**：每次提问都从 Supabase 拉取最多 500 条切片的全量 embedding（`src/api/chat.ts` 的 `getKnowledgeChunksForQa`，500 × 1536 个浮点数 ≈ 3MB+ JSON），网络传输和 JSON 解析都是瓶颈；且向量以 `number[]` 通过 `postMessage` 结构化克隆传给 Worker，存在一次全量拷贝。知识库规模上万条时方案不可扩展——这是面试深挖时最容易被问穿的洞。

**实施方案**：
1. 新建 `src/utils/embeddingCache.ts`：基于 IndexedDB（原生 API 或 `idb` 轻量封装）按 `knowledgeBaseId` 缓存切片向量。
2. 失效策略：`knowledge_chunks` 查询先只取 `id + updated_at`（或知识库级 `chunks_version` 字段），与本地缓存 diff，只增量拉取新增/变更切片的 embedding。
3. 向量存储改用 `Float32Array`（IndexedDB 原生支持存 TypedArray，体积比 JSON number[] 小约 75%）。
4. `retrievalWorkerClient.ts` 的 `postMessage` 第二参数传 `[buffer]` transferable 列表，实现零拷贝移交；Worker 计算后如需归还再 transfer 回来（或每次从缓存重建）。
5. 余弦相似度计算改为接受 `Float32Array`，`similarity.ts` 泛化参数类型为 `ArrayLike<number>`。

**涉及文件**：`src/utils/embeddingCache.ts`（新）、`src/api/chat.ts`、`src/utils/retrievalWorkerClient.ts`、`src/workers/retrieval.worker.ts`、`src/utils/similarity.ts`

**验收标准**：
- 二次提问不再重复下载已缓存向量（Network 面板可见流量从 MB 级降到 KB 级）；
- 记录优化前后"提问 → 检索完成"耗时对比数据（写进 README）。

**面试话术**：客户端向量缓存的版本失效设计、TypedArray vs JSON 的体积/解析成本、结构化克隆 vs Transferable 的差异与实测数据。

---

## P0-3 流式 Markdown 增量渲染

**现状问题**：流式输出时每帧更新整条消息的 `content`，`MdPreview` 对全文重新解析渲染。回答越长每帧渲染成本越高，长回答尾段会出现明显卡顿——rAF 合帧只控制了更新频率，没控制单次更新的渲染量。

**实施方案**：
1. 新建 `src/utils/streamingMarkdown.ts`：将流式文本按"已完成段落 / 进行中尾段"切分（以 `\n\n` 为界，注意代码块围栏 ``` 内的空行不算段落边界——需要一个跨 chunk 的围栏状态机）。
2. 消息渲染拆成两部分：已完成段落列表用 `v-for` + `v-memo`（内容不变即跳过 diff），只有进行中尾段每帧重渲染。
3. 尾段容错：未闭合的代码块自动补 ``` 再渲染，避免流式中途整段样式跳变。
4. 为切分器与围栏状态机补 Vitest 用例（跨 chunk 切断、嵌套围栏、行内代码干扰）。

**涉及文件**：`src/utils/streamingMarkdown.ts`（新）、`src/views/chat/components/ChatMessageList.vue`、`src/utils/__tests__/streamingMarkdown.test.ts`（新）

**验收标准**：Performance 面板录制长回答（3000+ 字）流式过程，主线程单帧脚本耗时对比优化前有明确下降；无未闭合代码块导致的闪烁。

**面试话术**：rAF 合帧（控制频率）+ 增量渲染（控制单帧渲染量）是流式 UI 性能的两个正交维度；围栏状态机处理"语法在 chunk 边界被切断"。

---

## P0-4 引用溯源交互

**现状问题**：Prompt 已要求 AI 在回答末尾输出"参考片段: [片段x,片段y]"（`buildQaPrompt.ts`），来源切片也已随消息持久化（`sources` 字段），但两者没有打通——引用只是纯文本，用户无法验证 AI 说法出自哪段原文。

**实施方案**：
1. 渲染时用正则将回答中的 `[片段x]` / `片段x` 替换为可点击引用标记（上标样式的角标组件）。
2. 点击角标 → 展开该消息的 `SourceChunks` 面板并滚动定位到对应切片、高亮闪烁一次。
3. 切片卡片反向标注"被引用"状态，与检索得分、命中关键词一起展示。
4. 引用解析函数（文本 → 引用位置数组）写成纯函数并补测试。

**涉及文件**：`src/views/chat/components/ChatMessageList.vue`、`src/views/chat/components/SourceChunks.vue`、`src/utils/parseCitations.ts`（新）+ 测试

**验收标准**：知识增强模式下回答中的引用可点击定位到原文切片；general-ai 模式不渲染角标。

**面试话术**：RAG 可信度闭环——检索、生成、溯源三段中前端负责的"可验证性"交互设计。

---

## P0-8 GitHub Actions CI

**现状问题**：有 54 个单测和完整 lint 配置，但没有 CI，"有测试"的说服力减半。

**实施方案**：`.github/workflows/ci.yml`，Node 20，步骤：`npm ci` → `npm run lint`（改为不带 --fix 的 check 模式）→ `npm test` → `npm run build`。README 加状态徽章。

**验收标准**：push/PR 触发，全绿；徽章显示在 README 顶部。

---

## P1-5 混合检索 RRF 融合

**现状问题**：向量与关键词是"二选一降级"（`useChatMessages.ts` 的 `prepareSmartQa`）：向量结果质量不达标才整体切换关键词。两路信号没有互补——向量擅长语义、关键词擅长专有名词精确匹配，各自的强项被丢掉了。

**实施方案**：
1. 新建 `src/utils/fuseRetrieval.ts`：实现 Reciprocal Rank Fusion，`score(d) = Σ 1/(k + rank_i(d))`，k=60，按切片 id 合并两路排名。
2. `prepareSmartQa` 改为：有 embedding 时两路并行跑（`Promise.all`，都已在 Worker 中），RRF 融合取 topK；无 embedding 时保持纯关键词。
3. 保留降级语义：向量请求失败时退化为纯关键词，不阻塞回答。
4. `SourceChunks` 展示融合后的双路信号（相似度 + 命中关键词并存）。
5. 补 RRF 纯函数测试（两路重叠、互斥、单路为空）。

**涉及文件**：`src/utils/fuseRetrieval.ts`（新）+ 测试、`src/views/chat/composables/useChatMessages.ts`

**验收标准**：含专有名词的问题（关键词强）与同义改述问题（向量强）都能召回正确切片；原降级路径回归测试通过。

**面试话术**：为什么 RRF 优于分数线性加权（两路分数量纲不可比，秩融合免归一化）。

---

## P1-6 多轮问题改写（指代消解）

**现状问题**：多轮对话里用户问"那它怎么部署？"，检索用的是原句——"它"检索不到任何东西，知识增强模式静默失效退化为纯 AI。

**实施方案**：
1. 新建 `src/utils/rewriteQuestion.ts`：当问题含指代词/长度过短且存在历史时，取最近 2~3 轮历史，用一次低成本 LLM 调用（复用 `generateAiText`，maxTokens≈100，temperature=0）把问题改写为自包含独立问题。
2. 触发判断做成纯函数（指代词表 + 长度阈值 + 有无历史），避免每次都多一次调用；改写失败/超时（2s）降级用原句，不阻塞主流程。
3. 改写后的问题用于检索，原句用于展示与落库；`SourceChunks` 或调试信息中展示"检索用改写：xxx"。

**涉及文件**：`src/utils/rewriteQuestion.ts`（新）+ 测试（触发判断部分）、`src/views/chat/composables/useChatMessages.ts`

**验收标准**："它/这个/上面说的"类追问能正确命中知识库切片；改写调用失败时功能无感降级。

**面试话术**：RAG 多轮失效的根因（检索 query 与对话语境脱节）；成本控制（触发条件收窄 + 低 token 上限 + 超时降级）。

---

## P1-9 运行时性能度量

**现状问题**：README 里"-44%"是构建产物数字；缺少真实用户运行时指标，也没有 AI 链路的耗时数据支撑其他优化项的"前后对比"。

**实施方案**：
1. 新建 `src/utils/perfMetrics.ts`：`PerformanceObserver` 采集 LCP / INP / CLS；`performance.mark/measure` 打点 AI 链路四段——检索取数、向量计算、首 token 延迟（TTFT）、流式总时长。
2. 复用现有埋点管道（`tracker.ts` + `analytics_events` 表）上报，新增 `perf_metric` 事件类型。
3. 管理后台 `AdminAnalyticsView` 加一张 P50/P95 耗时图（ECharts 已有）。

**涉及文件**：`src/utils/perfMetrics.ts`（新）、`src/utils/tracker.ts`、`src/constants/analyticsEvents.ts`、`src/views/admin/AdminAnalyticsView.vue`

**验收标准**：后台可看到 TTFT、检索耗时分位数曲线；README 的性能章节可引用真实运行时数据。

---

## P2-2 消息列表虚拟滚动

**现状问题**：每条消息都是完整 `MdPreview` 实例，百条以上长会话 DOM 节点数与内存持续增长，切换会话时全量重建。

**实施方案**：动态高度虚拟列表（`@vueuse/core` 的 `useVirtualList` 不支持动态高度场景下的流式尾部增长，建议基于 `ResizeObserver` 缓存实测高度自研，或用 `vue-virtual-scroller` 的 `DynamicScroller`）。关键难点：流式输出时最后一项高度持续变化，需与吸附滚动逻辑联动（高度变化 → 修正 scrollTop 而非依赖 scrollHeight 差值）。

**涉及文件**：`src/views/chat/components/ChatMessageList.vue`（大改）、可能新增 `src/composables/useVirtualMessages.ts`

**验收标准**：500 条消息会话滚动帧率稳定 60fps；流式输出 + 用户上滑查看历史互不干扰。

**风险**：工作量最大，且与 P0-3 的渲染改造有耦合，建议 P0-3 完成后再做。

---

## P2-7 `<think>` 推理块流式折叠 UI

**现状问题**：推理模型的 `<think>` 块目前被直接剥离（历史裁剪与展示均如此），推理过程对用户完全不可见，也浪费了一个展示"流式状态机解析"能力的机会。

**实施方案**：
1. 新建 `src/utils/streamingThinkParser.ts`：跨 chunk 的标签状态机（`<think>` 可能被切成 `<thi` + `nk>` 两个 chunk 到达），实时把流拆分为 `thinking` / `answer` 两个通道。
2. UI：回答顶部渲染可折叠"思考过程"区域，流式期间显示动效与实时思考内容，`</think>` 到达后自动折叠。
3. 落库仍保存原始全文，`chatHistory.ts` 的剥离逻辑不变。
4. 状态机补测试（标签跨 chunk 切断、无 think、多个 think、只有开标签流被中断）。

**涉及文件**：`src/utils/streamingThinkParser.ts`（新）+ 测试、`src/views/chat/components/ChatMessageList.vue`、`src/views/chat/composables/useChatMessages.ts`

---

## P2-10 Playwright E2E

**方案**：一条关键路径——登录 → 选知识库 → 提问 → 断言流式回答出现与来源引用渲染。AI 接口用 Playwright `page.route` mock SSE 响应，避免测试依赖真实 Key 且可稳定断言流式行为。接入 CI。

**涉及文件**：`e2e/chat.spec.ts`（新）、`playwright.config.ts`（新）、CI workflow 追加 job。

---

## P2-11 前端错误监控

**方案**：`window.onerror` + `unhandledrejection` + `Vue app.config.errorHandler` 三处捕获，脱敏后复用埋点管道上报 `fe_error` 事件（含路由、组件名、堆栈前 N 行）；管理后台加错误列表页或直接在 Analytics 页展示 topN 错误。

**涉及文件**：`src/utils/errorMonitor.ts`（新）、`src/main.ts`、`src/constants/analyticsEvents.ts`

---

## 附：暂缓项 —— pgvector 服务端检索

标准架构是在 Postgres（pgvector）里做相似度检索，不把向量传到客户端。**暂不迁移**，理由：面试方向为前端，客户端检索 + Web Worker 是核心亮点；P0-1 的缓存方案已解决其主要缺陷。建议长期演进为**可切换策略**：切片数低于阈值走客户端检索（省一次网络往返、向量已本地缓存），超过阈值走 pgvector RPC——面试时作为架构权衡口头阐述即可。
