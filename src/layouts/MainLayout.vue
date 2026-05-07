<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mainMenus } from '../router/menus'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => {
  if (route.path.startsWith('/docs/')) {
    return '/docs'
  }
  return route.path
})

const isAdmin = computed(() => userStore.isAdmin)

const handleLogout = async () => {
  await userStore.logout()
  router.replace('/login')
}

const goAdmin = () => {
  router.push('/admin')
}
</script>

<template>
  <el-container class="layout-shell">
    <el-aside width="220px" class="layout-aside">
      <div class="aside-title">AI 知识库平台</div>
      <el-menu router :default-active="activeMenu" class="menu">
        <el-menu-item v-for="item in mainMenus" :key="item.index" :index="item.index">
          {{ item.title }}
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="layout-container">
      <el-header class="layout-header">
        <div class="header-left">用户端</div>
        <div class="header-right">
          <el-tag type="info">{{ isAdmin ? 'admin' : 'user' }}</el-tag>
          <el-button v-if="isAdmin" type="primary" plain @click="goAdmin">进入后台</el-button>
          <el-button @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout-shell {
  height: 100vh;
  width: 100%;
  display: flex;
  overflow: hidden;
}

.layout-aside {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.aside-title {
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.menu {
  border-right: none;
  overflow-y: auto;
  flex: 1;
}

.layout-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
  flex-shrink: 0;
}

.header-left {
  font-size: 15px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.layout-main {
  padding: 16px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
</style>
