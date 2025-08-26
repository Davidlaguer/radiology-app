
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // Permite escuchar en 0.0.0.0
    port: 5173,
    strictPort: true,
    hmr: { clientPort: 443 },
    allowedHosts: [
      // 🔑 Permite todos los subdominios de Replit
      ".replit.dev"
    ]
  }
})
