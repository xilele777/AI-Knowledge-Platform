<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

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
  if (!value) {
    callback(new Error('请再次输入密码'))
    return
  }

  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }

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
  if (!formRef.value) {
    return
  }

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }

  try {
    const data = await userStore.register(form.email, form.password)

    if (!data.session) {
      await userStore.login(form.email, form.password)
    }

    void track(ANALYTICS_EVENTS.REGISTER_SUCCESS, {
      email: form.email,
      register_method: 'email_password',
      auto_login: true,
    })

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
    <div class="auth-container">
      <div class="auth-content">
        <div class="app-brand">
          <div class="brand-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#1a73e8"/>
              <path d="M15 18h18v3H15v-3zm0 9h18v3H15v-3z" fill="white"/>
            </svg>
          </div>
          <h1 class="brand-name">AI 知识库平台</h1>
        </div>

        <el-card class="auth-card" :body-style="{ padding: '32px' }">
          <div class="auth-header">
            <h2>创建账号</h2>
            <p>加入我们开始使用</p>
          </div>

          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
            <el-form-item label="邮箱地址" prop="email">
              <el-input
                v-model="form.email"
                placeholder="you@example.com"
                clearable
                size="large"
              />
            </el-form-item>

            <el-form-item label="设置密码" prop="password">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                placeholder="请设置密码"
                clearable
                size="large"
              />
            </el-form-item>

            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="form.confirmPassword"
                type="password"
                show-password
                placeholder="请再次输入密码"
                clearable
                size="large"
                @keyup.enter="handleSubmit"
              />
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                class="submit-btn"
                :loading="userStore.loading"
                @click="handleSubmit"
                size="large"
              >
                注册
              </el-button>
            </el-form-item>
          </el-form>

          <div class="auth-footer">
            <span>已有账号？</span>
            <el-button link type="primary" @click="router.push('/login')" class="link-btn">
              去登录
            </el-button>
          </div>
        </el-card>
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
  padding: var(--md-sys-spacing-lg);
  background-color: var(--md-sys-color-background);
}

.auth-container {
  width: 100%;
  max-width: 440px;
}

.auth-content {
  width: 100%;
}

.app-brand {
  text-align: center;
  margin-bottom: var(--md-sys-spacing-xl);
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--md-sys-spacing-md);
}

.brand-name {
  font-size: var(--md-sys-typescale-headline-medium);
  font-weight: 400;
  color: var(--md-sys-color-on-background);
  margin: 0;
  letter-spacing: -0.5px;
}

.auth-card {
  border-radius: var(--md-sys-shape-corner-large);
  border: 1px solid var(--md-sys-color-outline-variant);
  background-color: var(--md-sys-color-surface-container-lowest);
}

.auth-header {
  text-align: left;
  margin-bottom: var(--md-sys-spacing-lg);
}

.auth-header h2 {
  margin: 0;
  font-size: var(--md-sys-typescale-headline-small);
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  letter-spacing: -0.25px;
}

.auth-header p {
  margin: var(--md-sys-spacing-xs) 0 0;
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
}

.submit-btn {
  width: 100%;
  margin-top: var(--md-sys-spacing-xs);
  height: 40px;
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: var(--md-sys-spacing-md);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--md-sys-typescale-body-medium);
  gap: var(--md-sys-spacing-xs);
}

.link-btn {
  padding: 4px 8px;
  font-weight: 500;
}

@media (max-width: 640px) {
  .auth-page {
    padding: var(--md-sys-spacing-md);
  }

  .brand-name {
    font-size: var(--md-sys-typescale-headline-small);
  }

  .auth-card :deep(.el-card__body) {
    padding: var(--md-sys-spacing-lg);
  }
}
</style>
