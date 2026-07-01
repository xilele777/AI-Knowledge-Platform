<script setup lang="ts">
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { getAdminAnalyticsOverview, type AdminAnalyticsOverview } from '../../api/admin'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const loading = ref(false)
const errorMessage = ref('')
const stats = ref<AdminAnalyticsOverview | null>(null)

const metricCards = computed(() => {
  const value = stats.value

  return [
    {
      label: '总用户数',
      value: value?.userCount ?? 0,
      color: 'var(--google-blue)',
    },
    {
      label: '总文档数',
      value: value?.documentCount ?? 0,
      color: 'var(--google-green)',
    },
    {
      label: '总知识库文件数',
      value: value?.knowledgeFileCount ?? 0,
      color: 'var(--google-yellow)',
    },
    {
      label: '总 AI 调用数',
      value: value?.aiCallCount ?? 0,
      color: 'var(--google-red)',
    },
  ]
})

const extraCards = computed(() => {
  const value = stats.value

  return [
    {
      label: '近 7 天登录总量',
      value: value?.login7dTotal ?? 0,
      color: 'var(--google-purple)',
    },
    {
      label: '近 7 天 AI 调用总量',
      value: value?.aiCall7dTotal ?? 0,
      color: 'var(--google-orange)',
    },
    {
      label: '近 7 天活跃用户',
      value: value?.activeUser7d ?? 0,
      color: 'var(--google-blue)',
    },
    {
      label: '近 7 天新增文档',
      value: value?.documentCreated7d ?? 0,
      color: 'var(--google-green)',
    },
    {
      label: '近 7 天新增知识文件',
      value: value?.fileCreated7d ?? 0,
      color: 'var(--google-yellow)',
    },
    {
      label: '近 7 天日均 AI 调用',
      value: value?.avgAiCallsPerDay ?? 0,
      color: 'var(--google-red)',
    },
  ]
})

const loginTrendOption = computed(() => {
  const trend = stats.value?.loginTrend ?? []

  return {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['登录次数'],
    },
    grid: {
      left: 20,
      right: 20,
      bottom: 20,
      top: 40,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.date.slice(5)),
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        name: '登录次数',
        type: 'line',
        smooth: true,
        areaStyle: {
          opacity: 0.16,
          color: 'var(--google-blue)',
        },
        lineStyle: {
          width: 3,
          color: 'var(--google-blue)',
        },
        itemStyle: {
          color: 'var(--google-blue)',
        },
        data: trend.map((item) => item.value),
      },
    ],
  }
})

const aiTrendOption = computed(() => {
  const trend = stats.value?.aiCallTrend ?? []

  return {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['AI 调用次数'],
    },
    grid: {
      left: 20,
      right: 20,
      bottom: 20,
      top: 40,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date.slice(5)),
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        name: 'AI 调用次数',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: {
          color: 'var(--google-green)',
          borderRadius: [6, 6, 0, 0],
        },
        data: trend.map((item) => item.value),
      },
    ],
  }
})

const topEvents = computed(() => stats.value?.topEvents ?? [])

async function loadData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getAdminAnalyticsOverview(7)

    if (!result.success || !result.data) {
      stats.value = null
      errorMessage.value = result.error || '获取统计分析数据失败'
      return
    }

    stats.value = result.data
  } finally {
    loading.value = false
  }
}

void loadData()
</script>

<template>
  <div class="analytics-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">统计分析</h2>
      </div>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div v-loading="loading" class="analytics-content">
      <el-row :gutter="16">
        <el-col v-for="item in metricCards" :key="item.label" :xs="24" :sm="12" :lg="6">
          <el-card class="metric-card">
            <div class="metric-label">{{ item.label }}</div>
            <div class="metric-value" :style="{ color: item.color }">{{ item.value }}</div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :lg="12">
          <el-card class="chart-card">
            <template #header>
              <div class="card-title">最近 7 天登录趋势</div>
            </template>
            <VChart class="trend-chart" :option="loginTrendOption" autoresize />
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card class="chart-card">
            <template #header>
              <div class="card-title">最近 7 天 AI 调用趋势</div>
            </template>
            <VChart class="trend-chart" :option="aiTrendOption" autoresize />
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="extra-row">
        <el-col :xs="24" :lg="16">
          <el-card class="extra-card">
            <template #header>
              <div class="card-title">补充指标（MVP+）</div>
            </template>
            <div class="extra-grid">
              <div v-for="item in extraCards" :key="item.label" class="extra-item">
                <div class="extra-label">{{ item.label }}</div>
                <div class="extra-value" :style="{ color: item.color }">{{ item.value }}</div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="8">
          <el-card class="extra-card">
            <template #header>
              <div class="card-title">近 7 天热点事件</div>
            </template>

            <el-empty v-if="topEvents.length === 0" description="暂无事件数据" :image-size="64" />

            <div v-else class="event-list">
              <div v-for="event in topEvents" :key="event.eventName" class="event-item">
                <span class="event-name">{{ event.eventName }}</span>
                <span class="event-count" style="color: var(--google-purple)">{{ event.count }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.analytics-page {
  padding: 4px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: var(--md-sys-typescale-headline-small);
  color: var(--md-sys-color-on-background);
  font-weight: 400;
}

.page-subtitle {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

.error-alert {
  margin-bottom: 12px;
}

.analytics-content {
  min-height: 280px;
}

.metric-card {
  border: none;
  background-color: var(--md-sys-color-surface-container-low);
  transition: all var(--md-sys-transition-medium) var(--md-sys-motion-easing-standard);
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
}

.metric-label {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-large);
  font-weight: 500;
}

.metric-value {
  margin-top: 12px;
  font-size: var(--md-sys-typescale-display-small);
  line-height: 1;
  font-weight: 600;
  transition: color var(--md-sys-transition-medium);
}

.metric-desc {
  margin-top: 8px;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-outline);
}

.chart-row,
.extra-row {
  margin-top: 2px;
}

.chart-card,
.extra-card {
  border: none;
  background-color: var(--md-sys-color-surface-container-lowest);
}

.card-title {
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}

.trend-chart {
  height: 300px;
}

.extra-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.extra-item {
  border-radius: var(--md-sys-shape-corner-medium);
  padding: 12px;
  background: var(--md-sys-color-surface-container-low);
}

.extra-label {
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
  font-weight: 500;
}

.extra-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 600;
  transition: color var(--md-sys-transition-medium);
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: var(--md-sys-shape-corner-small);
  padding: 10px;
  background-color: var(--md-sys-color-surface-container-low);
}

.event-name {
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
}

.event-count {
  font-size: 18px;
  font-weight: 600;
}

:deep(.el-col) {
  margin-bottom: 16px;
}

@media (max-width: 1200px) {
  .extra-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .extra-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .trend-chart {
    height: 260px;
  }
}
</style>
