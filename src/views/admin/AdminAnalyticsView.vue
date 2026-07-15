<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { getAnalyticsEventLabel } from '@/constants/analyticsEvents'
import {
  getAdminAnalyticsOverview,
  getAdminDashboardStats,
  type AdminAnalyticsOverview,
  type AdminAnalyticsRangeInput,
  type AdminDashboardStats,
} from '../../api/admin'

const VChart = defineAsyncComponent(() => import('vue-echarts'))

use([CanvasRenderer, LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent])

const VISIBLE_EVENT_COUNT = 5
// ECharts 渲染在 canvas 里，无法解析 CSS 变量，图表色值需要写死
const CHART_BLUE = '#1a73e8'
const CHART_GREEN = '#0f9d58'
const CHART_PURPLE = '#7c4dff'
const CHART_RED = '#d93025'
const RANGE_OPTIONS = [
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '近 60 天', value: '60d' },
  { label: '自定义区间', value: 'custom' },
] as const

const loading = ref(false)
const errorMessage = ref('')
const analytics = ref<AdminAnalyticsOverview | null>(null)
const dashboardStats = ref<AdminDashboardStats | null>(null)
const activeRange = ref<'7d' | '30d' | '60d' | 'custom'>('7d')
const pendingCustomRange = ref<[Date, Date] | null>(null)
const appliedCustomRange = ref<[Date, Date] | null>(null)

