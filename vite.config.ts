// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Detecta si estamos en Replit (variables típicas del entorno)
const isReplit = !!process.env.REPL_ID

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // Escucha en 0.0.0.0
    port: 5173,
    strictPort: true,
    ...(isReplit
      ? {
          // 🔐 HMR seguro detrás del proxy HTTPS de Replit
          hmr: {
            protocol: 'wss',
            clientPort: 443
            // host: se omite para que use el origin actual del preview
          },
          // Permite los dominios del preview de Replit
          allowedHosts: ['.replit.dev', '.repl.co']
        }
      : {
          // Config local estándar (puedes ajustar si quieres)
          hmr: true
        })
  },
  // (Opcional) Mantén el mismo puerto también en `preview`
  preview: {
    port: 5173,
    strictPort: true
  }
})
