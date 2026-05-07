<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminMenus } from '../router/menus'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)

const backToMain = () => {
  router.push('/dashboard')
}

const handleLogout = async () => {
  await userStore.logout()
  router.replace('/login')
}
</script>

<template>
  <el-container class="layout-shell">
    <el-aside width="220px" class="layout-aside">
      <div class="aside-title">后台管理</div>
      <el-menu router :default-active="activeMenu" class="menu">
        <el-menu-item v-for="item in adminMenus" :key="item.index" :index="item.index">
          {{ item.title }}
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="layout-container">
      <el-header class="layout-header">
        <div class="header-left">Admin</div>
        <div class="header-right">
          <el-button @click="backToMain">返回用户端</el-button>
          <el-button type="danger" plain @click="handleLogout">退出登录</el-button>
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