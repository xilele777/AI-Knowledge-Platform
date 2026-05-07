<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goSampleDoc = () => {
  router.push('/docs/demo-doc')
}
</script>

<template>
  <el-card>
    <h2>文档列表</h2>
    <p>这里是文档列表页面占位。</p>
    <el-button type="primary" @click="goSampleDoc">进入示例文档</el-button>
  </el-card>
</template>