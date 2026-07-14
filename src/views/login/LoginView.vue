<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useUserStore } from '@/stores/user'
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents'
import { track } from '@/utils/tracker'

interface LoginForm {
  email: string
  password: string
}

const router = useRouter()
const userStore = useUserStore()
const formRef = ref<FormInstance>()

const form = reactive<LoginForm>({
  email: '',
  password: '',
})

const rules: FormRules<LoginForm> = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  try {
    await userStore.login(form.email, form.password)
    void track(ANALYTICS_EVENTS.LOGIN_SUCCESS, { email: form.email, login_method: 'email_password' })
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败，请稍后重试'
    ElMessage.error(message)
  }
}
</script>

<template>
  <AuthLayout
    brand-title="AI 知识库平台"
    brand-subtitle="AI-Powered Knowledge Platform"
    brand-desc="智能文档管理 · 知识库构建 · AI 对话问答"
    form-title="欢迎回来"
    form-subtitle="登录以继续使用"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="邮箱地址" prop="email">
        <el-input
          v-model="form.email"
          placeholder="you@example.com"
          clearable
          size="large"
        />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          placeholder="请输入密码"
          clearable
          size="large"
          @keyup.enter="handleSubmit"
        />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" class="submit-btn" :loading="userStore.loading" @click="handleSubmit" size="large">
          登录
        </el-button>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span>还没有账号？</span>
      <el-button link type="primary" @click="router.push('/register')">创建账号</el-button>
    </div>
  </AuthLayout>
</template>
