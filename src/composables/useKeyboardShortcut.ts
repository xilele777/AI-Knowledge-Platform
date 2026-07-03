import { onMounted, onUnmounted, type Ref } from 'vue'

type ShortcutHandler = (event: KeyboardEvent) => void

/**
 * 键盘快捷键 composable
 *
 * 自动处理 Mac (Cmd) vs Windows (Ctrl) 差异。
 * 组件卸载时自动清理监听器。
 *
 * @example
 * ```ts
 * useKeyboardShortcut({
 *   'ctrl+n': () => createDocument(),
 *   'escape': () => closeDrawer(),
 * }, { enabled: someCondition })
 * ```
 */
export function useKeyboardShortcut(
  shortcuts: Record<string, () => void>,
  options?: { enabled?: Ref<boolean> },
) {
  function parseShortcut(key: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
    const parts = key.toLowerCase().split('+')
    return {
      ctrl: parts.includes('ctrl') || parts.includes('cmd') || parts.includes('mod'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      key: parts.filter((p) => !['ctrl', 'cmd', 'mod', 'shift', 'alt'].includes(p)).join('+'),
    }
  }

  function matches(event: KeyboardEvent, shortcut: ReturnType<typeof parseShortcut>): boolean {
    const isMod = event.metaKey || event.ctrlKey
    if (shortcut.ctrl !== isMod) return false
    if (shortcut.shift !== event.shiftKey) return false
    if (shortcut.alt !== event.altKey) return false

    const eventKey = event.key.toLowerCase()
    const targetKey = shortcut.key.toLowerCase()

    // 特殊处理：escape
    if (targetKey === 'escape') return eventKey === 'escape'
    if (targetKey === 'enter') return eventKey === 'enter'
    if (targetKey === 'space') return eventKey === ' '

    return eventKey === targetKey
  }

  const handler: ShortcutHandler = (event) => {
    // 跳过输入框内的快捷键（除了 Escape）
    const target = event.target as HTMLElement
    const isInput = target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable

    if (options?.enabled && !options.enabled.value) return

    for (const [key, fn] of Object.entries(shortcuts)) {
      const parsed = parseShortcut(key)
      if (matches(event, parsed)) {
        // Escape 在输入框中也允许
        if (isInput && !parsed.key.includes('escape')) continue

        event.preventDefault()
        fn()
        return
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handler)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handler)
  })
}