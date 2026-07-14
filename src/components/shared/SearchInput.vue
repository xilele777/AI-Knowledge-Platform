<script setup lang="ts">
/**
 * SearchInput — 统一搜索框
 *
 * 统一宽度（--search-input-width）与前缀搜索图标，
 * 替代各列表页手写的内联 SVG 搜索框。
 */
import { Search } from '@element-plus/icons-vue'

interface Props {
  placeholder?: string
}

withDefaults(defineProps<Props>(), {
  placeholder: '搜索...',
})

const model = defineModel<string>({ default: '' })
</script>

<template>
  <el-input
    v-model="model"
    :placeholder="placeholder"
    clearable
    class="search-input"
    :prefix-icon="Search"
  />
</template>

<style scoped>
.search-input {
  width: var(--search-input-width);
  max-width: 100%;
}
</style>
