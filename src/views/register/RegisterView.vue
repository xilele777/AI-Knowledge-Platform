<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
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
  <div class="auth-page">
    <div class="auth-bg-decor">
      <div class="decor-circle decor-1" />
      <div class="decor-circle decor-2" />
    </div>

    <div class="auth-container">
      <div class="brand-section">
        <div class="brand-logo">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="url(#reg-logo-grad)"/>
            <defs>
              <linearGradient id="reg-logo-grad" x1="0" y1="0" x2="48" y2="48">
                <stop stop-color="#1a73e8"/>
                <stop offset="1" stop-color="#7c4dff"/>
              </linearGradient>
            </defs>
            <path d="M15 18h18v3H15v-3zm0 9h18v3H15v-3z" fill="white"/>
          </svg>
        </div>
        <h1 class="brand-name gradient-text">加入我们</h1>
        <p class="brand-subtitle">Start Your AI Journey</p>
        <p class="brand-desc">创建账号，开启智能知识管理之旅</p>
      </div>

      <div class="form-section">
        <div class="form-card">
          <div class="form-header">
            <h2>创建账号</h2>
            <p>开始使用 AI 知识库平台</p>
          </div>

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
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 40px;
  background: linear-gradient(135deg, #f5f3ff 0%, #eef2ff 50%, #f8fafc 100%);
  overflow: hidden;
}

.auth-bg-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.decor-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.06;
}

.decor-1 {
  width: 500px;
  height: 500px;
  background: var(--module-chat);
  top: -150px;
  left: -150px;
}

.decor-2 {
  width: 350px;
  height: 350px;
  background: var(--module-docs);
  bottom: -80px;
  right: -80px;
}

.auth-container {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 960px;
  background: var(--md-sys-color-surface-container-lowest);
  border-radius: 28px;
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.brand-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 48px;
  background: linear-gradient(135deg, #f5f3ff 0%, #f0f4ff 100%);
  text-align: center;
}

.brand-logo {
  margin-bottom: 24px;
}

.brand-name {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin: 0 0 8px;
}

.brand-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant);
  text-transform: uppercase;
  letter-spacing: 3px;
  margin: 0 0 16px;
}

.brand-desc {
  font-size: 14px;
  color: var(--md-sys-color-outline);
  margin: 0;
}

.form-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.form-card {
  width: 100%;
  max-width: 360px;
}

.form-header {
  margin-bottom: 32px;
}

.form-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
  margin: 0;
  letter-spacing: -0.25px;
}

.form-header p {
  margin: 6px 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
  height: 44px;
  font-weight: 600;
  font-size: 15px;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 14px;
  gap: 4px;
}

@media (max-width: 768px) {
  .auth-page {
    padding: 16px;
  }

  .auth-container {
    flex-direction: column;
    max-width: 440px;
  }

  .brand-section {
    padding: 40px 32px;
  }

  .brand-name {
    font-size: 24px;
  }

  .form-section {
    padding: 32px 24px;
  }
}
</style>