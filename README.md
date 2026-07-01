# AI 知识库平台

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

- **双检索策略**：关键词匹配（中文 Ngram + 停用词）与向量余弦相似度并行
- **SSE 流式**：手动解析 `text/event-stream`，兼容不同 API 端点的嵌套响应格式
- **Edge Functions**：`ai-chat` 代理对话请求，`ai-embeddings` 生成向量，均通过 RLS 读取用户 AI 配置

### 安全

- **Auth**：Supabase Auth 邮箱登录，`onAuthStateChange` 全局监听
- **角色**：普通用户 / 管理员，路由守卫拦截 + RLS 双重保障
- **API Key**：存入 `user_ai_config` 表，RLS 仅本人可读写，前端仅内存持有

### 数据

- **文档同步**：`chunkText()` 切片 → 批量写入 `knowledge_chunks` → 可选向量 Embedding
- **草稿**：编辑中通过 `localStorage` 自动暂存，保存后自动清除
- **兼容降级**：消息写入时自动检测列是否存在，兼容未执行全部迁移的旧库
- **埋点**：9 种事件类型，写入失败静默丢弃
