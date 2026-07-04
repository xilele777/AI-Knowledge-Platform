# AI 知识库平台

[![CI](https://github.com/xilele777/AI-Knowledge-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/xilele777/AI-Knowledge-Platform/actions/workflows/ci.yml)

基于 Vue 3 + Supabase 的 AI 知识库平台，支持文档管理、知识库构建、AI 问答与智能写作。

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
`TextDecoder` 增量解码 + 事件边界缓冲（正确处理 chunk 切在 SSE 事件中间的场景）；兼容多种 OpenAI 兼容端点的嵌套 delta 格式（深度优先文本提取）；`AbortController` 全链路中断（停止生成）。

**2. rAF 合帧的流式渲染** — [src/views/chat/composables/useChatMessages.ts](src/views/chat/composables/useChatMessages.ts)
SSE chunk 到达频率远高于屏幕刷新率，每帧最多触发一次响应式更新，避免高频 Markdown 重渲染阻塞主线程。

**3. Web Worker 检索卸载 + Transferable 零拷贝** — [src/utils/retrievalWorkerClient.ts](src/utils/retrievalWorkerClient.ts) / [src/workers/retrieval.worker.ts](src/workers/retrieval.worker.ts)
余弦相似度（500 切片 × 1536 维）与中文 N-gram 关键词评分在 Worker 线程执行，主线程零阻塞；切片向量打包为单个 `Float32Array` 矩阵后以 Transferable 移交，跨线程传输成本从 O(数据量) 降为 O(1)；懒加载单例 Worker、自增 id 关联并发请求，Worker 崩溃自动降级主线程同步计算。

**4. 切片向量 IndexedDB 缓存** — [src/utils/embeddingCache.ts](src/utils/embeddingCache.ts) + [src/api/chat.ts](src/api/chat.ts)
利用「切片行不可变（只插入/整批删除）」的数据特性，用一次轻量 id 请求做双向集合 diff：新增切片增量拉取、已删切片本地淘汰。缓存命中时每次提问的网络流量从 MB 级（全量 embedding JSON）降到 KB 级；向量以 `Float32Array` 存储，体积比 `number[]` JSON 约 -75%。

**5. 混合检索：向量 + 关键词 RRF 融合** — [src/utils/fuseRetrieval.ts](src/utils/fuseRetrieval.ts) / [src/utils/chunkText.ts](src/utils/chunkText.ts)
文档「段落 → 句子 → 硬切」三级切片后，双路并行检索按 Reciprocal Rank Fusion（`Σ 1/(k + rank)`）融合，替代「向量低质才切关键词」的二选一降级——向量懂语义改述，关键词（中文 N-gram + 停用词 + 密度评分）擅长专有名词精确匹配，秩融合天然免两路分数归一化；任一路失败自动退化单路，不阻塞回答。

**6. 多轮指代消解（检索前问题改写）** — [src/utils/rewriteQuestion.ts](src/utils/rewriteQuestion.ts)
追问「那它怎么部署？」直接检索必然失效（检索 query 与对话语境脱节）。触发条件收窄为纯函数判断（指代词表 + 长度阈值 + 有无历史），命中才用一次低成本 LLM 调用（120 token 上限、temperature 0、2.5s 超时降级）改写为自包含问题；改写只用于检索，展示与落库仍是原句。

**7. 流式 Markdown 增量渲染** — [src/utils/streamingMarkdown.ts](src/utils/streamingMarkdown.ts)
rAF 合帧只控制更新「频率」，没控制单帧「渲染量」——回答越长每帧全文重解析越卡。将流式文本按围栏状态机切为「已完成段落 / 进行中尾段」分别渲染：stable 段仅在新段落完成时变化，每帧真正重渲染的只有小体积尾段；未闭合代码块自动补合成闭栏防样式跳变。

**8. `<think>` 推理块流式分流** — [src/utils/streamingThinkParser.ts](src/utils/streamingThinkParser.ts)
标签可能被 SSE chunk 在任意位置切断（`<thi` + `nk>`），逐帧解析累积全文并暂时隐藏半截标签，推理内容实时分流到可折叠面板（思考中自动展开、闭合后自动收起），正文通道零污染。

**9. 引用溯源闭环** — [src/utils/parseCitations.ts](src/utils/parseCitations.ts) + [SourceChunks.vue](src/views/chat/components/SourceChunks.vue)
宽容解析回答末尾的「参考片段: [片段x,片段y]」（全角/半角、有无括号、越界序号过滤），渲染为可点击角标；点击展开来源面板、滚动定位并闪烁高亮对应切片——检索、生成、溯源三段中前端负责的「可验证性」。

**10. 多轮上下文双层预算裁剪** — [src/utils/chatHistory.ts](src/utils/chatHistory.ts) + [supabase/functions/ai-chat/index.ts](supabase/functions/ai-chat/index.ts)
前端按字符预算从新到旧收集历史、单条超长尾部截断、剥离 `<think>` 块；Edge Function 服务端再做防御性截断，双层保障上游 token 成本可控。

**11. 首屏 JS 体积 -44% + 运行时可观测** — [vite.config.ts](vite.config.ts) / [src/utils/perfMetrics.ts](src/utils/perfMetrics.ts) / [src/utils/errorMonitor.ts](src/utils/errorMonitor.ts)
路由级懒加载 + `manualChunks` 仅分组首屏共享库，1.24MB → 0.70MB（gzip 399KB → 222KB）；线上补齐 RUM：`PerformanceObserver` 采集 LCP/CLS/INP，AI 链路分段打点（检索耗时 / 首 token 延迟 TTFT / 流式时长），三入口错误监控（`window.onerror` / `unhandledrejection` / Vue `errorHandler`）带指纹去重限频，全部复用埋点管道入库。

**12. 测试与工程化** — [src/utils/__tests__/](src/utils/__tests__/) / [e2e/](e2e/) / [.github/workflows/ci.yml](.github/workflows/ci.yml)
Vitest 118 个用例覆盖切片、双检索评分、RRF 融合、SSE 解析、流式切分、think 状态机、引用解析等核心纯函数；Playwright E2E 全 mock 后端（localStorage 注入登录态 + 拦截 PostgREST/SSE），无密钥可跑通「提问 → 流式回答 → 思考面板」关键路径；GitHub Actions 双 job（lint + 单测 + 构建 / E2E）。

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
001 → 012
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
- Key 经过 Supabase RLS 加密传输并存储，仅本人可见

## 项目结构

```
src/
├── api/          API 层（Supabase 直连 + AI 调用）
├── types/        TypeScript 类型定义
├── stores/       Pinia 状态管理
├── router/       路由 + 侧边栏菜单配置
├── layouts/      MainLayout（主布局）/ AdminLayout（管理后台布局）
├── views/        页面视图
│   ├── docs/     文档管理
│   ├── knowledge/ 知识库
│   ├── chat/     AI 问答
│   ├── shared/   共享广场
│   ├── admin/    管理后台
│   ├── login/    登录 / 注册
│   └── ProfileView.vue  个人中心
├── components/   跨页面公共组件
├── utils/        工具函数（切片、检索、向量、埋点等）
├── styles/       MD3 主题 + Element Plus 覆盖
└── constants/    埋点事件常量

supabase/
├── sql/          12 个数据库迁移脚本
└── functions/    Edge Functions（ai-chat / ai-embeddings / admin-analytics）
```

## 架构要点

### AI 与检索

- **多轮上下文**：历史消息按字符预算（默认 6000）从新到旧回传，超长单条尾部截断，`<think>` 推理块自动剥离；含指代的追问先经低成本 LLM 改写为自包含问题再检索
- **混合检索**：向量余弦相似度与关键词匹配（中文 Ngram + 停用词 + 密度评分）双路并行，RRF 秩融合取长补短；单路失败自动退化，缓存命中时切片向量走 IndexedDB 不重复下载
- **Web Worker**：相似度与关键词评分在 Worker 线程执行，向量打包矩阵 Transferable 零拷贝移交，主线程零阻塞；Worker 不可用时自动降级主线程
- **SSE 流式**：手动解析 `text/event-stream`，兼容不同 API 端点的嵌套响应格式；chunk 更新按 `requestAnimationFrame` 合帧渲染，支持中断（停止生成）
- **Edge Functions**：`ai-chat` 代理对话请求（含历史消息服务端防御性截断），`ai-embeddings` 生成向量，均通过 RLS 读取用户 AI 配置

### 安全

- **Auth**：Supabase Auth 邮箱登录，`onAuthStateChange` 全局监听
- **角色**：普通用户 / 管理员，路由守卫拦截 + RLS 双重保障
- **API Key**：存入 `user_ai_config` 表，RLS 仅本人可读写，前端仅内存持有

### 数据

- **文档同步**：`chunkText()` 切片 → 批量写入 `knowledge_chunks` → 可选向量 Embedding
- **草稿**：编辑中通过 `localStorage` 自动暂存，保存后自动清除
- **兼容降级**：消息写入时自动检测列是否存在，兼容未执行全部迁移的旧库
- **埋点**：9 种事件类型，写入失败静默丢弃

### 性能

- **路由级懒加载** + 按需分包：仅对首屏共享库（Element Plus / Supabase）手动分组，ECharts、md-editor 等懒加载路由专属库交由自动分包，避免 vendor 组被入口静态依赖拖入首屏
- 首屏 JS 由 1.24MB 降至 0.70MB（gzip 399KB → 222KB，**-44%**）
- 聊天流式输出 rAF 合帧渲染；消息区吸附式自动滚动（用户上滑即停，回底恢复）

### 工程质量

- **单元测试**：Vitest 覆盖切片、双路检索评分、RRF 融合、SSE 解析、流式切分、think 状态机、引用解析、上下文裁剪等核心纯函数（118 个用例），`npm test`
- **E2E 测试**：Playwright 全 mock 后端跑通「登录态 → 提问 → 流式回答 → 思考面板」关键路径，无密钥可运行，`npm run test:e2e`
- **CI**：GitHub Actions 双 job（lint + 单测 + 构建 / E2E），push 与 PR 触发
- **代码规范**：ESLint（flat config，vue + typescript-eslint）+ Prettier，`npm run lint` / `npm run format`

