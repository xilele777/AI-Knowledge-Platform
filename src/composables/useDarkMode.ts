import { ref, watch } from 'vue'

const STORAGE_KEY = 'app-theme-preference'

/**
 * 暗色模式 composable
 *
 * 优先级：localStorage 持久化 > 系统偏好 > 默认 false（浅色）
 * 切换时更新 <html data-theme> 属性 + 持久化到 localStorage
 */
export function useDarkMode() {
  function getInitialDark(): boolean {
    // 1. 读取 localStorage 持久化偏好
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark') return true
    if (stored === 'light') return false

    // 2. 读取系统偏好
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return true
    }

    // 3. 默认浅色
    return false
  }

  const isDark = ref(getInitialDark())

  function applyTheme(dark: boolean) {
    const root = document.documentElement
    if (dark) {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.removeAttribute('data-theme')
    }
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }

  function toggle() {
    isDark.value = !isDark.value
  }

  // 初始化时应用
  applyTheme(isDark.value)

  // 监听变化
  watch(isDark, (val) => {
    applyTheme(val)
  })

  // 监听系统偏好变化
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 仅在用户未手动设置时跟随系统
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        isDark.value = e.matches
      }
    })
  }

  return { isDark, toggle }
}