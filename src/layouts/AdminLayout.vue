<script setup lang="ts">
/**
 * AdminLayout — 管理端布局薄包装
 *
 * 所有逻辑已下沉到 AppLayout，这里仅组装参数。
 */
import AppLayout from './AppLayout.vue'
import { adminMenuGroups } from '../router/menus'

const extraActions = [
  { key: 'back', label: '返回用户端', divided: true },
]
</script>

<template>
  <AppLayout
    app-title="管理后台"
    :menu-groups="adminMenuGroups"
    :extra-actions="extraActions"
  />
</template>