function formatCompactNumber(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return value.toLocaleString('zh-CN')
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function safeDivide(dividend: number, divisor: number): number {
  if (!divisor) return 0
  return dividend / divisor
}

function formatRangeDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRangeLabel(): string {
  if (activeRange.value === '30d') return '近 30 天'
  if (activeRange.value === '60d') return '近 60 天'
  if (activeRange.value === 'custom' && appliedCustomRange.value) {
    return `${formatRangeDate(appliedCustomRange.value[0])} 至 ${formatRangeDate(appliedCustomRange.value[1])}`
  }
  return '近 7 天'
}

function getRangeParams(): AdminAnalyticsRangeInput {
  if (activeRange.value === '30d') return { days: 30 }
  if (activeRange.value === '60d') return { days: 60 }
  if (activeRange.value === 'custom' && appliedCustomRange.value) {
    return {
      startDate: formatRangeDate(appliedCustomRange.value[0]),
      endDate: formatRangeDate(appliedCustomRange.value[1]),
    }
  }
  return { days: 7 }
}

function validatePendingCustomRange(): string | null {
  if (!pendingCustomRange.value || pendingCustomRange.value.length !== 2) {
    return '请先选择完整的开始和结束日期'
  }

  const [start, end] = pendingCustomRange.value
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  if (diffDays <= 0) {
    return '结束日期必须大于或等于开始日期'
  }
  if (diffDays > 60) {
    return '自定义区间最多支持 60 天'
  }

  return null
}

const selectedRangeLabel = computed(() => {
  if (activeRange.value === 'custom') return '自定义区间'
  const matched = RANGE_OPTIONS.find((item) => item.value === activeRange.value)
  return matched?.label || '近 7 天'
})

const overviewMetrics = computed(() => {
  const analyticsValue = analytics.value
  const dashboardValue = dashboardStats.value

  return [
    {
      label: '平台用户',
      value: formatCompactNumber(analyticsValue?.userCount ?? dashboardValue?.userCount ?? 0),
      extra: `活跃 ${analyticsValue?.activeUserCount ?? 0}`,
      accent: 'var(--google-blue)',
    },
    {
      label: '文档',
      value: formatCompactNumber(analyticsValue?.documentCount ?? dashboardValue?.documentCount ?? 0),
      extra: `新增 ${analyticsValue?.documentCreatedTotal ?? 0}`,
      accent: 'var(--google-green)',
    },
    {
      label: '文件',
      value: formatCompactNumber(analyticsValue?.knowledgeFileCount ?? dashboardValue?.fileCount ?? 0),
      extra: `新增 ${analyticsValue?.fileCreatedTotal ?? 0}`,
      accent: 'var(--google-yellow)',
    },
    {
      label: 'AI 调用',
      value: formatCompactNumber(analyticsValue?.aiCallCount ?? 0),
      extra: `区间总量 ${formatCompactNumber(analyticsValue?.aiCallTotal ?? 0)}`,
      accent: 'var(--google-red)',
    },
    {
      label: '会话',
      value: formatCompactNumber(dashboardValue?.chatCount ?? 0),
      extra: `消息 ${formatCompactNumber(dashboardValue?.messageCount ?? 0)}`,
      accent: 'var(--google-orange)',
    },
    {
      label: '日均调用',
      value: Math.round(analyticsValue?.avgAiCallsPerDay ?? 0).toString(),
      extra: '日均值',
      accent: 'var(--google-purple)',
    },
  ]
})

const rangeDays = computed(() => analytics.value?.loginTrend.length || 7)

const summaryMetrics = computed(() => {
  const analyticsValue = analytics.value
  const dashboardValue = dashboardStats.value

  const userCount = analyticsValue?.userCount ?? dashboardValue?.userCount ?? 0
  const activeRate = safeDivide(analyticsValue?.activeUserCount ?? 0, userCount)
  const aiPerActiveUser = safeDivide(analyticsValue?.aiCallTotal ?? 0, analyticsValue?.activeUserCount ?? 0)
  const messagePerChat = safeDivide(dashboardValue?.messageCount ?? 0, dashboardValue?.chatCount ?? 0)
  const chatPerUser = safeDivide(dashboardValue?.chatCount ?? 0, userCount)
  const messagePerUser = safeDivide(dashboardValue?.messageCount ?? 0, userCount)
  const docPerUser = safeDivide(analyticsValue?.documentCount ?? 0, userCount)
  const filePerDoc = safeDivide(analyticsValue?.knowledgeFileCount ?? dashboardValue?.fileCount ?? 0, analyticsValue?.documentCount ?? dashboardValue?.documentCount ?? 0)
  const filePerKb = safeDivide(analyticsValue?.knowledgeFileCount ?? dashboardValue?.fileCount ?? 0, dashboardValue?.knowledgeBaseCount ?? 0)
  const aiPerChat = safeDivide(analyticsValue?.aiCallTotal ?? 0, dashboardValue?.chatCount ?? 0)
  const loginPerDay = safeDivide(analyticsValue?.loginTotal ?? 0, rangeDays.value)

  return [
    { label: '活跃率', value: formatPercent(activeRate) },
    { label: '活跃用户', value: formatCompactNumber(analyticsValue?.activeUserCount ?? 0) },
    { label: '人均 AI', value: aiPerActiveUser.toFixed(1) },
    { label: '会话 AI 强度', value: aiPerChat.toFixed(1) },
    { label: '会话密度', value: messagePerChat.toFixed(1) },
    { label: '人均会话', value: chatPerUser.toFixed(1) },
    { label: '人均消息', value: messagePerUser.toFixed(1) },
    { label: '人均文档', value: docPerUser.toFixed(1) },
    { label: '文件/文档', value: filePerDoc.toFixed(1) },
    { label: '库均文件', value: filePerKb.toFixed(1) },
    { label: '区间登录', value: formatCompactNumber(analyticsValue?.loginTotal ?? 0) },
    { label: '日均登录', value: loginPerDay.toFixed(1) },
  ]
})

const growthMetrics = computed(() => {
  const analyticsValue = analytics.value

  const docsPerDay = safeDivide(analyticsValue?.documentCreatedTotal ?? 0, rangeDays.value)
  const filesPerDay = safeDivide(analyticsValue?.fileCreatedTotal ?? 0, rangeDays.value)

  return [
    { label: '区间 AI', value: formatCompactNumber(analyticsValue?.aiCallTotal ?? 0) },
    { label: '新增文档', value: (analyticsValue?.documentCreatedTotal ?? 0).toString() },
    { label: '新增文件', value: (analyticsValue?.fileCreatedTotal ?? 0).toString() },
    { label: '增量比', value: `${analyticsValue?.documentCreatedTotal ?? 0}/${analyticsValue?.fileCreatedTotal ?? 0}` },
    { label: '日均新增文档', value: docsPerDay.toFixed(1) },
    { label: '日均新增文件', value: filesPerDay.toFixed(1) },
  ]
})

const volumeMetrics = computed(() => {
  const analyticsValue = analytics.value
  const dashboardValue = dashboardStats.value

  return [
    { label: '用户总数', value: formatCompactNumber(analyticsValue?.userCount ?? dashboardValue?.userCount ?? 0) },
    { label: '文档总数', value: formatCompactNumber(analyticsValue?.documentCount ?? dashboardValue?.documentCount ?? 0) },
    { label: '知识库总数', value: formatCompactNumber(dashboardValue?.knowledgeBaseCount ?? 0) },
    { label: '知识文件', value: formatCompactNumber(analyticsValue?.knowledgeFileCount ?? dashboardValue?.fileCount ?? 0) },
    { label: '会话总数', value: formatCompactNumber(dashboardValue?.chatCount ?? 0) },
    { label: '消息总数', value: formatCompactNumber(dashboardValue?.messageCount ?? 0) },
  ]
})

const topEvents = computed(() =>
  (analytics.value?.topEvents ?? []).slice(0, VISIBLE_EVENT_COUNT).map((event, index) => ({
    ...event,
    index: index + 1,
    displayName: getAnalyticsEventLabel(event.eventName),
  })),
)

const eventLabels = computed(() => topEvents.value.map((event) => event.displayName))
const eventValues = computed(() => topEvents.value.map((event) => event.count))

const eventChartOption = computed(() => {
  const labels = [...eventLabels.value].reverse()
  const values = [...eventValues.value].reverse()

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e6e1e5',
      textStyle: { color: '#1c1b1f' },
    },
    grid: {
      left: 8,
      right: 8,
      top: 6,
      bottom: 6,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#edf0f5' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#1c1b1f', fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 14,
        itemStyle: {
          color: CHART_BLUE,
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  }
})

const loginTrendOption = computed(() => {
  const trend = analytics.value?.loginTrend ?? []

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e6e1e5',
      textStyle: { color: '#1c1b1f' },
    },
    grid: {
      left: 8,
      right: 8,
      bottom: 4,
      top: 12,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.date.slice(5)),
      axisLine: { lineStyle: { color: '#d6dbe3' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 11 },
      splitLine: { lineStyle: { color: '#edf0f5' } },
    },
    series: [
      {
        name: '登录次数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: CHART_BLUE },
        areaStyle: { opacity: 0.1, color: CHART_BLUE },
        itemStyle: {
          color: CHART_BLUE,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
        data: trend.map((item) => item.value),
      },
    ],
  }
})

