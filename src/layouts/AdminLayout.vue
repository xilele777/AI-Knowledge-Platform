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
    <el-aside width="280px" class="layout-aside">
      <div class="aside-header">
        <div class="app-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#1a73e8"/>
            <path d="M10 12h12v2H10v-2zm0 6h12v2H10v-2z" fill="white"/>
          </svg>
        </div>
        <div class="app-title">管理后台</div>
      </div>
      <el-menu
        :default-active="activeMenu"
        :router="true"
        class="menu"
        background-color="transparent"
        text-color="#5f6368"
        active-text-color="#041e49"
      >
        <el-menu-item v-for="item in adminMenus" :key="item.index" :index="item.index">
          <span class="menu-text">{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="layout-container">
      <el-header class="layout-header">
        <div class="header-left">
          <h3 class="page-title">{{ route.meta?.title || '管理后台' }}</h3>
        </div>
        <div class="header-right">
          <div class="user-actions">
            <el-button @click="backToMain">
              返回用户端
            </el-button>
            <el-button text @click="handleLogout">
              退出登录
            </el-button>
          </div>
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
  background-color: var(--md-sys-color-background);
}

.layout-aside {
  width: 280px;
  flex-shrink: 0;
  background-color: var(--md-sys-color-surface-container-lowest);
  border-right: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.aside-header {
  padding: var(--md-sys-spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-sm);
  border-bottom: none;
  flex-shrink: 0;
}

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-title {
  font-size: var(--md-sys-typescale-title-large);
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  letter-spacing: 0.1px;
}

.menu {
  border-right: none;
  overflow-y: auto;
  flex: 1;
  padding: var(--md-sys-spacing-md) 0;
}

.menu-text {
  font-weight: 500;
}

.layout-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  background-color: var(--md-sys-color-background);
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: none;
  background-color: transparent;
  flex-shrink: 0;
  padding: 0 var(--md-sys-spacing-lg);
  height: 72px;
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: var(--md-sys-typescale-headline-small);
  font-weight: 400;
  color: var(--md-sys-color-on-background);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-md);
}

.user-actions {
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-sm);
}

.layout-main {
  padding: var(--md-sys-spacing-lg);
  overflow: auto;
  flex: 1;
  min-height: 0;
  background-color: var(--md-sys-color-background);
}

@media (max-width: 768px) {
  .layout-aside {
    width: 0;
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    z-index: 100;
    transition: width 0.3s ease;
    box-shadow: var(--md-sys-elevation-level-3);
  }

  .layout-aside.open {
    width: 280px;
  }

  .layout-main {
    padding: var(--md-sys-spacing-md);
  }

  .app-title {
    font-size: var(--md-sys-typescale-title-medium);
  }

  .page-title {
    font-size: var(--md-sys-typescale-title-large);
  }
}
</style>
