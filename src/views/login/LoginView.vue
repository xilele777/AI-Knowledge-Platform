<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'
import { ANALYTICS_EVENTS } from '../../constants/analyticsEvents'
import { track } from '../../utils/tracker'

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
  if (!formRef.value) {
    return
  }

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }

  try {
    await userStore.login(form.email, form.password)
    void track(ANALYTICS_EVENTS.LOGIN_SUCCESS, {
      email: form.email,
      login_method: 'email_password',
    })
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
    <div class="bg-shape bg-shape-a" />
    <div class="bg-shape bg-shape-b" />

    <el-card class="auth-card" shadow="hover">
      <div class="auth-header">
        <h2>欢迎回来</h2>
        <p>登录 AI 知识库协作平台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="you@example.com" clearable />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            clearable
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-button type="primary" class="full-btn" :loading="userStore.loading" @click="handleSubmit">
          登录
        </el-button>
      </el-form>

      <div class="auth-footer">
        <span>没有账号？</span>
        <el-button link type="primary" @click="router.push('/register')">去注册</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: linear-gradient(160deg, #f2f7ff 0%, #f8fafc 50%, #eef6f5 100%);
  overflow: hidden;
}

.bg-shape {
  position: absolute;
  border-radius: 999px;
  filter: blur(4px);
}

.bg-shape-a {
  top: -60px;
  left: -80px;
  width: 260px;
  height: 260px;
  background: rgba(64, 158, 255, 0.2);
}

.bg-shape-b {
  right: -60px;
  bottom: -80px;
  width: 300px;
  height: 300px;
  background: rgba(103, 194, 58, 0.16);
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  border: 1px solid #e5eef9;
}

.auth-header {
  margin-bottom: 12px;
}

.auth-header h2 {
  margin: 0;
  font-size: 26px;
  color: #1f2a37;
}

.auth-header p {
  margin: 8px 0 0;
  color: #637083;
  font-size: 14px;
}

.full-btn {
  width: 100%;
  margin-top: 6px;
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  color: #637083;
  font-size: 14px;
}
</style>
