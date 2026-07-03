<script setup lang="ts">
/**
 * MainLayout — 用户端布局薄包装
 *
 * 所有逻辑已下沉到 AppLayout，这里仅组装参数。
 */
import { computed } from 'vue'
import AppLayout from './AppLayout.vue'
import { mainMenuGroups } from '../router/menus'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

const extraActions = computed(() => {
  const actions: Array<{ key: string; label: string; divided?: boolean; danger?: boolean }> = []
  if (isAdmin.value) {
    actions.push({ key: 'admin', label: '管理后台', divided: true })
  }
  return actions
})
</script>

<template>
  <AppLayout
    app-title="AI 知识库平台"
    :menu-groups="mainMenuGroups"
    :extra-actions="extraActions"
  />
</template>