const aiTrendOption = computed(() => {
  const trend = analytics.value?.aiCallTrend ?? []

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e6e1e5',
      textStyle: { color: '#1c1b1f' },
    },
    grid: {
      left: 8,
      right: 8,
      bottom: 4,
      top: 12,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date.slice(5)),
      axisLine: { lineStyle: { color: '#d6dbe3' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 11 },
      splitLine: { lineStyle: { color: '#edf0f5' } },
    },
    series: [
      {
        name: 'AI 调用次数',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: {
          color: CHART_GREEN,
          borderRadius: [4, 4, 0, 0],
        },
        data: trend.map((item) => item.value),
      },
    ],
  }
})

const qaPerf = computed(() => analytics.value?.qaPerf ?? null)
const hasQaPerf = computed(() => (qaPerf.value?.sampleCount ?? 0) > 0)

function formatMs(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

const qaPerfMetrics = computed(() => {
  const perf = qaPerf.value
  return [
    { label: '检索 P50', value: formatMs(perf?.retrievalP50 ?? null) },
    { label: '检索 P95', value: formatMs(perf?.retrievalP95 ?? null) },
    { label: '首字 P50', value: formatMs(perf?.ttftP50 ?? null) },
    { label: '首字 P95', value: formatMs(perf?.ttftP95 ?? null) },
    { label: '流式 P50', value: formatMs(perf?.streamP50 ?? null) },
    { label: '流式 P95', value: formatMs(perf?.streamP95 ?? null) },
    { label: '总耗时 P50', value: formatMs(perf?.totalP50 ?? null) },
    { label: '总耗时 P95', value: formatMs(perf?.totalP95 ?? null) },
  ]
})

const qaPerfChartOption = computed(() => {
  const perf = qaPerf.value
  const stages = ['检索', '首字', '流式', '总耗时']
  const p50 = [
    perf?.retrievalP50 ?? 0,
    perf?.ttftP50 ?? 0,
    perf?.streamP50 ?? 0,
    perf?.totalP50 ?? 0,
  ]
  const p95 = [
    perf?.retrievalP95 ?? 0,
    perf?.ttftP95 ?? 0,
    perf?.streamP95 ?? 0,
    perf?.totalP95 ?? 0,
  ]

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: number) => `${Math.round(value)} ms`,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e6e1e5',
      textStyle: { color: '#1c1b1f' },
    },
    legend: {
      data: ['P50', 'P95'],
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#6b7280', fontSize: 11 },
    },
    grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: stages,
      axisLine: { lineStyle: { color: '#d6dbe3' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value} ms' },
      splitLine: { lineStyle: { color: '#edf0f5' } },
    },
    series: [
      {
        name: 'P50',
        type: 'bar',
        data: p50,
        barMaxWidth: 16,
        itemStyle: { color: CHART_BLUE, borderRadius: [4, 4, 0, 0] },
      },
      {
        name: 'P95',
        type: 'bar',
        data: p95,
        barMaxWidth: 16,
        itemStyle: { color: CHART_PURPLE, borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
})

const feError = computed(() => analytics.value?.feError ?? null)
const hasFeError = computed(() => (feError.value?.total ?? 0) > 0)

const FE_ERROR_SOURCE_LABELS: Record<string, string> = {
  window_error: '脚本错误',
  unhandled_rejection: 'Promise 拒绝',
  vue_error_handler: 'Vue 组件',
  unknown: '未知来源',
}

const feErrorSourceChartOption = computed(() => {
  const bySource = feError.value?.bySource ?? []
  const palette = [CHART_RED, '#f9a825', CHART_PURPLE, '#5f6368']

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e6e1e5',
      textStyle: { color: '#1c1b1f' },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: bySource.map((item, index) => ({
          name: FE_ERROR_SOURCE_LABELS[item.source] || item.source,
          value: item.count,
          itemStyle: { color: palette[index % palette.length] },
        })),
      },
    ],
  }
})

