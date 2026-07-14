<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useAiConfigStore } from '@/stores/aiConfig'
import { saveUserAiConfig, deleteUserAiConfig } from '@/api/userAiConfig'
import { getSystemAiConfig, saveSystemAiConfig } from '@/api/systemAiConfig'
import { getMyDocuments } from '@/api/documents'
import type { UserAiConfig, SystemAiConfig } from '@/types/ai'
import { resolveAiConfigFromUserConfig, isAiConfigComplete } from '@/utils/aiConfig'
import { testChatApi, testEmbeddingApi, type ConnectivityResult } from '@/utils/aiConnectivity'

const userStore = useUserStore()
const aiConfigStore = useAiConfigStore()

type TabKey = 'aiConfig' | 'systemEmbedding'
const activeTab = ref<TabKey>('aiConfig')

const tabs = computed(() => {
  const items: Array<{ key: TabKey; label: string }> = [{ key: 'aiConfig', label: 'AI 配置' }]
  if (userStore.isAdmin) {
    items.push({ key: 'systemEmbedding', label: '系统向量' })
  }
  return items
})

function switchTab(key: TabKey) {
  activeTab.value = key
  if (key === 'systemEmbedding') {
    loadSystemConfig()
  }
}

// ── 用户对话 API 配置 ──
const loading = ref(false)
const saving = ref(false)
const docCount = ref<number>(0)

const config = ref<UserAiConfig>({
  apiBaseUrl: '',
  apiKey: '',
  model: '',
})

const isConfigComplete = computed(() => {
  const resolved = resolveAiConfigFromUserConfig(config.value)
  return isAiConfigComplete(resolved)
})

async function loadDocCount() {
  try {
    const result = await getMyDocuments()
    docCount.value = result.success ? (result.data?.length ?? 0) : 0
  } catch {
    // silently fail
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
      chatTestResult.value = null
      ElMessage.success('配置已清除')
    } else {
      ElMessage.error(result.error || '清除失败')
    }
  } catch {
    ElMessage.error('清除配置失败')
  }
}

// ── 系统向量配置（仅管理员）──
const sysConfig = ref<SystemAiConfig>({
  embeddingBaseUrl: '',
  embeddingApiKey: '',
  embeddingModel: '',
})
const sysLoading = ref(false)
const sysSaving = ref(false)
// 是否已有生效配置：已配置后再修改会导致存量向量与新模型不兼容，需要二次确认
const sysConfigured = ref(false)

async function loadSystemConfig() {
  sysLoading.value = true
  try {
    const result = await getSystemAiConfig()
    if (result.success && result.data) {
      sysConfig.value = {
        embeddingBaseUrl: result.data.embeddingBaseUrl || '',
        embeddingApiKey: result.data.embeddingApiKey || '',
        embeddingModel: result.data.embeddingModel || '',
      }
      sysConfigured.value = Boolean(result.data.embeddingApiKey)
    } else if (!result.success) {
      ElMessage.error(result.error || '加载系统向量配置失败')
    }
  } finally {
    sysLoading.value = false
  }
}

