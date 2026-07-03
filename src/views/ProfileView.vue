<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting, Document, DataAnalysis, Key } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useAiConfigStore } from '@/stores/aiConfig'
import { saveUserAiConfig, deleteUserAiConfig } from '@/api/userAiConfig'
import { getMyDocuments } from '@/api/documents'
import type { UserAiConfig } from '@/types/ai'
import { resolveAiConfigFromUserConfig, isAiConfigComplete } from '@/utils/aiConfig'
import GradientTitle from '@/components/shared/GradientTitle.vue'

const userStore = useUserStore()
const aiConfigStore = useAiConfigStore()

const activeTab = ref<'overview' | 'aiConfig'>('overview')
const loading = ref(false)
const saving = ref(false)
const docCount = ref<number>(0)
const overviewLoading = ref(false)

const config = ref<UserAiConfig>({
  apiBaseUrl: '',
  apiKey: '',
  model: '',
})

const isConfigComplete = computed(() => {
  const resolved = resolveAiConfigFromUserConfig(config.value)
  return isAiConfigComplete(resolved)
})

async function loadOverview() {
  overviewLoading.value = true
  try {
    const result = await getMyDocuments()
    docCount.value = result.success ? (result.data?.length ?? 0) : 0
  } catch {
    // silently fail
  } finally {
    overviewLoading.value = false
  }
}

