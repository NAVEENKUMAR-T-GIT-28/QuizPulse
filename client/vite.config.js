import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_SERVER_URL || 'http://localhost:5000'
  
  const allowedHosts = ['localhost']
  if (env.VITE_ALLOWED_HOST) {
    allowedHosts.push(env.VITE_ALLOWED_HOST)
  }

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts,
      proxy: {
        '/api': {
          target,
          changeOrigin: true
        },
        '/socket.io': {
          target,
          ws: true
        }
      }
    },
  }
})
