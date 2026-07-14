<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import PageContainer from '@/components/shared/PageContainer.vue'
import StatCard from '@/components/shared/StatCard.vue'
import { getAdminAnalyticsOverview, type AdminAnalyticsOverview } from '../../api/admin'

const VChart = defineAsyncComponent(() => import('vue-echarts'))

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
  <PageContainer
    width="full"
    class="admin-page"
    title="统计分析"
    description="近 7 天平台使用趋势与关键指标"
  >
    <template #actions>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div v-loading="loading" class="analytics-content">
      <div class="stats-grid">
        <StatCard
          v-for="item in metricCards"
          :key="item.label"
          :label="item.label"
          :value="item.value"
          :color="item.color"
        />
      </div>

      <div class="chart-grid">
        <div class="panel">
          <h3 class="panel-title">最近 7 天登录趋势</h3>
          <VChart class="trend-chart" :option="loginTrendOption" autoresize />
        </div>

        <div class="panel">
          <h3 class="panel-title">最近 7 天 AI 调用趋势</h3>
          <VChart class="trend-chart" :option="aiTrendOption" autoresize />
        </div>
      </div>

      <div class="bottom-grid">
        <div class="extra-grid">
          <StatCard
            v-for="item in extraCards"
            :key="item.label"
            :label="item.label"
            :value="item.value"
            :color="item.color"
          />
        </div>

        <div class="panel">
          <h3 class="panel-title">近 7 天热点事件</h3>

          <el-empty v-if="topEvents.length === 0" description="暂无事件数据" :image-size="64" />

          <div v-else class="event-list">
            <div v-for="event in topEvents" :key="event.eventName" class="event-item">
              <span class="event-name">{{ event.eventName }}</span>
              <span class="event-count" style="color: var(--google-purple)">{{ event.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}

.analytics-content {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.trend-chart {
  height: 300px;
}

.bottom-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: start;
}

.extra-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
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

@media (max-width: 1200px) {
  .bottom-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .extra-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .extra-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .trend-chart {
    height: 260px;
  }
}
</style>
