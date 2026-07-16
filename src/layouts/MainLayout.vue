<script setup lang="ts">
/**
 * MainLayout — 用户端布局薄包装
 *
 * 所有逻辑已下沉到 AppLayout，这里仅组装参数。
 */
import AppLayout from './AppLayout.vue'
import { mainMenuGroups } from '../router/menus'
</script>

<template>
  <AppLayout
    app-title="AI 知识库平台"
    :menu-groups="mainMenuGroups"
    home-path="/dashboard"
  />
</template>