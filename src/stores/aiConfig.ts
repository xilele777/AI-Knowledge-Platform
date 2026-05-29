import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserAiConfig } from '../api/userAiConfig'
import type { UserAiConfig } from '../types/ai'
import { resolveAiConfigFromUserConfig, isAiConfigComplete, getAiConfigMissingFields } from '../utils/aiConfig'
import type { AiResolvedConfig } from '../utils/aiConfig'

export const useAiConfigStore = defineStore('aiConfig', () => {
  const userConfig = ref<UserAiConfig | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const resolvedConfig = computed<AiResolvedConfig>(() => {
    return resolveAiConfigFromUserConfig(userConfig.value)
  })

  const isComplete = computed(() => {
    return isAiConfigComplete(resolvedConfig.value)
  })

  const missingFields = computed(() => {
    return getAiConfigMissingFields(resolvedConfig.value)
  })

  async function loadConfig() {
    if (loading.value) return
    loading.value = true
    try {
      const result = await getUserAiConfig()
      if (result.success) {
        userConfig.value = result.data
      }
    } catch (error) {
      console.error('Failed to load AI config:', error)
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function ensureConfig() {
    if (!initialized.value) {
      await loadConfig()
    }
    return resolvedConfig.value
  }

  function setConfig(config: UserAiConfig) {
    userConfig.value = config
  }

  return {
    userConfig,
    loading,
    initialized,
    resolvedConfig,
    isComplete,
    missingFields,
    loadConfig,
    ensureConfig,
    setConfig,
  }
})
