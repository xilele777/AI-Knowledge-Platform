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

const statusType = computed(() => {
  if (props.item.status === 'published') {
    return 'success'
  }

  if (props.item.status === 'archived') {
    return 'info'
  }

  return 'warning'
})

const statusText = computed(() => {
  if (props.item.status === 'published') {
    return '已发布'
  }

  if (props.item.status === 'archived') {
    return '已归档'
  }

  return '草稿'
})

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
      }
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
      <h3 class="doc-title" :title="item.title">{{ item.title }}</h3>
      <div class="doc-tags">
        <el-tag v-if="item.isShared" size="small" type="success">共享中</el-tag>
        <el-tag size="small" :type="statusType">{{ statusText }}</el-tag>
      </div>
    </div>

    <div class="doc-meta">最近更新: {{ formattedTime }}</div>

    <div class="doc-actions" @click.stop>
      <el-button type="primary" link @click="handleOpen">编辑</el-button>
      <el-button :type="item.isShared ? 'info' : 'success'" link @click="handleToggleShare">
        {{ item.isShared ? '取消共享' : '共享' }}
      </el-button>
      <el-button type="danger" link @click="handleRemove">删除</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.doc-card {
  border: 1px solid #e6edf6;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.doc-card:hover {
  transform: translateY(-2px);
}

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.doc-title {
  margin: 0;
  font-size: 16px;
  color: #1f2a37;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-tags {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.doc-meta {
  color: #6b7280;
  font-size: 13px;
}

.doc-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
