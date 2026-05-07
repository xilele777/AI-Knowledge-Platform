import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import {
  getCurrentSession,
  getCurrentUser,
  loginByEmail,
  logout as logoutRequest,
  onAuthStateChange,
  registerByEmail,
} from '../api/auth'

type UserRole = 'user' | 'admin'

let authSubscriptionBound = false

function resolveRole(user: User | null): UserRole {
  if (!user) {
    return 'user'
  }

  const appRole = user.app_metadata?.role
  const userRole = user.user_metadata?.role
  const role = appRole || userRole
  const appIsAdmin = user.app_metadata?.is_admin === true
  const userIsAdmin = user.user_metadata?.is_admin === true

  if (role === 'admin' || appIsAdmin || userIsAdmin) {
    return 'admin'
  }

  return 'user'
}

interface UserState {
  user: User | null
  session: Session | null
  role: UserRole
  initialized: boolean
  loading: boolean
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    user: null,
    session: null,
    role: 'user',
    initialized: false,
    loading: false,
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.session),
    isAdmin: (state) => state.role === 'admin',
    email: (state) => state.user?.email || '',
  },

  actions: {
    setAuth(user: User | null, session: Session | null) {
      this.user = user
      this.session = session
      this.role = resolveRole(user)
    },

    bindAuthListener() {
      if (authSubscriptionBound) {
        return
      }

      onAuthStateChange((_event, session) => {
        this.setAuth(session?.user ?? null, session)
      })

      authSubscriptionBound = true
    },

    async initialize() {
      if (this.initialized) {
        return
      }

      this.loading = true
      try {
        const session = await getCurrentSession()
        const user = session ? await getCurrentUser() : null
        this.setAuth(user, session)
      } catch (error) {
        console.error('[user.initialize] auth bootstrap failed:', error)
        this.setAuth(null, null)
      } finally {
        this.loading = false
        this.initialized = true
      }

      try {
        this.bindAuthListener()
      } catch (error) {
        console.error('[user.initialize] auth listener failed:', error)
      }
    },

    async register(email: string, password: string) {
      this.loading = true
      try {
        const data = await registerByEmail(email, password)
        this.setAuth(data.user ?? null, data.session ?? null)
        return data
      } finally {
        this.loading = false
      }
    },

    async login(email: string, password: string) {
      this.loading = true
      try {
        const data = await loginByEmail(email, password)
        this.setAuth(data.user, data.session)
        return data
      } finally {
        this.loading = false
      }
    },

    async logout() {
      this.loading = true
      try {
        await logoutRequest()
      } finally {
        this.setAuth(null, null)
        this.loading = false
      }
    },
  },
})
