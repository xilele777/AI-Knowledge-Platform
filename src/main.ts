import { createApp } from 'vue'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import './styles/theme.css'
import './styles/element-plus-overrides.css'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import { useUserStore } from './stores/user'
import { initWebVitalsReporting } from './utils/perfMetrics'
import { initErrorMonitor } from './utils/errorMonitor'

// 不再 import 'element-plus/dist/index.css'（全量 ~351KB CSS）。
// 组件级 CSS 由 unplugin-vue-components 的 ElementPlusResolver 按需注入。

async function bootstrap() {
  const app = createApp(App)

  initErrorMonitor(app)

  app.use(pinia)

  const userStore = useUserStore()
  await userStore.initialize()

  app.use(router)

  app.mount('#app')

  initWebVitalsReporting()
}

bootstrap()
