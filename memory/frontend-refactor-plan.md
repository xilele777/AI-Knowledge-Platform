---
name: frontend-refactor-plan
description: 前端重构完整方案：信息架构、交互逻辑、视觉规范、代码架构四个维度的详细优化方案
metadata:
  type: project
---

# 前端重构与优化方案

## 诊断结论
- 项目已有 MD3 Design Token 体系（theme.css），基础良好
- 核心痛点：页面缺乏"着陆感"（Dashboard 空壳）、交互生硬（缺骨架屏/乐观更新/微交互）、ChatView 900+行巨石组件、MainLayout/AdminLayout 高度重复
- 技术栈：Vue 3 + TS + Vite 8 + Pinia + Vue Router 5 + Element Plus + Supabase

## 四个维度

### 1. 信息架构
- Dashboard 重写为数据驱动"指挥中心"（最近文档、统计卡片、快速入口）
- 菜单重新分级：工作台 / 创作 / 发现
- ChatView 三级渐进式引导：选知识库 → 配风格 → 对话
- 聊天中通过 Header 下拉菜单无缝切换知识库（不回退）

### 2. 交互逻辑
- 统一异步状态机 `useAsyncState`（idle→loading→success/error/streaming）
- 骨架屏体系（SkeletonCard）+ 最小展示时间 200ms（防闪烁）
- 乐观删除 `useConfirmDelete`（滑出动画 + 撤销 Toast + 分页自动补齐）
- 渐进式呈现：AI面板折叠、高级配置收起、文件列表懒加载
- 微交互：消息飞入、保存图标形变、页面过渡动画

### 3. 视觉规范
- 增强 Design Tokens：Slate 色系、Accent 梯度、暗色模式
- 双层阴影（Umbra/Penumbra）：`0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.05)`
- 暗色模式卡片 Glow Effect（渐变边框模拟外发光）
- 数字滚动动画（Number Tweening）+ 微型 Sparkline 趋势图
- 统一页面间距：padding 48px/40px，max-width 1280px，卡片 gap 24px

### 4. 代码架构
- 合并 MainLayout + AdminLayout → AppLayout
- 新增 composables/：useAsyncState, useDebounce, useConfirmDelete, useDarkMode, useKeyboardShortcut
- 新增 components/shared/：SkeletonCard, EmptyStateActionable, PageHeader, ConfirmDialog, StatusBadge
- 拆分 ChatView 900行 → 4个 composables + 子组件
- TypeScript 路径别名 @/ @views/ @components/ @composables/ 等

## 实施路线图（4 Phase）

### Phase 1 — 基础架构
1. TS 路径别名
2. 合并布局 → AppLayout
3. composables/ 目录 + useAsyncState, useDebounce
4. components/shared/ 基础组件

### Phase 2 — 交互升级
1. 拆分 ChatView → composables
2. 列表页 v-loading → Skeleton
3. useConfirmDelete（乐观删除+撤销+分页）
4. 页面过渡动画
5. 空状态 → ActionableEmpty

### Phase 3 — 视觉升级
1. 增强 Design Tokens（Slate/暗色/双层阴影/Glow）
2. 重写 Dashboard（数字滚动+Sparkline）
3. 统一页面排版
4. emoji → SVG 图标
5. 暗色模式切换

### Phase 4 — 精细化
1. 键盘快捷键系统
2. 虚拟滚动（聊天消息）
3. 性能审计+优化
4. defineAsyncComponent 包裹重组件
5. API 请求去重与缓存

## 关键设计决策
- 先架构后视觉：Phase 1&2 的组件拆分和 composable 提取是基石
- 骨架屏最小展示 200ms：接口 < 200ms 不展示骨架屏，避免闪烁
- 乐观删除需通知列表组件预加载下一条数据，避免分页断裂
- 暗色模式卡片用渐变边框模拟 Glow Effect
- 聊天 Header 保留知识库切换下拉菜单（不强制回退到 Step 1）

**Why:** 用户反馈项目页面像"教务系统"，缺乏现代 SaaS 产品的高级感和流畅度。

**How to apply:** 按 Phase 顺序实施，每个 Phase 完成后 review 再进入下一个。
