import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
