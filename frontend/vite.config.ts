import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MyRent Go',
        short_name: 'MyRent',
        description: 'Administración de propiedades y arriendos',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.VITE_PORT) || 4000,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:7070', changeOrigin: true },
      '/health': { target: process.env.VITE_API_PROXY || 'http://localhost:7070', changeOrigin: true },
      '/ws': { target: process.env.VITE_API_PROXY?.replace('http', 'ws') || 'ws://localhost:7070', ws: true },
    },
  },
})
