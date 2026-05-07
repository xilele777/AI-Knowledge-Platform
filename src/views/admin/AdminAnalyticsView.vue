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
      desc: '来自 profiles',
    },
    {
      label: '总文档数',
      value: value?.documentCount ?? 0,
      desc: '来自 documents',
    },
    {
      label: '总知识库文件数',
      value: value?.knowledgeFileCount ?? 0,
      desc: '来自 knowledge_files',
    },
    {
      label: '总 AI 调用数',
      value: value?.aiCallCount ?? 0,
      desc: 'qa_send + ai_writing_call',
    },
  ]
})

const extraCards = computed(() => {
  const value = stats.value

  return [
    {
      label: '近 7 天登录总量',
      value: value?.login7dTotal ?? 0,
    },
    {
      label: '近 7 天 AI 调用总量',
      value: value?.aiCall7dTotal ?? 0,
    },
    {
      label: '近 7 天活跃用户',
      value: value?.activeUser7d ?? 0,
    },
    {
      label: '近 7 天新增文档',
      value: value?.documentCreated7d ?? 0,
    },
    {
      label: '近 7 天新增知识文件',
      value: value?.fileCreated7d ?? 0,
    },
    {
      label: '近 7 天日均 AI 调用',
      value: value?.avgAiCallsPerDay ?? 0,
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
        },
        lineStyle: {
          width: 3,
        },
        itemStyle: {
          color: '#22c55e',
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
          color: '#3b82f6',
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
        <p class="page-subtitle">全局运营概览、7 天趋势与热点事件。</p>
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
          <el-card class="metric-card" shadow="hover">
            <div class="metric-label">{{ item.label }}</div>
            <div class="metric-value">{{ item.value }}</div>
            <div class="metric-desc">{{ item.desc }}</div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :lg="12">
          <el-card class="chart-card" shadow="never">
            <template #header>
              <div class="card-title">最近 7 天登录趋势</div>
            </template>
            <VChart class="trend-chart" :option="loginTrendOption" autoresize />
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card class="chart-card" shadow="never">
            <template #header>
              <div class="card-title">最近 7 天 AI 调用趋势</div>
            </template>
            <VChart class="trend-chart" :option="aiTrendOption" autoresize />
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="extra-row">
        <el-col :xs="24" :lg="16">
          <el-card class="extra-card" shadow="never">
            <template #header>
              <div class="card-title">补充指标（MVP+）</div>
            </template>
            <div class="extra-grid">
              <div v-for="item in extraCards" :key="item.label" class="extra-item">
                <div class="extra-label">{{ item.label }}</div>
                <div class="extra-value">{{ item.value }}</div>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="8">
          <el-card class="extra-card" shadow="never">
            <template #header>
              <div class="card-title">近 7 天热点事件</div>
            </template>

            <el-empty v-if="topEvents.length === 0" description="暂无事件数据" :image-size="64" />

            <div v-else class="event-list">
              <div v-for="event in topEvents" :key="event.eventName" class="event-item">
                <span class="event-name">{{ event.eventName }}</span>
                <el-tag type="info">{{ event.count }}</el-tag>
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
  font-size: 24px;
  color: #1f2a37;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.error-alert {
  margin-bottom: 12px;
}

.analytics-content {
  min-height: 280px;
}

.metric-card {
  border: 1px solid #e6edf6;
}

.metric-label {
  color: #6b7280;
  font-size: 13px;
}

.metric-value {
  margin-top: 10px;
  font-size: 32px;
  line-height: 1;
  font-weight: 700;
  color: #111827;
}

.metric-desc {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.chart-row,
.extra-row {
  margin-top: 2px;
}

.chart-card,
.extra-card {
  border: 1px solid #e7edf7;
}

.card-title {
  font-weight: 600;
  color: #1f2a37;
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
  border: 1px solid #e6edf6;
  border-radius: 10px;
  padding: 12px;
  background: #fcfdff;
}

.extra-label {
  font-size: 12px;
  color: #6b7280;
}

.extra-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 700;
  color: #111827;
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
  border: 1px solid #e6edf6;
  border-radius: 8px;
  padding: 10px;
}

.event-name {
  font-size: 13px;
  color: #1f2a37;
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