async function loadConfig() {
  loading.value = true
  try {
    await aiConfigStore.loadConfig()
    if (aiConfigStore.userConfig) {
      config.value = {
        apiBaseUrl: aiConfigStore.userConfig.apiBaseUrl || '',
        apiKey: aiConfigStore.userConfig.apiKey || '',
        model: aiConfigStore.userConfig.model || '',
      }
    }
  } catch {
    ElMessage.error('加载配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    const result = await saveUserAiConfig(config.value)
    if (result.success) {
      aiConfigStore.setConfig(config.value)
      ElMessage.success('配置保存成功')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch {
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

async function clearConfig() {
  try {
    const result = await deleteUserAiConfig()
    if (result.success) {
      config.value = { apiBaseUrl: '', apiKey: '', model: '' }
      aiConfigStore.setConfig(config.value)
      ElMessage.success('配置已清除')
    } else {
      ElMessage.error(result.error || '清除失败')
    }
  } catch {
    ElMessage.error('清除配置失败')
  }
}

const emailHash = computed(() => {
  const email = userStore.email || 'user@example.com'
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
})

const avatarColor = computed(() => {
  const colors = ['#1a73e8', '#7c4dff', '#0f9d58', '#ff6d01', '#e91e63', '#00bcd4']
  return colors[emailHash.value % colors.length]
})

const initials = computed(() => {
  const email = userStore.email || 'U'
  if (email.includes('@')) {
    return email.charAt(0).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
})

const statItems = computed(() => [
  { label: '我的文档', value: `${docCount.value}`, icon: Document },
  { label: 'AI 配置', value: isConfigComplete.value ? '已配置' : '未配置', icon: Key },
  { label: '角色', value: userStore.isAdmin ? '管理员' : '用户', icon: DataAnalysis },
])

onMounted(() => {
  loadOverview()
  loadConfig()
})
</script>

<template>
  <div class="profile-page">
    <GradientTitle
      title="个人中心"
      subtitle="My Profile"
      description="管理你的账户、AI 配置和个人信息"
      :gradient="'var(--gradient-purple)'"
    />

    <div class="profile-layout">
      <!-- 左侧信息卡 -->
      <aside class="profile-sidebar">
        <!-- 用户身份卡 -->
        <div class="user-card">
          <div class="user-avatar" :style="{ background: avatarColor }">
            {{ initials }}
          </div>
          <h3 class="user-email">{{ userStore.email || '未登录' }}</h3>
          <el-tag :type="isConfigComplete ? 'success' : 'warning'" size="small" round>
            {{ isConfigComplete ? 'AI 已配置' : 'AI 未配置' }}
          </el-tag>
        </div>

        <!-- 统计 -->
        <div class="stats-card">
          <div
            v-for="stat in statItems"
            :key="stat.label"
            class="stat-item"
          >
            <el-icon :size="20" color="var(--md-sys-color-on-surface-variant)">
              <component :is="stat.icon" />
            </el-icon>
            <div class="stat-info">
              <span class="stat-value-text">{{ stat.value }}</span>
              <span class="stat-label-text">{{ stat.label }}</span>
            </div>
          </div>
        </div>

        <!-- 功能入口 -->
        <div class="feature-grid">
          <div
            class="feature-item"
            :class="{ active: activeTab === 'overview' }"
            @click="activeTab = 'overview'"
          >
            <el-icon :size="20"><DataAnalysis /></el-icon>
            <span>概览</span>
          </div>
          <div
            class="feature-item"
            :class="{ active: activeTab === 'aiConfig' }"
            @click="activeTab = 'aiConfig'"
          >
            <el-icon :size="20"><Setting /></el-icon>
            <span>AI 配置</span>
          </div>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <main class="profile-main">
        <!-- 概览 Tab -->
        <div v-if="activeTab === 'overview'" class="tab-content">
          <div class="content-panel" v-loading="overviewLoading">
            <h3 class="panel-title">个人概览</h3>
            <p class="panel-desc">这里是你的账号概况</p>

            <div class="overview-stats">
              <div class="overview-card">
                <div class="overview-icon" style="background: rgba(26, 115, 232, 0.1)">
                  <el-icon :size="28" color="#1a73e8"><Document /></el-icon>
                </div>
                <div class="overview-body">
                  <span class="overview-number">{{ docCount }}</span>
                  <span class="overview-label">文档数量</span>
                </div>
              </div>

              <div class="overview-card">
                <div class="overview-icon" style="background: rgba(124, 77, 255, 0.1)">
                  <el-icon :size="28" color="#7c4dff"><Key /></el-icon>
                </div>
                <div class="overview-body">
                  <span class="overview-number" :class="{ configured: isConfigComplete }">
                    {{ isConfigComplete ? '已配置' : '未配置' }}
                  </span>
                  <span class="overview-label">AI API 状态</span>
                </div>
              </div>

              <div class="overview-card">
                <div class="overview-icon" style="background: rgba(15, 157, 88, 0.1)">
                  <el-icon :size="28" color="#0f9d58"><DataAnalysis /></el-icon>
                </div>
                <div class="overview-body">
                  <span class="overview-number">{{ userStore.isAdmin ? '管理员' : '普通用户' }}</span>
                  <span class="overview-label">账号角色</span>
                </div>
              </div>
            </div>

            <div class="overview-info">
              <h4>账号信息</h4>
              <div class="info-row">
                <span class="info-key">邮箱</span>
                <span class="info-val">{{ userStore.email || '-' }}</span>
              </div>
              <div class="info-row">
                <span class="info-key">用户 ID</span>
                <span class="info-val mono">{{ userStore.user?.id || '-' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- AI 配置 Tab -->
        <div v-if="activeTab === 'aiConfig'" class="tab-content">
          <div class="content-panel" v-loading="loading">
            <h3 class="panel-title">AI API 配置</h3>
            <p class="panel-desc">配置你的大模型 API 以启用 AI 问答、写作助手等功能</p>

            <el-form label-width="120px" class="ai-form">
              <el-form-item label="API Base URL">
                <el-input
                  v-model="config.apiBaseUrl"
                  placeholder="例如: https://api.openai.com/v1"
                  clearable
                  size="large"
                />
              </el-form-item>

              <el-form-item label="API Key">
                <el-input
                  v-model="config.apiKey"
                  type="password"
                  placeholder="请输入你的 API Key"
                  show-password
                  clearable
                  size="large"
                />
              </el-form-item>

              <el-form-item label="Model">
                <el-input
                  v-model="config.model"
                  placeholder="例如: gpt-4o-mini"
                  clearable
                  size="large"
                />
              </el-form-item>

              <el-form-item>
                <div class="form-actions">
                  <el-button type="primary" @click="saveConfig" :loading="saving" size="large">
                    保存配置
                  </el-button>
                  <el-button @click="clearConfig" size="large">
                    清除配置
                  </el-button>
                </div>
              </el-form-item>
            </el-form>

            <div class="config-hints">
              <p><strong>提示：</strong></p>
              <ul>
                <li><strong>必须配置</strong>你自己的 API Key 才能使用 AI 问答、写作助手和知识库功能</li>
                <li>API Key 加密存储于服务端数据库中，仅你本人可见和使用</li>
                <li>支持任何 OpenAI 兼容接口（如 OpenAI、MiniMax、DeepSeek 等）</li>
                <li>如未配置，AI 功能将返回错误提示</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 4px;
  max-width: 1280px;
}

/* ── 布局 ── */
.profile-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 32px;
  align-items: start;
}

/* ── 左侧 ── */
.profile-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 80px;
}

/* 用户身份卡 */
.user-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px 24px;
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  text-align: center;
}

.user-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

.user-email {
  margin: 0;
  font-size: var(--md-sys-typescale-title-small);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  word-break: break-all;
}

/* 统计卡 */
.stats-card {
  display: flex;
  flex-direction: column;
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  overflow: hidden;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-value-text {
  font-size: var(--md-sys-typescale-body-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.stat-label-text {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
}

/* 功能入口网格 */
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  cursor: pointer;
  transition: all var(--md-sys-transition-fast) ease;
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface-variant);
}

.feature-item:hover {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-outline);
}

.feature-item.active {
  background: linear-gradient(135deg, rgba(124, 77, 255, 0.08), rgba(26, 115, 232, 0.08));
  border-color: var(--module-chat);
  color: var(--module-chat);
  font-weight: 600;
}

/* ── 右侧主内容 ── */
.profile-main {
  min-width: 0;
}

.tab-content {
  animation: fadeIn var(--md-sys-transition-medium) var(--ease-out-expo);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.content-panel {
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 32px;
}

.panel-title {
  margin: 0 0 8px;
  font-size: var(--md-sys-typescale-title-large);
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.panel-desc {
  margin: 0 0 24px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

/* ── 概览卡片 ── */
.overview-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.overview-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
}

.overview-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--md-sys-shape-corner-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.overview-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overview-number {
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
  line-height: 1;
}

.overview-number.configured {
  color: var(--accent-emerald);
}

.overview-label {
  font-size: var(--md-sys-typescale-label-small);
  color: var(--md-sys-color-on-surface-variant);
}

/* ── 账号信息 ── */
.overview-info {
  padding-top: 24px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.overview-info h4 {
  margin: 0 0 16px;
  font-size: var(--md-sys-typescale-title-small);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.info-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.info-row:last-child {
  border-bottom: none;
}

.info-key {
  width: 100px;
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface-variant);
  flex-shrink: 0;
}

.info-val {
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
  word-break: break-all;
}

.info-val.mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: var(--md-sys-typescale-label-medium);
}

/* ── AI 配置表单 ── */
.ai-form {
  margin-top: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
}

.config-hints {
  margin-top: 32px;
  padding: 20px;
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-medium);
  font-size: var(--md-sys-typescale-body-small);
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.7;
}

.config-hints p {
  margin: 0 0 8px;
}

.config-hints ul {
  margin: 0;
  padding-left: 20px;
}

.config-hints li {
  margin: 4px 0;
}

/* ── 响应式 ── */
@media (max-width: 900px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }

  .profile-sidebar {
    position: static;
    order: -1;
  }

  .feature-grid {
    grid-template-columns: 1fr 1fr;
  }

  .overview-stats {
    grid-template-columns: 1fr;
  }
}
</style>