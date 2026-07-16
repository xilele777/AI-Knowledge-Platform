<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Document,
  Share,
  Collection,
  ChatDotRound,
  User,
  HomeFilled,
  Folder,
  ChatLineSquare,
  DataAnalysis,
  ArrowLeftBold,
} from '@element-plus/icons-vue'
import type { MenuGroup } from '../router/menus'
import { useUserStore } from '../stores/user'

interface DropdownAction {
  key: string
  label: string
  divided?: boolean
  danger?: boolean
}

interface Props {
  menuGroups: MenuGroup[]
  appTitle?: string
  extraActions?: DropdownAction[]
  homePath?: string
}

const props = withDefaults(defineProps<Props>(), {
  appTitle: 'AI 知识库平台',
  extraActions: () => [],
  homePath: '/dashboard',
})

const iconMap: Record<string, Component> = {
  Document,
  Share,
  Collection,
  ChatDotRound,
  User,
  HomeFilled,
  Folder,
  ChatLineSquare,
  DataAnalysis,
}

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => {
  const path = route.path
  if (path === '/dashboard') return '/dashboard'
  if (path.startsWith('/docs/')) return '/docs'
  if (path.startsWith('/knowledge/')) return '/knowledge'
  if (path.startsWith('/shared/')) return '/shared'
  if (path === '/admin') return '/admin/dashboard'
  if (path.startsWith('/admin/')) {
    if (path.startsWith('/admin/users/')) return '/admin/users'
    if (path.startsWith('/admin/docs/')) return '/admin/docs'
    if (path.startsWith('/admin/files/')) return '/admin/files'
    if (path.startsWith('/admin/chats/')) return '/admin/chats'
    if (path.startsWith('/admin/operation-logs/')) return '/admin/operation-logs'
    return path
  }
  return path
})

const isAdmin = computed(() => userStore.isAdmin)

const visibleMenuGroups = computed(() => {
  return props.menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.requiresAdmin || isAdmin.value),
    }))
    .filter((group) => group.items.length > 0)
})

function handleMenuCommand(command: string) {
  const action = props.extraActions.find((a) => a.key === command)
  if (action) {
    if (action.key === 'admin') router.push('/admin')
    else if (action.key === 'back') router.push('/dashboard')
    return
  }

  if (command === 'logout') {
    void userStore.logout().then(() => router.replace('/login'))
  }
}

function goHome() {
  void router.push(props.homePath)
}
</script>

<template>
  <el-container class="layout-shell">
    <el-aside width="240px" class="layout-aside">
      <div
        class="aside-header app-brand"
        role="button"
        tabindex="0"
        @click="goHome"
        @keydown.enter.prevent="goHome"
        @keydown.space.prevent="goHome"
      >
        <div class="app-logo">
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="nav-logo-grad" x1="0" y1="0" x2="48" y2="48">
                <stop stop-color="#1a73e8" />
                <stop offset="1" stop-color="#7c4dff" />
              </linearGradient>
            </defs>
            <rect width="48" height="48" rx="12" fill="url(#nav-logo-grad)" />
            <path d="M14 17h20v3H14v-3zm0 11h20v3H14v-3z" fill="white" />
          </svg>
        </div>
        <div class="app-title gradient-text">{{ appTitle }}</div>
      </div>

      <nav class="menu">
        <template v-for="group in visibleMenuGroups" :key="group.label">
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

    <el-container class="layout-container">
      <el-header class="layout-header">
        <div class="header-left" />
        <div class="header-right">
          <el-dropdown trigger="click" placement="bottom-end" @command="handleMenuCommand">
            <div class="user-avatar-trigger">
              <el-avatar :size="32" class="user-avatar">
                {{ (userStore.displayName || 'U')[0].toUpperCase() }}
              </el-avatar>
              <span class="user-name">{{ userStore.displayName }}</span>
              <el-icon class="dropdown-caret"><ArrowLeftBold /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled class="dropdown-user-info">
                  <div class="dropdown-email">{{ userStore.user?.email || '-' }}</div>
                  <el-tag v-if="isAdmin" size="small" type="info" class="dropdown-role-tag">
                    管理员
                  </el-tag>
                </el-dropdown-item>

                <template v-for="action in extraActions" :key="action.key">
                  <el-dropdown-item :command="action.key" :divided="action.divided">
                    <span :class="{ 'logout-text': action.danger }">{{ action.label }}</span>
                  </el-dropdown-item>
                </template>

                <el-dropdown-item command="logout" :divided="extraActions.length > 0">
                  <span class="logout-text">退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="layout-main" :class="{ 'layout-main--fill': route.meta.fullBleed }">
        <router-view v-slot="{ Component }">
          <Transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </router-view>
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

.app-brand {
  cursor: pointer;
  transition: transform var(--md-sys-transition-medium) ease;
  border-radius: var(--md-sys-shape-corner-large);
}

.app-brand:hover {
  transform: translateY(-1px);
}

.app-brand:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

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
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

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
  position: relative;
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
  box-shadow: 0 0 12px rgba(26, 115, 232, 0.15);
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--md-sys-color-primary);
  border-radius: 0 3px 3px 0;
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
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  background-color: var(--md-sys-color-surface-container-lowest);
  flex-shrink: 0;
  padding: 0 var(--md-sys-spacing-lg);
  height: 64px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
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
  flex-direction: column;
  gap: 4px;
  align-items: flex-start !important;
}

.dropdown-email {
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
}

.dropdown-role-tag {
  pointer-events: none;
}

.logout-text {
  color: var(--md-sys-color-error);
}

.layout-main {
  padding: var(--md-sys-spacing-lg);
  overflow: auto;
  flex: 1;
  min-height: 0;
  background-color: var(--md-sys-color-background);
}

.layout-main--fill {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.page-fade-enter-active {
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.page-fade-leave-active {
  transition: opacity 150ms ease-in, transform 150ms ease-in;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
