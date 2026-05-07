<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '../stores/user'

const pageTitle = '个人中心'
const userStore = useUserStore()

const email = computed(() => userStore.email || '-')
const role = computed(() => (userStore.isAdmin ? 'admin' : 'user'))
</script>

<template>
  <el-card>
    <h2>{{ pageTitle }}</h2>
    <p>这里是个人中心页面占位。</p>
    <p>当前邮箱: {{ email }}</p>
    <el-tag type="info">当前角色: {{ role }}</el-tag>
  </el-card>
</template>