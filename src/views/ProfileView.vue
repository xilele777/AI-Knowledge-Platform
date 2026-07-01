<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { useAiConfigStore } from '../stores/aiConfig'
import { saveUserAiConfig, deleteUserAiConfig } from '../api/userAiConfig'
import type { UserAiConfig } from '../types/ai'
import { resolveAiConfigFromUserConfig, isAiConfigComplete } from '../utils/aiConfig'

const pageTitle = '个人中心'
const userStore = useUserStore()
const aiConfigStore = useAiConfigStore()

const loading = ref(false)
const saving = ref(false)
const config = ref<UserAiConfig>({
  apiBaseUrl: '',
  apiKey: '',
  model: '',
})

const isConfigComplete = computed(() => {
  const resolved = resolveAiConfigFromUserConfig(config.value)
  return isAiConfigComplete(resolved)
})

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
  } catch (error) {
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
  } catch (error) {
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

async function clearConfig() {
  try {
    const result = await deleteUserAiConfig()
    if (result.success) {
      config.value = {
        apiBaseUrl: '',
        apiKey: '',
        model: '',
      }
      aiConfigStore.setConfig(config.value)
      ElMessage.success('配置已清除')
    } else {
      ElMessage.error(result.error || '清除失败')
    }
  } catch (error) {
    ElMessage.error('清除配置失败')
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="profile-container">
    <el-card class="info-card">
      <template #header>
        <div class="card-header">
          <span>{{ pageTitle }}</span>
        </div>
      </template>

      <div class="user-info">
        <p><strong>当前邮箱:</strong> {{ userStore.user?.email || '-' }}</p>
        <el-tag :type="isConfigComplete ? 'success' : 'warning'">
          AI配置: {{ isConfigComplete ? '已完成' : '未配置' }}
        </el-tag>
      </div>
    </el-card>

    <el-card class="config-card" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>AI API 配置</span>
        </div>
      </template>

      <el-form label-width="120px">
        <el-form-item label="API Base URL">
          <el-input
            v-model="config.apiBaseUrl"
            placeholder="例如: https://api.openai.com/v1"
            clearable
          />
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="config.apiKey"
            type="password"
            placeholder="请输入您的API Key"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item label="Model">
          <el-input
            v-model="config.model"
            placeholder="例如: gpt-4o-mini"
            clearable
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveConfig" :loading="saving">
            保存配置
          </el-button>
          <el-button @click="clearConfig">
            清除配置
          </el-button>
        </el-form-item>
      </el-form>

      <div class="hint">
        <p><strong>提示:</strong></p>
        <ul>
          <li><strong>必须配置</strong>您自己的 API Key 才能使用 AI 问答、写作助手和知识库功能</li>
          <li>API Key 加密存储于服务端数据库中，仅您本人可见和使用</li>
          <li>支持任何 OpenAI 兼容接口（如 OpenAI、MiniMax、DeepSeek 等）</li>
          <li>如未配置，AI 功能将返回错误提示</li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.profile-container {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  font-weight: bold;
  font-size: 16px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  margin-top: 20px;
  padding: 16px;
  background-color: var(--md-sys-color-surface-container-low);
  border-radius: 8px;
}

.hint ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.hint li {
  margin: 4px 0;
}
</style>
