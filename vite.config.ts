import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('element-plus') || id.includes('@element-plus')) {
            return 'vendor-element-plus'
          }

          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }

          if (id.includes('echarts') || id.includes('vue-echarts')) {
            return 'vendor-charts'
          }

          return undefined
        },
      },
    },
  },
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
