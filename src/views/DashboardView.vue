<script setup lang="ts">
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">工作台</h1>
      <p class="page-subtitle">欢迎使用 AI 知识库平台</p>
    </div>

    <div class="cards-grid">
      <el-card class="feature-card primary-card">
        <div class="card-icon-wrapper">
          <div class="card-icon">📚</div>
        </div>
        <div class="feature-content">
          <h3>文档管理</h3>
          <p>创建、编辑和管理你的文档</p>
        </div>
      </el-card>

      <el-card class="feature-card secondary-card">
        <div class="card-icon-wrapper">
          <div class="card-icon">🧠</div>
        </div>
        <div class="feature-content">
          <h3>知识库</h3>
          <p>构建和维护专属知识库</p>
        </div>
      </el-card>

      <el-card class="feature-card tertiary-card">
        <div class="card-icon-wrapper">
          <div class="card-icon">💬</div>
        </div>
        <div class="feature-content">
          <h3>AI 对话</h3>
          <p>与 AI 助手进行智能对话</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--md-sys-spacing-lg);
  margin-top: var(--md-sys-spacing-xl);
}

.feature-card {
  display: flex;
  align-items: center;
  gap: var(--md-sys-spacing-md);
  transition: all var(--md-sys-transition-medium) var(--md-sys-motion-easing-standard);
  cursor: pointer;
  padding: var(--md-sys-spacing-lg);
  border: none;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--md-sys-elevation-level-2);
}

.primary-card {
  background: linear-gradient(135deg, var(--md-sys-color-primary-container) 0%, var(--md-sys-color-surface-container-low) 100%);
}

.secondary-card {
  background: linear-gradient(135deg, var(--md-sys-color-success-container) 0%, var(--md-sys-color-surface-container-low) 100%);
}

.tertiary-card {
  background: linear-gradient(135deg, var(--md-sys-color-tertiary-container) 0%, var(--md-sys-color-surface-container-low) 100%);
}

.card-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-icon {
  font-size: 48px;
  line-height: 1;
}

.feature-content h3 {
  margin: 0 0 var(--md-sys-spacing-xs);
  font-size: var(--md-sys-typescale-title-large);
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}

.feature-content p {
  margin: 0;
  font-size: var(--md-sys-typescale-body-medium);
  color: var(--md-sys-color-on-surface-variant);
}
</style>