const feErrorSourceLegend = computed(() => {
  const bySource = feError.value?.bySource ?? []
  const palette = [CHART_RED, '#f9a825', CHART_PURPLE, '#5f6368']
  return bySource.map((item, index) => ({
    label: FE_ERROR_SOURCE_LABELS[item.source] || item.source,
    count: item.count,
    color: palette[index % palette.length],
  }))
})

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [analyticsResult, statsResult] = await Promise.all([
      getAdminAnalyticsOverview(getRangeParams()),
      getAdminDashboardStats(),
    ])

    if (!analyticsResult.success || !analyticsResult.data) {
      analytics.value = null
      errorMessage.value = analyticsResult.error || '获取数据大屏数据失败'
      return
    }

    analytics.value = analyticsResult.data
    dashboardStats.value = statsResult.success ? statsResult.data : null

    if (!statsResult.success && !errorMessage.value) {
      errorMessage.value = statsResult.error || ''
    }
  } finally {
    loading.value = false
  }
}

async function handleRangeChange(value: string) {
  activeRange.value = value as typeof activeRange.value
  errorMessage.value = ''

  if (activeRange.value === 'custom') {
    return
  }

  await loadData()
}

async function applyCustomRange() {
  const validationMessage = validatePendingCustomRange()
  if (validationMessage) {
    errorMessage.value = validationMessage
    return
  }

  appliedCustomRange.value = pendingCustomRange.value
  errorMessage.value = ''
  await loadData()
}

