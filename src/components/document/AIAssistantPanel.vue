<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { generateAiTextStream } from '../../api/ai'
import { useAiConfigStore } from '../../stores/aiConfig'
import {
  aiAssistantActionOptions,
  getAiAssistantPrompt,
  type AiAssistantAction,
} from '../../utils/aiAssistantPrompts'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

type SourceType = 'document' | 'custom'

const props = defineProps<{
  currentContent: string
}>()

const emit = defineEmits<{
  (event: 'replace-content', value: string): void
  (event: 'append-content', value: string): void
}>()

const aiConfigStore = useAiConfigStore()

const running = ref(false)
const resultText = ref('')
const errorMessage = ref('')
const lastGeneratePayload = ref<{ systemPrompt: string; userPrompt: string } | null>(null)

const form = reactive({
  action: 'polish' as AiAssistantAction,
  source: 'document' as SourceType,
  customText: '',
})

const hasDocContent = computed(() => Boolean(props.currentContent.trim()))

const requestText = computed(() => {
  if (form.source === 'document') {
    return props.currentContent.trim()
  }
  return form.customText.trim()
})

const showEmptyState = computed(() => !running.value && !errorMessage.value && !resultText.value)

async function runGenerate(systemPrompt: string, userPrompt: string) {
  errorMessage.value = ''
  resultText.value = ''
  lastGeneratePayload.value = { systemPrompt, userPrompt }
  running.value = true

  try {
    const config = await aiConfigStore.ensureConfig()

    if (!aiConfigStore.isComplete) {
      ElMessage.warning('请先在个人中心配置 AI API 信息')
      return
    }

    const result = await generateAiTextStream(
      {
        systemPrompt,
        userPrompt,
        temperature: 0.7,
      },
      config,
      (chunk) => {
        resultText.value += chunk
      }
    )

    if (!result.success) {
      errorMessage.value = result.error || 'AI 生成失败'
      return
    }

    void track(ANALYTICS_EVENTS.AI_WRITING_CALL, {
      action: form.action,
      source: form.source,
      input_length: userPrompt.length,
      output_length: resultText.value.length,
      model: config.model,
      total_tokens: null,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI 生成失败'
  } finally {
    running.value = false
  }
}

async function handleGenerate() {
  if (!requestText.value) {
    errorMessage.value = '请输入待处理文本，或切换为「使用当前文档内容」。'
    return
  }

  await runGenerate(getAiAssistantPrompt(form.action), requestText.value)
}

async function handleRegenerate() {
  if (!lastGeneratePayload.value) {
    ElMessage.warning('暂无可重新生成的内容')
    return
  }

  await runGenerate(lastGeneratePayload.value.systemPrompt, lastGeneratePayload.value.userPrompt)
}

function handleReplace() {
  if (!resultText.value) {
    return
  }
  emit('replace-content', resultText.value)
}

function handleAppend() {
  if (!resultText.value) {
    return
  }
  emit('append-content', resultText.value)
}

async function handleCopy() {
  if (!resultText.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(resultText.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <el-card class="assistant-card" shadow="never">
    <template #header>
      <div class="assistant-header">
        <span>AI 写作助手</span>
      </div>
    </template>

    <el-form label-position="top" class="assistant-form">
      <el-form-item label="操作类型">
        <el-radio-group v-model="form.action" class="action-group">
          <el-radio-button
            v-for="item in aiAssistantActionOptions"
            :key="item.value"
            :label="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <div class="action-desc">
          {{ aiAssistantActionOptions.find((item) => item.value === form.action)?.description }}
        </div>
      </el-form-item>

      <el-form-item label="文本来源">
        <el-radio-group v-model="form.source">
          <el-radio value="document">使用当前文档内容</el-radio>
          <el-radio value="custom">手动输入文本</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-alert
        v-if="form.source === 'document' && !hasDocContent"
        title="当前文档内容为空，请先输入文档内容或切换为手动输入文本。"
        type="warning"
        :closable="false"
        show-icon
        class="source-alert"
      />

      <el-form-item v-if="form.source === 'custom'" label="待处理文本">
        <el-input
          v-model="form.customText"
          type="textarea"
          :rows="4"
          resize="vertical"
          maxlength="5000"
          show-word-limit
          placeholder="请输入要润色、扩写、总结或续写的文本"
        />
      </el-form-item>

      <div class="run-actions">
        <el-button type="primary" :loading="running" class="run-btn" @click="handleGenerate">
          生成结果
        </el-button>
        <el-button :disabled="running || !lastGeneratePayload" @click="handleRegenerate">
          重新生成
        </el-button>
      </div>
    </el-form>

    <div class="result-wrapper">
      <el-alert
        v-if="running"
        title="生成中..."
        type="success"
        :closable="false"
        show-icon
        class="loading-alert"
      />

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
      />

      <el-empty v-else-if="showEmptyState" description="请选择操作并生成 AI 结果" :image-size="72" />

      <template v-else>
        <div class="result-title">生成结果</div>

        <div class="result-content">
          <div class="answer-preview">
            <MdPreview :model-value="resultText" />
          </div>
        </div>

        <div class="result-actions">
          <el-button type="primary" plain @click="handleReplace">替换当前内容</el-button>
          <el-button type="success" plain @click="handleAppend">插入到文档末尾</el-button>
          <el-button @click="handleCopy">一键复制</el-button>
        </div>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.assistant-card {
  border: 1px solid #e6edf6;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.assistant-header {
  font-weight: bold;
  font-size: 16px;
}

.assistant-form {
  flex-shrink: 0;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-desc {
  margin-top: 8px;
  color: #8c8c8c;
  font-size: 12px;
}

.source-alert {
  margin-bottom: 12px;
}

.run-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 6px;
}

.run-btn {
  flex: 0;
}

.result-wrapper {
  margin-top: 14px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-alert {
  margin-bottom: 10px;
  flex-shrink: 0;
}

.result-title {
  margin-bottom: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.answer-preview {
  background: #fff;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e6edf8;
  margin-bottom: 10px;
}

:deep(.answer-preview .md-preview) {
  font-size: 15px;
}

:deep(.answer-preview .md-preview h1),
:deep(.answer-preview .md-preview h2),
:deep(.answer-preview .md-preview h3),
:deep(.answer-preview .md-preview h4),
:deep(.answer-preview .md-preview h5),
:deep(.answer-preview .md-preview h6) {
  margin-top: 12px;
  margin-bottom: 6px;
  color: #1f2d3d;
}

:deep(.answer-preview .md-preview p) {
  margin: 6px 0;
}

:deep(.answer-preview .md-preview code) {
  background-color: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
}

:deep(.answer-preview .md-preview pre) {
  background-color: #1e1e1e;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

:deep(.answer-preview .md-preview pre code) {
  background: transparent;
  color: #d4d4d4;
  padding: 0;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
  margin-top: auto;
}
</style>
