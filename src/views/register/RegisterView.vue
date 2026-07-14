<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useUserStore } from '@/stores/user'
import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents'
import { track } from '@/utils/tracker'

interface RegisterForm {
  email: string
  password: string
  confirmPassword: string
}

const router = useRouter()
const userStore = useUserStore()
const formRef = ref<FormInstance>()

const form = reactive<RegisterForm>({
  email: '',
  password: '',
  confirmPassword: '',
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) { callback(new Error('请再次输入密码')); return }
  if (value !== form.password) { callback(new Error('两次输入的密码不一致')); return }
  callback()
}

const rules: FormRules<RegisterForm> = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: ['blur', 'change'] },
  ],
}

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  try {
    const data = await userStore.register(form.email, form.password)
    if (!data.session) await userStore.login(form.email, form.password)
    void track(ANALYTICS_EVENTS.REGISTER_SUCCESS, { email: form.email, register_method: 'email_password', auto_login: true })
    ElMessage.success('注册成功，欢迎使用')
    router.replace('/dashboard')
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败，请稍后重试'
    ElMessage.error(message)
  }
}
</script>

<template>
  <AuthLayout
    brand-title="加入我们"
    brand-subtitle="Start Your AI Journey"
    brand-desc="创建账号，开启智能知识管理之旅"
    form-title="创建账号"
    form-subtitle="开始使用 AI 知识库平台"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="邮箱地址" prop="email">
        <el-input v-model="form.email" placeholder="you@example.com" clearable size="large" />
      </el-form-item>
      <el-form-item label="设置密码" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="请设置密码" clearable size="large" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password placeholder="请再次输入密码" clearable size="large" @keyup.enter="handleSubmit" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" class="submit-btn" :loading="userStore.loading" @click="handleSubmit" size="large">
          注册
        </el-button>
      </el-form-item>
    </el-form>

    <div class="form-footer">
      <span>已有账号？</span>
      <el-button link type="primary" @click="router.push('/login')">去登录</el-button>
    </div>
  </AuthLayout>
</template>
