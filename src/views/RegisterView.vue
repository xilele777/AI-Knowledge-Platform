<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'

const pageTitle = '注册'
const router = useRouter()
const userStore = useUserStore()

const form = reactive({
  email: '',
  password: '',
})

const handleRegister = async () => {
  try {
    const data = await userStore.register(form.email, form.password)

    if (data.session) {
      ElMessage.success('注册成功，已自动登录')
      router.replace('/dashboard')
      return
    }

    ElMessage.success('注册成功，请前往邮箱完成验证后登录')
    router.replace('/login')
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败'
    ElMessage.error(message)
  }
}
</script>

<template>
  <el-card class="register-card">
    <h2>{{ pageTitle }}</h2>
    <p>使用邮箱和密码创建账号。</p>
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="you@example.com" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
      </el-form-item>
      <el-button type="primary" :loading="userStore.loading" @click="handleRegister">注册</el-button>
      <el-button link @click="router.push('/login')">返回登录</el-button>
    </el-form>
  </el-card>
</template>

<style scoped>
.register-card {
  max-width: 520px;
  margin: 40px auto;
}
</style>