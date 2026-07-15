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
})

const hasDocContent = computed(() => Boolean(props.currentContent.trim()))
const hasResult = computed(() => Boolean(resultText.value))
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
      { systemPrompt, userPrompt, temperature: 0.7 },
      config,
      (chunk) => { resultText.value += chunk },
    )

    if (!result.success) {
      errorMessage.value = result.error || 'AI 生成失败'
      return
    }

    void track(ANALYTICS_EVENTS.AI_WRITING_CALL, {
      action: form.action,
      source: 'document',
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
  if (!props.currentContent.trim()) {
    errorMessage.value = '文档内容为空，请先输入正文。'
    return
  }
  await runGenerate(getAiAssistantPrompt(form.action), props.currentContent.trim())
}

async function handleRegenerate() {
  if (!lastGeneratePayload.value) {
    ElMessage.warning('暂无可重新生成的内容')
    return
  }
  await runGenerate(lastGeneratePayload.value.systemPrompt, lastGeneratePayload.value.userPrompt)
}

function handleReplace() {
  if (!resultText.value) return
  emit('replace-content', resultText.value)
}

function handleAppend() {
  if (!resultText.value) return
  emit('append-content', resultText.value)
}

async function handleCopy() {
  if (!resultText.value) return
  try {
    await navigator.clipboard.writeText(resultText.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <el-card class="assistant-card" shadow="never">
    <!-- 操作区 -->
    <div class="form-area">
      <el-radio-group v-model="form.action" size="small" class="action-group">
        <el-radio-button
          v-for="item in aiAssistantActionOptions"
          :key="item.value"
          :label="item.value"
        >
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>

      <el-alert
        v-if="!hasDocContent"
        title="文档正文为空"
        type="warning"
        :closable="false"
        show-icon
        class="source-alert"
      />

      <div class="run-actions">
        <el-button
          v-if="!hasResult"
          type="primary"
          size="small"
          :loading="running"
          @click="handleGenerate"
        >
          生成
        </el-button>
        <el-button
          v-else
          size="small"
          plain
          :loading="running"
          @click="handleRegenerate"
        >
          重新生成
        </el-button>
      </div>
    </div>

    <!-- 结果区：仅可滚动内容 -->
    <div class="result-wrapper">
      <el-alert
        v-if="running"
        title="正在生成…"
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

      <el-empty v-else-if="showEmptyState" description="选择操作类型，点击生成" :image-size="56" />

      <div v-else class="result-scroll">
        <div class="answer-preview">
          <MdPreview :model-value="resultText" />
        </div>
      </div>
    </div>

    <!-- 底部操作：独立于结果区，固定在卡片底部 -->
    <div v-if="hasResult" class="result-actions">
      <el-button type="primary" size="small" @click="handleReplace">替换原文</el-button>
      <el-button size="small" plain @click="handleAppend">插入到末尾</el-button>
      <el-button size="small" plain @click="handleCopy">复制</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.assistant-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 关键：打通 el-card 内部 body 的 flex 高度链 */
.assistant-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ===== 操作区 ===== */
.form-area {
  flex-shrink: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

/* Radio 按钮组：单行均匀铺满 */
.action-group {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  width: 100%;
}

.action-group :deep(.el-radio-button) {
  flex: 1;
}

.action-group :deep(.el-radio-button__inner) {
  width: 100%;
  border-radius: var(--md-sys-shape-corner-small) !important;
  border: 1px solid var(--md-sys-color-outline-variant);
  padding: 5px 0;
  font-size: var(--md-sys-typescale-label-medium);
  line-height: 1.4;
  text-align: center;
}

.action-group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  border-color: var(--md-sys-color-primary-container);
  box-shadow: none;
}

.source-alert {
  margin-top: 8px;
}

.run-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

/* 组件级强制覆盖全局 .el-button--default 的透明样式 */
.run-actions :deep(.el-button--plain) {
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline);
  color: var(--md-sys-color-on-surface);
}

.run-actions :deep(.el-button--plain:hover) {
  background: var(--md-sys-color-surface-container);
}

/* ===== 结果区 ===== */
.result-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-top: 10px;
}

.loading-alert {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.result-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  background: var(--md-sys-color-surface-container-lowest);
}

.answer-preview {
  padding: 14px 16px;
}

:deep(.answer-preview .md-preview) {
  font-size: 13px;
  line-height: 1.7;
}

:deep(.answer-preview .md-preview h1),
:deep(.answer-preview .md-preview h2),
:deep(.answer-preview .md-preview h3) {
  margin-top: 10px;
  margin-bottom: 4px;
  color: var(--md-sys-color-on-surface);
}

:deep(.answer-preview .md-preview p) {
  margin: 6px 0;
}

:deep(.answer-preview .md-preview code) {
  background-color: var(--md-sys-color-surface-container-low);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.answer-preview .md-preview pre) {
  background-color: #1e1e1e;
  padding: 10px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 6px 0;
}

:deep(.answer-preview .md-preview pre code) {
  background: transparent;
  color: #d4d4d4;
  padding: 0;
  font-size: 12px;
}

/* ===== 底部操作 ===== */
.result-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-top: 10px;
}

/* 组件级强制覆盖全局 .el-button--default 的透明样式 */
.result-actions :deep(.el-button--plain) {
  background: var(--md-sys-color-surface-container-lowest);
  border: 1px solid var(--md-sys-color-outline);
  color: var(--md-sys-color-on-surface);
}

.result-actions :deep(.el-button--plain:hover) {
  background: var(--md-sys-color-surface-container);
  border-color: var(--md-sys-color-outline);
}
</style>