void loadData()
</script>

<template>
  <div class="admin-screen">
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="warning"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div class="filter-bar">
      <div class="filter-bar-main">
        <div class="range-selector">
          <span class="range-selector-label">时间范围</span>
          <el-select :model-value="activeRange" size="small" style="width: 136px" @change="handleRangeChange">
            <el-option v-for="item in RANGE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div v-if="activeRange === 'custom'" class="custom-range-row">
          <el-date-picker
            v-model="pendingCustomRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format=""
            unlink-panels
            size="small"
          />
          <el-button type="primary" size="small" @click="applyCustomRange">应用</el-button>
        </div>
      </div>
      <div class="range-meta">{{ selectedRangeLabel }}</div>
    </div>

    <div v-loading="loading" class="screen-shell">
      <section class="metric-strip">
        <article v-for="item in overviewMetrics" :key="item.label" class="metric-chip">
          <div class="metric-chip-head">
            <span class="metric-chip-label">{{ item.label }}</span>
            <i class="metric-chip-dot" :style="{ backgroundColor: item.accent }" />
          </div>
          <div class="metric-chip-main">
            <strong class="metric-chip-value" :style="{ color: item.accent }">{{ item.value }}</strong>
            <span class="metric-chip-extra">{{ item.extra }}</span>
          </div>
        </article>
      </section>

      <section class="dashboard-grid">
        <article class="screen-panel panel-login">
          <div class="screen-panel-head compact-head">
            <div>
              <h3 class="screen-panel-title">登录趋势</h3>
              <p class="screen-panel-desc">{{ getRangeLabel() }}平台登录变化</p>
            </div>
            <span class="screen-panel-meta">{{ activeRange === 'custom' ? '自定义' : getRangeLabel() }}</span>
          </div>
          <VChart class="chart-wide" :option="loginTrendOption" autoresize />
        </article>

        <article class="screen-panel panel-ai">
          <div class="screen-panel-head compact-head">
            <div>
              <h3 class="screen-panel-title">AI 调用趋势</h3>
              <p class="screen-panel-desc">{{ getRangeLabel() }}吞吐</p>
            </div>
            <span class="screen-panel-meta">{{ activeRange === 'custom' ? '自定义' : getRangeLabel() }}</span>
          </div>
          <VChart class="chart-square" :option="aiTrendOption" autoresize />
        </article>

        <article class="screen-panel screen-panel--dense panel-summary">
          <div class="screen-panel-head compact-head">
            <h3 class="screen-panel-title">关键摘要</h3>
          </div>
          <div class="summary-grid summary-grid--four summary-grid--dense">
            <div v-for="item in summaryMetrics" :key="item.label" class="summary-cell">
              <span class="summary-cell-label">{{ item.label }}</span>
              <strong class="summary-cell-value">{{ item.value }}</strong>
            </div>
          </div>
        </article>

        <article class="screen-panel screen-panel--dense panel-events">
          <div class="screen-panel-head compact-head">
            <h3 class="screen-panel-title">热点事件</h3>
          </div>
          <VChart v-if="topEvents.length > 0" class="chart-square" :option="eventChartOption" autoresize />
          <el-empty v-else description="暂无事件数据" :image-size="48" />
        </article>

        <article class="screen-panel screen-panel--dense panel-growth">
          <div class="screen-panel-head compact-head">
            <h3 class="screen-panel-title">增长摘要</h3>
          </div>
          <div class="summary-grid summary-grid--two summary-grid--dense">
            <div v-for="item in growthMetrics" :key="item.label" class="summary-cell">
              <span class="summary-cell-label">{{ item.label }}</span>
              <strong class="summary-cell-value">{{ item.value }}</strong>
            </div>
          </div>
        </article>

        <article class="screen-panel screen-panel--dense panel-volume">
          <div class="screen-panel-head compact-head">
            <h3 class="screen-panel-title">规模补充</h3>
          </div>
          <div class="summary-grid summary-grid--two summary-grid--dense">
            <div v-for="item in volumeMetrics" :key="item.label" class="summary-cell">
              <span class="summary-cell-label">{{ item.label }}</span>
              <strong class="summary-cell-value">{{ item.value }}</strong>
            </div>
          </div>
        </article>

        <article class="screen-panel panel-qaperf">
          <div class="screen-panel-head compact-head">
            <div>
              <h3 class="screen-panel-title">AI 问答链路耗时</h3>
              <p class="screen-panel-desc">
                {{ hasQaPerf ? `分段 P50 / P95 · 样本 ${qaPerf?.sampleCount ?? 0}` : '暂无 qa_perf 采样' }}
              </p>
            </div>
          </div>
          <template v-if="hasQaPerf">
            <VChart class="chart-wide" :option="qaPerfChartOption" autoresize />
            <div class="summary-grid summary-grid--four summary-grid--dense qaperf-metrics">
              <div v-for="item in qaPerfMetrics" :key="item.label" class="summary-cell">
                <span class="summary-cell-label">{{ item.label }}</span>
                <strong class="summary-cell-value">{{ item.value }}</strong>
              </div>
            </div>
          </template>
          <el-empty v-else description="埋点已上线，等待线上问答积累样本" :image-size="48" />
        </article>

        <article class="screen-panel panel-feerror">
          <div class="screen-panel-head compact-head">
            <div>
              <h3 class="screen-panel-title">前端运行时错误</h3>
              <p class="screen-panel-desc">{{ getRangeLabel() }}区间 · 共 {{ feError?.total ?? 0 }} 次</p>
            </div>
          </div>
          <template v-if="hasFeError">
            <div class="feerror-body">
              <div class="feerror-chart-col">
                <VChart class="chart-donut" :option="feErrorSourceChartOption" autoresize />
                <div class="feerror-legend">
                  <div v-for="item in feErrorSourceLegend" :key="item.label" class="feerror-legend-item">
                    <i class="feerror-dot" :style="{ backgroundColor: item.color }" />
                    <span class="feerror-legend-label">{{ item.label }}</span>
                    <span class="feerror-legend-count">{{ item.count }}</span>
                  </div>
                </div>
              </div>
              <div class="feerror-messages">
                <div class="feerror-messages-title">高频错误</div>
                <div
                  v-for="(item, index) in feError?.topMessages ?? []"
                  :key="index"
                  class="feerror-message-row"
                >
                  <span class="feerror-message-text" :title="item.message">{{ item.message }}</span>
                  <span class="feerror-message-count">{{ item.count }}</span>
                </div>
              </div>
            </div>
          </template>
          <el-empty v-else description="区间内无前端错误上报" :image-size="48" />
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin-screen {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error-alert {
  margin-bottom: 0;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: 14px;
  background: var(--md-sys-color-surface-container-lowest);
}

.filter-bar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.range-selector {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.range-selector-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
}

.custom-range-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
  white-space: nowrap;
}

