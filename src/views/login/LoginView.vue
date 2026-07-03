<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
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
  <div class="auth-page">
    <!-- 背景装饰 -->
    <div class="auth-bg-decor">
      <div class="decor-circle decor-1" />
      <div class="decor-circle decor-2" />
      <div class="decor-line decor-3" />
    </div>

    <div class="auth-container">
      <!-- 品牌区 -->
      <div class="brand-section">
        <div class="brand-logo">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="url(#logo-grad)"/>
            <defs>
              <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48">
                <stop stop-color="#1a73e8"/>
                <stop offset="1" stop-color="#7c4dff"/>
              </linearGradient>
            </defs>
            <path d="M15 18h18v3H15v-3zm0 9h18v3H15v-3z" fill="white"/>
          </svg>
        </div>
        <h1 class="brand-name gradient-text">AI 知识库平台</h1>
        <p class="brand-subtitle">AI-Powered Knowledge Platform</p>
        <p class="brand-desc">智能文档管理 · 知识库构建 · AI 对话问答</p>
      </div>

      <!-- 表单区 -->
      <div class="form-section">
        <div class="form-card">
          <div class="form-header">
            <h2>欢迎回来</h2>
            <p>登录以继续使用</p>
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
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f5f3ff 100%);
  overflow: hidden;
}

/* 背景装饰 */
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
  width: 600px;
  height: 600px;
  background: var(--module-docs);
  top: -200px;
  right: -200px;
}

.decor-2 {
  width: 400px;
  height: 400px;
  background: var(--module-chat);
  bottom: -100px;
  left: -100px;
}

.decor-line {
  position: absolute;
  width: 200px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--module-chat), transparent);
  top: 30%;
  right: 15%;
  transform: rotate(-30deg);
  opacity: 0.15;
}

/* 容器 */
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

/* 品牌区 */
.brand-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 48px;
  background: linear-gradient(135deg, #f0f4ff 0%, #f5f3ff 100%);
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

/* 表单区 */
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