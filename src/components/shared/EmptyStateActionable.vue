<script setup lang="ts">
/**
 * EmptyStateActionable — 带行动召唤的空状态
 *
 * 替代 <el-empty>，增加引导性描述和 CTA 按钮，
 * 降低用户面对空列表时的困惑感。
 *
 * @example
 * <EmptyStateActionable
 *   icon="📄"
 *   title="还没有文档"
 *   description="创建你的第一篇文档，AI 助手会帮你润色和总结"
 *   action-text="新建文档"
 *   @action="openCreateDialog"
 * />
 */
import { Plus } from '@element-plus/icons-vue'
import SvgIcon from './SvgIcon.vue'

type IconName = 'document' | 'knowledge' | 'chat' | 'share' | 'dashboard' | 'user' | 'empty-folder' | 'empty-chat' | 'empty-doc'

interface Props {
  /** SvgIcon 图标名 */
  icon?: IconName
  /** 标题 */
  title: string
  /** 描述文案 */
  description?: string
  /** 操作按钮文案 */
  actionText?: string
  /** 是否显示操作按钮 */
  showAction?: boolean
}

withDefaults(defineProps<Props>(), {
  icon: 'empty-doc',
  showAction: true,
})

const emit = defineEmits<{
  (event: 'action'): void
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="icon" class="empty-icon">
    <SvgIcon :name="icon" :size="56" color="var(--md-sys-color-outline)" />
  </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <el-button
      v-if="showAction && actionText"
      type="primary"
      class="empty-action-btn"
      @click="emit('action')"
    >
      <el-icon v-if="actionText.includes('新建') || actionText.includes('创建')" class="action-icon">
        <Plus />
      </el-icon>
      {{ actionText }}
    </el-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  min-height: 320px;
}

.empty-icon {
  margin-bottom: 20px;
  opacity: 0.6;
  user-select: none;
}

.empty-title {
  margin: 0 0 8px;
  font-size: var(--md-sys-typescale-title-large);
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}

.empty-description {
  margin: 0 0 24px;
  max-width: 400px;
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface-variant);
  line-height: 1.6;
}

.empty-action-btn {
  margin-top: 4px;
}

.action-icon {
  margin-right: 4px;
}
</style>