.screen-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 10px;
}

.metric-chip,
.screen-panel {
  border: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container-lowest);
  border-radius: 16px;
}

.metric-chip {
  min-height: 88px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
}

.metric-chip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.metric-chip-label,
.metric-chip-extra,
.screen-panel-desc,
.screen-panel-meta,
.summary-cell-label {
  color: var(--md-sys-color-on-surface-variant);
}

.metric-chip-label,
.summary-cell-label,
.screen-panel-meta {
  font-size: 12px;
}

.metric-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.metric-chip-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-chip-value,
.summary-cell-value {
  color: var(--md-sys-color-on-surface);
  font-variant-numeric: tabular-nums;
}

.metric-chip-value {
  font-size: 24px;
  line-height: 1.08;
  font-weight: 700;
}

.metric-chip-extra {
  font-size: 12px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-areas:
    'login login ai events'
    'summary summary growth volume'
    'qaperf qaperf feerror feerror';
  gap: 10px;
}

.panel-login {
  grid-area: login;
}

.panel-ai {
  grid-area: ai;
}

.panel-events {
  grid-area: events;
}

.panel-summary {
  grid-area: summary;
}

.panel-growth {
  grid-area: growth;
}

.panel-volume {
  grid-area: volume;
}

.panel-qaperf {
  grid-area: qaperf;
}

