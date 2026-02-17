import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [vue(), tailwindcss()],
    
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
        '/output': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    
    build: {
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
      
      // Optimize bundle
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'vue-router', 'pinia'],
            'vendor-utils': ['@vueuse/core'],
          },
        },
      },
    },
    
    // Environment variables prefix
    envPrefix: 'VITE_',
  }
})
