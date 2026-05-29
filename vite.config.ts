import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api/llm': {
        target: 'https://api.scnet.cn',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    },
  },
})
