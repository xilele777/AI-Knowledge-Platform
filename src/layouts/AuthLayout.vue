<script setup lang="ts">
/**
 * AuthLayout — 登录/注册页共享布局
 *
 * 居中双栏卡片壳:左侧品牌区(logo + 标题文案),右侧表单区(默认 slot)。
 * slot 内约定类名 .submit-btn(提交按钮)与 .form-footer(底部切换链接),
 * 由本组件的 :deep 样式统一支撑。
 */
interface Props {
  /** 品牌区大标题(渐变字) */
  brandTitle: string
  /** 品牌区英文小字 */
  brandSubtitle: string
  /** 品牌区描述 */
  brandDesc: string
  /** 表单区标题 */
  formTitle: string
  /** 表单区副标题 */
  formSubtitle: string
}

defineProps<Props>()
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
            <rect width="48" height="48" rx="12" fill="url(#auth-logo-grad)"/>
            <defs>
              <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="48" y2="48">
                <stop stop-color="#1a73e8"/>
                <stop offset="1" stop-color="#7c4dff"/>
              </linearGradient>
            </defs>
            <path d="M15 18h18v3H15v-3zm0 9h18v3H15v-3z" fill="white"/>
          </svg>
        </div>
        <h1 class="brand-name gradient-text">{{ brandTitle }}</h1>
        <p class="brand-subtitle">{{ brandSubtitle }}</p>
        <p class="brand-desc">{{ brandDesc }}</p>
      </div>

      <!-- 表单区 -->
      <div class="form-section">
        <div class="form-card">
          <div class="form-header">
            <h2>{{ formTitle }}</h2>
            <p>{{ formSubtitle }}</p>
          </div>

          <slot />
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

/* slot 内约定类名(嵌在 el-form-item 深层插槽里,:slotted 标记传不到,须用 :deep) */
.form-card :deep(.submit-btn) {
  width: 100%;
  margin-top: 4px;
  height: 44px;
  font-weight: 600;
  font-size: 15px;
}

.form-card :deep(.form-footer) {
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
