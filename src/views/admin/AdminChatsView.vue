<script setup lang="ts">
import { ref } from 'vue'
import PageContainer from '@/components/shared/PageContainer.vue'
import { getAdminChatRecords, adminDeleteChat, type AdminChatRecordItem } from '../../api/admin'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const errorMessage = ref('')
const rows = ref<AdminChatRecordItem[]>([])

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

const loadChats = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await getAdminChatRecords(200)

  if (!result.success) {
    rows.value = []
    errorMessage.value = result.error || '获取问答记录失败'
    loading.value = false
    return
  }

  rows.value = result.data || []
  loading.value = false
}

const handleDeleteChat = async (chatId: string) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这个会话吗？这将删除该会话的所有消息记录，删除后无法恢复。',
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const result = await adminDeleteChat(chatId)
    if (!result.success) {
      throw new Error(result.error || '删除失败')
    }

    // Remove all records with this chatId from the list
    rows.value = rows.value.filter((row) => row.chatId !== chatId)

    ElMessage.success('会话已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
    }
  }
}

void loadChats()
</script>

<template>
  <PageContainer
    width="full"
    class="admin-page"
    title="问答管理"
    description="查看并管理用户的 AI 问答记录"
  >
    <template #actions>
      <el-button :loading="loading" @click="loadChats">刷新</el-button>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="error-alert"
    />

    <div class="panel">
      <div v-loading="loading">
        <el-empty v-if="!loading && rows.length === 0" description="暂无问答记录" />

        <el-table v-else :data="rows">
          <el-table-column prop="title" label="会话标题" min-width="160" />
          <el-table-column label="问题" min-width="320" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.question }}
            </template>
          </el-table-column>
          <el-table-column label="回答" min-width="380" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.answer || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="时间" min-width="160">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="100" fixed="right" align="center">
            <template #default="scope">
              <el-button
                type="danger"
                size="small"
                text
                @click="handleDeleteChat(scope.row.chatId)"
              >
                删除会话
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.error-alert {
  margin-bottom: 16px;
}
</style>
