import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isProduction = command === 'build'

  return {
    base: isProduction ? '/scan2doc/' : '/',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    optimizeDeps: {
      include: ['pdfjs-dist']
    },
    define: {
      global: 'globalThis'
    },
    worker: {
      format: 'es'
    }
  }
})