async function saveSystemConfig() {
  if (sysConfigured.value) {
    try {
      await ElMessageBox.confirm(
        '系统已存在生效的向量配置。修改向量模型后，之前入库的所有文档向量将与新模型不兼容，检索会失效，必须重新构建全部向量索引。确定要修改吗？',
        '高风险操作',
        {
          confirmButtonText: '我已了解风险，继续修改',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  sysSaving.value = true
  try {
    const result = await saveSystemAiConfig(sysConfig.value)
    if (result.success) {
      sysConfigured.value = Boolean(sysConfig.value.embeddingApiKey?.trim())
      ElMessage.success('系统向量配置保存成功')
    } else {
      ElMessage.error(result.error || '保存失败')
    }
  } catch {
    ElMessage.error('保存系统向量配置失败')
  } finally {
    sysSaving.value = false
  }
}

// ── 连通性测试 ──
// 与 supabase/sql/014 中 pgvector 列的维度保持一致
const EXPECTED_EMBEDDING_DIMENSION = 1024

const testingChat = ref(false)
const chatTestResult = ref<ConnectivityResult | null>(null)
const testingSys = ref(false)
const sysTestResult = ref<ConnectivityResult | null>(null)

async function runChatTest() {
  testingChat.value = true
  chatTestResult.value = null
  try {
    chatTestResult.value = await testChatApi({
      baseUrl: config.value.apiBaseUrl,
      apiKey: config.value.apiKey,
      model: config.value.model,
    })
  } finally {
    testingChat.value = false
  }
}

async function runSysTest() {
  testingSys.value = true
  sysTestResult.value = null
  try {
    sysTestResult.value = await testEmbeddingApi({
      baseUrl: sysConfig.value.embeddingBaseUrl,
      apiKey: sysConfig.value.embeddingApiKey,
      model: sysConfig.value.embeddingModel,
    })
  } finally {
    testingSys.value = false
  }
}

const sysDimensionMismatch = computed(() => {
  const result = sysTestResult.value
  return Boolean(
    result?.success && result.dimension && result.dimension !== EXPECTED_EMBEDDING_DIMENSION,
  )
})

// ── 头像 ──
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

onMounted(() => {
  loadDocCount()
  loadConfig()
})
</script>

<template>
  <div class="profile-page">
    <!-- 账号头部 -->
    <header class="account-header">
      <div class="account-avatar" :style="{ background: avatarColor }">
        {{ initials }}
      </div>
      <div class="account-info">
        <div class="account-line">
          <h2 class="account-email">{{ userStore.email || '未登录' }}</h2>
          <el-tag v-if="userStore.isAdmin" type="warning" size="small" effect="plain" round>
            管理员
          </el-tag>
        </div>
        <div class="account-meta">
          <span>{{ docCount }} 篇文档</span>
          <span class="meta-divider">·</span>
          <span :class="{ 'meta-ok': isConfigComplete }">
            {{ isConfigComplete ? 'AI 已就绪' : 'AI 未配置' }}
          </span>
        </div>
      </div>
    </header>

    <!-- 水平 Tab -->
    <nav class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab-item"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- AI 配置 -->
    <section v-if="activeTab === 'aiConfig'" class="tab-panel" v-loading="loading">
      <p class="panel-lead">
        填写你自己的对话模型 API（任意 OpenAI 兼容接口，无需支持
        Embedding）。Key 存储在服务端，仅你本人可见。文档向量化由系统统一提供。
      </p>

      <el-form label-position="top" class="config-form">
        <div class="form-row">
          <el-form-item label="API Base URL" class="grow">
            <el-input
              v-model="config.apiBaseUrl"
              placeholder="https://api.openai.com/v1"
              clearable
            />
          </el-form-item>
          <el-form-item label="Model" class="grow">
            <el-input v-model="config.model" placeholder="gpt-4o-mini" clearable />
          </el-form-item>
        </div>
        <el-form-item label="API Key">
          <el-input
            v-model="config.apiKey"
            type="password"
            placeholder="sk-..."
            show-password
            clearable
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="chatTestResult"
        :type="chatTestResult.success ? 'success' : 'error'"
        :closable="false"
        show-icon
        class="test-result"
      >
        <template #title>
          <span v-if="chatTestResult.success">
            连接成功，耗时 {{ chatTestResult.latencyMs }} ms，可以保存使用
          </span>
          <span v-else>连接失败：{{ chatTestResult.error }}</span>
        </template>
      </el-alert>

      <footer class="panel-actions">
        <el-button type="primary" @click="saveConfig" :loading="saving">保存</el-button>
        <el-button @click="runChatTest" :loading="testingChat">测试连接</el-button>
        <el-button text type="danger" @click="clearConfig">清除配置</el-button>
      </footer>
    </section>

    <!-- 系统向量（仅管理员） -->
    <section
      v-if="activeTab === 'systemEmbedding' && userStore.isAdmin"
      class="tab-panel"
      v-loading="sysLoading"
    >
      <p class="panel-lead">
        平台级 Embedding API，全部用户的文档入库与检索共用。
        <strong>配置生效后请勿再修改</strong>——更换模型会使已入库的全部向量失效，需重建索引。
      </p>

      <el-form label-position="top" class="config-form">
        <div class="form-row">
          <el-form-item label="Base URL" class="grow">
            <el-input
              v-model="sysConfig.embeddingBaseUrl"
              placeholder="https://api.siliconflow.cn/v1"
              clearable
            />
          </el-form-item>
          <el-form-item label="Embedding 模型" class="grow">
            <el-input
              v-model="sysConfig.embeddingModel"
              placeholder="Qwen/Qwen3-Embedding-0.6B"
              clearable
            />
          </el-form-item>
        </div>
        <el-form-item label="API Key">
          <el-input
            v-model="sysConfig.embeddingApiKey"
            type="password"
            placeholder="服务端使用，普通用户不可见"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="sysTestResult"
        :type="sysTestResult.success ? (sysDimensionMismatch ? 'warning' : 'success') : 'error'"
        :closable="false"
        show-icon
        class="test-result"
      >
        <template #title>
          <span v-if="sysTestResult.success && sysDimensionMismatch">
            接口可用（{{ sysTestResult.latencyMs }} ms），但向量维度为
            {{ sysTestResult.dimension }}，与数据库 pgvector 列的
            {{ EXPECTED_EMBEDDING_DIMENSION }} 维不一致——保存前需先执行迁移调整列维度，否则入库会失败
          </span>
          <span v-else-if="sysTestResult.success">
            连接成功，耗时 {{ sysTestResult.latencyMs }} ms，向量维度
            {{ sysTestResult.dimension }}，与数据库一致
          </span>
          <span v-else>连接失败：{{ sysTestResult.error }}</span>
        </template>
      </el-alert>

      <footer class="panel-actions">
        <el-button type="primary" @click="saveSystemConfig" :loading="sysSaving">
          保存系统配置
        </el-button>
        <el-button @click="runSysTest" :loading="testingSys">测试连接</el-button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 8px 4px;
}

/* ── 账号头部 ── */
.account-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 24px;
}

.account-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.account-info {
  min-width: 0;
}

.account-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.account-email {
  margin: 0;
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--md-sys-typescale-body-small);
  color: var(--md-sys-color-on-surface-variant);
}

.meta-divider {
  color: var(--md-sys-color-outline-variant);
}

.meta-ok {
  color: var(--accent-emerald);
}

/* ── Tab 栏 ── */
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  margin-bottom: 24px;
}

.tab-item {
  padding: 10px 14px;
  margin-bottom: -1px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font: inherit;
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface-variant);
  cursor: pointer;
  transition: color var(--md-sys-transition-fast) ease;
}

.tab-item:hover {
  color: var(--md-sys-color-on-surface);
}

.tab-item.active {
  color: var(--md-sys-color-on-surface);
  font-weight: 600;
  border-bottom-color: var(--module-chat);
}

/* ── 面板 ── */
.panel-lead {
  margin: 0 0 20px;
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.7;
}

.panel-lead strong {
  color: var(--md-sys-color-on-surface);
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row .grow {
  flex: 1;
  min-width: 0;
}

.test-result {
  margin-bottom: 16px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
