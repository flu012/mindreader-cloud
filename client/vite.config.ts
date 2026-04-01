import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // MindReader UI components call fetch("/api/...") with relative paths.
      // Rewrite to the .NET GraphProxyController at /api/v1/graph/...
      // which then forwards to the Express backend.
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        rewrite: (path) => `/api/v1/graph${path.slice(4)}`,
      },
    },
  },
})
