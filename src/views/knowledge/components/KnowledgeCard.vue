<script setup lang="ts">
import { computed } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
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

    <div class="actions" @click.stop>
      <el-dropdown trigger="click" placement="bottom-end">
        <el-button class="more-btn" size="small" :icon="MoreFilled" circle />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleOpen">进入详情</el-dropdown-item>
            <el-dropdown-item class="danger-item" divided @click="handleDelete">删除</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </el-card>
</template>

<style scoped>
.kb-card {
  border: 1px solid var(--md-sys-color-outline-variant);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  position: relative;
  overflow: hidden;
}

.kb-card::before {
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

.kb-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--md-sys-elevation-level-2);
  border-color: var(--md-sys-color-outline);
}

.kb-card:hover::before {
  opacity: 1;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.desc {
  margin: 10px 0 12px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-small);
  line-height: 1.5;
  min-height: 40px;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--md-sys-color-outline);
  font-size: var(--md-sys-typescale-label-medium);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.actions {
  margin-top: 8px;
  text-align: right;
}

.more-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  opacity: 0;
  transform: translateX(4px);
  transition: opacity var(--md-sys-transition-medium) ease, transform var(--md-sys-transition-medium) ease;
}

.kb-card:hover .more-btn {
  opacity: 1;
  transform: translateX(0);
}

:deep(.danger-item) {
  color: var(--md-sys-color-error);
}
</style>
