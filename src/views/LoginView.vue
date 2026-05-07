<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'

const pageTitle = '登录'
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({
  email: '',
  password: '',
})

const handleLogin = async () => {
  try {
    await userStore.login(form.email, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    router.replace(redirect)
    ElMessage.success('登录成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    ElMessage.error(message)
  }
}
</script>

<template>
  <el-card class="login-card">
    <h2>{{ pageTitle }}</h2>
    <p>请输入 Supabase 账号密码进行登录。</p>
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="you@example.com" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
      </el-form-item>
      <el-button type="primary" :loading="userStore.loading" @click="handleLogin">登录</el-button>
      <el-button link @click="router.push('/register')">去注册</el-button>
    </el-form>
  </el-card>
</template>

<style scoped>
.login-card {
  max-width: 520px;
  margin: 40px auto;
}
</style>