<script setup lang="ts">
import { computed } from 'vue'
import type { KnowledgeBaseListItem } from '../../../types/knowledge'

const props = defineProps<{
  item: KnowledgeBaseListItem
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'delete', id: string): void
}>()

const statusTagType = computed(() => {
  return props.item.status === 'active' ? 'success' : 'info'
})

function formatDate(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('zh-CN')
}

function handleOpen() {
  emit('open', props.item.id)
}

function handleDelete(event: MouseEvent) {
  event.stopPropagation()
  emit('delete', props.item.id)
}
</script>

<template>
  <el-card shadow="hover" class="kb-card" @click="handleOpen">
    <div class="card-header">
      <h3 class="title">{{ item.name }}</h3>
      <el-tag :type="statusTagType" size="small">{{ item.status }}</el-tag>
    </div>

    <p class="desc">{{ item.description || '暂无描述' }}</p>

    <div class="meta-row">
      <span>更新时间</span>
      <span>{{ formatDate(item.updatedAt) }}</span>
    </div>

    <div class="actions">
      <el-button type="danger" link @click.stop="handleDelete">删除</el-button>
      <el-button type="primary" link @click.stop="handleOpen">进入详情</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.kb-card {
  border: 1px solid #e7edf7;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.kb-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 16px;
  color: #1f2a37;
}

.desc {
  margin: 10px 0 12px;
  color: #5c6675;
  font-size: 13px;
  line-height: 1.5;
  min-height: 40px;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8692a6;
  font-size: 12px;
}

.actions {
  margin-top: 8px;
  text-align: right;
}
</style>
