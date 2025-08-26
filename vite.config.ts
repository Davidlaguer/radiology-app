import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // => 0.0.0.0 (necesario en Replit)
    port: 5173,          // fija el puerto
    strictPort: true,    // no cambies a otro puerto
    hmr: { clientPort: 443 } // HMR a través de HTTPS del dominio *.replit.dev
  }
})