.panel-feerror {
  grid-area: feerror;
}

.screen-panel {
  padding: 12px 14px;
  box-shadow: var(--shadow-xs);
}

.screen-panel--dense {
  padding: 12px;
}

.screen-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.compact-head {
  margin-bottom: 6px;
}

.screen-panel-title {
  margin: 0;
  color: var(--md-sys-color-on-surface);
  font-size: 14px;
  font-weight: 600;
}

.screen-panel-desc {
  margin: 3px 0 0;
  font-size: 12px;
}

.screen-panel-meta {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--md-sys-color-surface-container-low);
  font-weight: 600;
}

.chart-wide {
  height: 176px;
}

.chart-square {
  height: 176px;
}

.summary-grid {
  display: grid;
  gap: 8px;
}

.summary-grid--dense {
  gap: 6px;
}

.summary-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.summary-cell {
  background: var(--md-sys-color-surface-container-low);
  border-radius: 12px;
}

.summary-cell {
  min-height: 52px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 3px;
}

.summary-cell-value {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
}

.panel-summary .summary-cell {
  background: color-mix(in srgb, var(--google-blue) 6%, var(--md-sys-color-surface-container-lowest));
}

.panel-summary .summary-cell-value {
  color: #1765cc;
}

.panel-growth .summary-cell {
  background: color-mix(in srgb, var(--google-green) 7%, var(--md-sys-color-surface-container-lowest));
}

.panel-growth .summary-cell-value {
  color: #0b8043;
}

.panel-volume .summary-cell {
  background: color-mix(in srgb, var(--google-orange) 7%, var(--md-sys-color-surface-container-lowest));
}

.panel-volume .summary-cell-value {
  color: #d56e0c;
}

.qaperf-metrics {
  margin-top: 10px;
}

.panel-qaperf .summary-cell {
  background: color-mix(in srgb, var(--google-purple) 6%, var(--md-sys-color-surface-container-lowest));
  min-height: 46px;
}

.panel-qaperf .summary-cell-value {
  color: #5b3bc4;
  font-size: 15px;
}

.feerror-body {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
  align-items: center;
}

.feerror-chart-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-donut {
  height: 132px;
}

.feerror-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feerror-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
}

.feerror-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.feerror-legend-label {
  flex: 1;
  min-width: 0;
}

.feerror-legend-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
}

.feerror-messages {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.feerror-messages-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 2px;
}

.feerror-message-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--google-red) 5%, var(--md-sys-color-surface-container-lowest));
}

.feerror-message-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--md-sys-color-on-surface);
  font-variant-numeric: tabular-nums;
}

.feerror-message-count {
  flex-shrink: 0;
  font-weight: 700;
  font-size: 13px;
  color: #c5221f;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1400px) {
  .metric-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      'login login'
      'ai events'
      'summary summary'
      'growth volume'
      'qaperf qaperf'
      'feerror feerror';
  }
}

@media (max-width: 900px) {
  .metric-strip,
  .summary-grid--two {
    grid-template-columns: minmax(0, 1fr);
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'login'
      'ai'
      'summary'
      'events'
      'growth'
      'volume'
      'qaperf'
      'feerror';
  }

  .summary-grid--four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .feerror-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .filter-bar-main {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }

  .range-selector {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 768px) {
  .chart-wide,
  .chart-square {
    height: 180px;
  }
}
</style>
