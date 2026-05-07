import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import pinia from '../stores'
import { useUserStore } from '../stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/login/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/register/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/DashboardView.vue'),
      },
      {
        path: 'docs',
        name: 'Docs',
        component: () => import('../views/docs/DocsListView.vue'),
      },
      {
        path: 'docs/:id',
        name: 'DocDetail',
        component: () => import('../views/docs/DocEditorView.vue'),
        props: true,
      },
      {
        path: 'knowledge',
        name: 'Knowledge',
        component: () => import('../views/knowledge/KnowledgeListView.vue'),
      },
      {
        path: 'knowledge/:id',
        name: 'KnowledgeDetail',
        component: () => import('../views/knowledge/KnowledgeDetailView.vue'),
        props: true,
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('../views/ChatView.vue'),
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('../views/ProfileView.vue'),
      },
    ],
  },
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'AdminHome',
        component: () => import('../views/admin/AdminHomeView.vue'),
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('../views/admin/AdminUsersView.vue'),
      },
      {
        path: 'docs',
        name: 'AdminDocs',
        component: () => import('../views/admin/AdminDocsView.vue'),
      },
      {
        path: 'files',
        name: 'AdminFiles',
        component: () => import('../views/admin/AdminFilesView.vue'),
      },
      {
        path: 'chats',
        name: 'AdminChats',
        component: () => import('../views/admin/AdminChatsView.vue'),
      },
      {
        path: 'analytics',
        name: 'AdminAnalytics',
        component: () => import('../views/admin/AdminAnalyticsView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const PUBLIC_PATHS = ['/login', '/register']

router.beforeEach(async (to) => {
  const userStore = useUserStore(pinia)

  if (!userStore.initialized) {
    await userStore.initialize()
  }

  const isLoggedIn = userStore.isLoggedIn
  const isAdmin = userStore.isAdmin

  if (!isLoggedIn && !PUBLIC_PATHS.includes(to.path)) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  if (isLoggedIn && PUBLIC_PATHS.includes(to.path)) {
    return '/dashboard'
  }

  if (to.matched.some((record) => record.meta.requiresAdmin) && !isAdmin) {
    return '/dashboard'
  }

  return true
})

export default router