import { createApp } from 'vue'
import 'element-plus/dist/index.css'
import './styles/theme.css'
import './styles/element-plus-overrides.css'
import './style.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import { useUserStore } from './stores/user'
import { installElementPlus } from './plugins/element-plus'

async function bootstrap() {
  const app = createApp(App)

  app.use(pinia)

  const userStore = useUserStore()
  await userStore.initialize()

  app.use(router)
  installElementPlus(app)

  app.mount('#app')
}

bootstrap()
