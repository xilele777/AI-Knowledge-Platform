<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { DocumentListItem } from '../../../types/document'
import { updateDocument } from '../../../api/documents'

const props = defineProps<{
  item: DocumentListItem
}>()

const emit = defineEmits<{
  open: [id: string]
  remove: [id: string]
  update: []
}>()

const formattedTime = computed(() => {
  const date = new Date(props.item.updatedAt)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const handleOpen = () => {
  emit('open', props.item.id)
}

const handleRemove = () => {
  emit('remove', props.item.id)
}

const handleToggleShare = async () => {
  try {
    const action = props.item.isShared ? '取消共享' : '共享'
    await ElMessageBox.confirm(
      `确定要${action}该文档吗？${props.item.isShared ? '取消后其他用户将无法访问。' : '共享后其他用户可以在共享广场查看此文档。'}`,
      `${action}确认`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )

    const result = await updateDocument(props.item.id, {
      isShared: !props.item.isShared,
    })

    if (!result.success) {
      ElMessage.error(result.error || `${action}失败`)
      return
    }

    ElMessage.success(`${action}成功`)
    emit('update')
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      return
    }
  }
}
</script>

<template>
  <el-card class="doc-card" shadow="hover" @click="handleOpen">
    <div class="doc-header">
      <div class="doc-title-wrap">
        <h3 class="doc-title" :title="item.title">{{ item.title }}</h3>
        <div class="doc-tags">
          <el-tag v-if="item.isShared" size="small" type="success">共享中</el-tag>
        </div>
      </div>
      <div class="doc-actions" @click.stop>
        <el-button size="small" type="primary" plain @click.stop="handleToggleShare">
          {{ item.isShared ? '取消共享' : '共享' }}
        </el-button>
        <el-button size="small" type="danger" plain @click.stop="handleRemove">删除</el-button>
      </div>
    </div>

    <div class="doc-meta">最近更新: {{ formattedTime }}</div>
  </el-card>
</template>

<style scoped>
.doc-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.doc-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--md-sys-color-primary);
  opacity: 0;
  transition: opacity var(--md-sys-transition-medium) ease;
  border-radius: 0 2px 2px 0;
}

.doc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
  border-color: var(--md-sys-color-outline);
}

.doc-card:hover::before {
  opacity: 1;
}

.doc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.doc-title-wrap {
  flex: 1;
  min-width: 0;
}

.doc-title {
  margin: 0;
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.doc-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-medium);
  padding-top: 10px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
}

.doc-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .doc-header {
    flex-direction: column;
  }

  .doc-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
