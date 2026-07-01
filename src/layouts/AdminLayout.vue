<script setup lang="ts">
import { computed, type FunctionalComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  HomeFilled,
  User,
  Document,
  Folder,
  ChatLineSquare,
  DataAnalysis,
  ArrowLeftBold,
} from '@element-plus/icons-vue'
import { adminMenuGroups } from '../router/menus'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const iconMap: Record<string, FunctionalComponent> = {
  HomeFilled,
  User,
  Document,
  Folder,
  ChatLineSquare,
  DataAnalysis,
}

const activeMenu = computed(() => route.path)

const backToMain = () => {
  router.push('/dashboard')
}

const handleLogout = async () => {
  await userStore.logout()
  router.replace('/login')
}

const handleMenuCommand = (command: string) => {
  if (command === 'back') backToMain()
  else if (command === 'logout') handleLogout()
}
</script>

<template>
  <el-container class="layout-shell">
    <!-- ===== 左侧导航 ===== -->
    <el-aside width="240px" class="layout-aside">
      <div class="aside-header">
        <div class="app-logo">
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#1a73e8"/>
            <path d="M10 12h12v2H10v-2zm0 6h12v2H10v-2z" fill="white"/>
          </svg>
        </div>
        <div class="app-title">管理后台</div>
      </div>

      <nav class="menu">
        <template v-for="group in adminMenuGroups" :key="group.label">
          <div class="menu-group-label">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="item.index"
            class="menu-item"
            :class="{ active: activeMenu === item.index }"
            @click="router.push(item.index)"
          >
            <el-icon class="menu-item-icon" :size="18">
              <component :is="iconMap[item.icon]" />
            </el-icon>
            <span class="menu-item-text">{{ item.title }}</span>
          </div>
        </template>
      </nav>
    </el-aside>

    <!-- ===== 右侧内容区 ===== -->
    <el-container class="layout-container">
      <el-header class="layout-header">
        <div class="header-left">
          <h3 class="page-title">{{ route.meta?.title || '管理后台' }}</h3>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click" placement="bottom-end" @command="handleMenuCommand">
            <div class="user-avatar-trigger">
              <el-avatar :size="32" class="user-avatar">
                {{ (userStore.user?.email || 'A')[0].toUpperCase() }}
              </el-avatar>
              <span class="user-name">{{ userStore.user?.email || '管理员' }}</span>
              <el-icon class="dropdown-caret"><ArrowLeftBold /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled class="dropdown-user-info">
                  <div class="dropdown-email">{{ userStore.user?.email || '-' }}</div>
                </el-dropdown-item>
                <el-dropdown-item command="back" divided>
                  返回用户端
                </el-dropdown-item>
                <el-dropdown-item command="logout">
                  <span class="logout-text">退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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

/* ---------- 侧边栏 ---------- */
.layout-aside {
  width: 240px;
  flex-shrink: 0;
  background-color: var(--md-sys-color-surface-container-lowest);
  border-right: 1px solid var(--md-sys-color-outline-variant);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.aside-header {
  padding: var(--md-sys-spacing-md) var(--md-sys-spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-sm);
  flex-shrink: 0;
}

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-title {
  font-size: var(--md-sys-typescale-title-medium);
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  letter-spacing: 0.1px;
}

/* ---------- 菜单 ---------- */
.menu {
  flex: 1;
  overflow-y: auto;
  padding: var(--md-sys-spacing-sm) var(--md-sys-spacing-sm);
}

.menu-group-label {
  padding: var(--md-sys-spacing-md) var(--md-sys-spacing-sm) var(--md-sys-spacing-xs);
  font-size: var(--md-sys-typescale-label-small);
  font-weight: 600;
  color: var(--md-sys-color-outline);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-sm);
  height: 44px;
  padding: 0 12px;
  margin-bottom: 2px;
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-label-large);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--md-sys-transition-medium) var(--md-sys-motion-easing-standard);
}

.menu-item:hover {
  background-color: rgba(0, 0, 0, var(--md-sys-state-hover-opacity));
  color: var(--md-sys-color-on-surface);
}

.menu-item.active {
  background-color: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  font-weight: 600;
}

.menu-item-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.menu-item.active .menu-item-icon {
  opacity: 1;
}

.menu-item-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 右侧容器 ---------- */
.layout-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  background-color: var(--md-sys-color-background);
}

/* ---------- 顶部栏 ---------- */
.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  background-color: var(--md-sys-color-surface-container-lowest);
  flex-shrink: 0;
  padding: 0 var(--md-sys-spacing-lg);
  height: 64px;
}

.page-title {
  font-size: var(--md-sys-typescale-headline-small);
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin: 0;
}

/* ---------- 用户区 ---------- */
.header-right {
  display: flex;
  align-items: center;
}

.user-avatar-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 12px 4px 4px;
  border-radius: var(--md-sys-shape-corner-full);
  transition: background-color var(--md-sys-transition-medium) ease;
}

.user-avatar-trigger:hover {
  background-color: var(--md-sys-color-surface-container);
}

.user-avatar {
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.user-name {
  font-size: var(--md-sys-typescale-label-medium);
  color: var(--md-sys-color-on-surface);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-caret {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  transform: rotate(-90deg);
  transition: transform var(--md-sys-transition-medium) ease;
}

.dropdown-user-info {
  display: flex;
  align-items: flex-start !important;
}

.dropdown-email {
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
}

.logout-text {
  color: var(--md-sys-color-error);
}

/* ---------- 内容区 ---------- */
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
    width: 240px;
  }

  .layout-main {
    padding: var(--md-sys-spacing-md);
  }

  .page-title {
    font-size: var(--md-sys-typescale-title-large);
  }

  .user-name {
    display: none;
  }

  .user-avatar-trigger {
    padding: 4px;
  }
}
</style>
