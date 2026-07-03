import { ref, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

export interface UseConfirmDeleteOptions {
  /** 确认弹窗标题 */
  title?: string
  /** 确认弹窗内容 */
  message?: string
  /** 撤销窗口时长(ms)，默认 5000 */
  undoDuration?: number
}

export interface UseConfirmDeleteReturn {
  /** 当前待撤销的删除项 ID */
  pendingDeleteId: ReturnType<typeof ref<string | null>>
  /** 是否正在删除中 */
  isDeleting: ReturnType<typeof ref<boolean>>

  /**
   * 执行删除（乐观更新 + 撤销Toast）
   *
   * 流程：
   * 1. 弹出确认弹窗
   * 2. 用户确认 → 立即从列表中移除（乐观更新）
   * 3. 显示 Toast：[已删除] [撤销]
   * 4. 在 undoDuration 内：
   *    - 用户点撤销 → 调用 onRestore 恢复数据
   *    - 超时 → 调用 deleteFn 真正删除
   * 5. 如果 deleteFn 失败 → 调用 onRestore 恢复数据
   */
  confirmAndDelete: (params: {
    id: string
    deleteFn: () => Promise<void>
    onRemove: (id: string) => void
    onRestore: (id: string) => void
  }) => Promise<boolean>
}

/**
 * 乐观删除 + 撤销 composable
 *
 * 用户确认删除后立即从 UI 中移除，显示带撤销按钮的 Toast。
 * 撤销窗口内可恢复，超时后执行真正的 API 删除。
 *
 * @example
 * ```ts
 * const { confirmAndDelete, isDeleting } = useConfirmDelete({
 *   message: '删除后不可恢复',
 *   undoDuration: 5000,
 * })
 *
 * await confirmAndDelete({
 *   id: doc.id,
 *   deleteFn: () => deleteDocument(doc.id),
 *   onRemove: (id) => docs.value = docs.value.filter(d => d.id !== id),
 *   onRestore: (id) => loadDocuments(), // 重新加载列表
 * })
 * ```
 */
export function useConfirmDelete(
  options: UseConfirmDeleteOptions = {},
): UseConfirmDeleteReturn {
  const {
    title = '删除确认',
    message = '删除后不可恢复，确认删除吗？',
    undoDuration = 5000,
  } = options

  const pendingDeleteId = ref<string | null>(null)
  const isDeleting = ref(false)

  let undoTimer: ReturnType<typeof setTimeout> | null = null
  let pendingDeleteFn: (() => Promise<void>) | null = null
  let pendingRestoreFn: ((id: string) => void) | null = null
  let pendingId: string | null = null

  function clearUndoState() {
    if (undoTimer) {
      clearTimeout(undoTimer)
      undoTimer = null
    }
    pendingDeleteFn = null
    pendingRestoreFn = null
    pendingId = null
    pendingDeleteId.value = null
  }

  async function confirmAndDelete(params: {
    id: string
    deleteFn: () => Promise<void>
    onRemove: (id: string) => void
    onRestore: (id: string) => void
  }): Promise<boolean> {
    const { id, deleteFn, onRemove, onRestore } = params

    // 1. 确认弹窗
    try {
      await ElMessageBox.confirm(message, title, {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return false
    }

    isDeleting.value = true

    // 2. 乐观删除：立即从 UI 移除
    onRemove(id)
    pendingDeleteId.value = id

    // 3. 保存恢复函数
    pendingDeleteFn = deleteFn
    pendingRestoreFn = onRestore
    pendingId = id

    // 4. 显示带撤销的 Toast
    ElMessage({
      message: '已删除',
      type: 'success',
      duration: undoDuration,
      showClose: true,
      // 自定义撤销按钮的内联样式
      customClass: 'undo-toast',
    })

    // 5. 设置撤销定时器
    undoTimer = setTimeout(async () => {
      await executeDelete()
    }, undoDuration)

    return true
  }

  async function executeDelete() {
    if (!pendingDeleteFn || !pendingId) return

    try {
      await pendingDeleteFn()
      ElMessage.success('已删除')
    } catch (error) {
      // API 失败 → 恢复数据
      if (pendingRestoreFn && pendingId) {
        pendingRestoreFn(pendingId)
      }
      ElMessage.error(error instanceof Error ? error.message : '删除失败，数据已恢复')
    } finally {
      clearUndoState()
      isDeleting.value = false
    }
  }

  onUnmounted(() => {
    clearUndoState()
  })

  return {
    pendingDeleteId,
    isDeleting,
    confirmAndDelete,
  }
}