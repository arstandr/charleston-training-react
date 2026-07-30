import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync } from 'fs'

const buildAt = new Date().toISOString()

export default defineConfig({
  define: {
    __BUILD_AT__: JSON.stringify(buildAt),
  },
  server: {
    port: 5170,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React in vendor so the shell gets React without pulling in the content chunk
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) return 'vendor-react'
          if (id.includes('flashcardDatabase')) return 'flashcard-data'
          // Do NOT put FlashcardsPageContent in its own chunk: that makes the shell statically import from it (Vite helper), so the content chunk runs at load time and hits TDZ
        },
      },
    },
  },
  plugins: [
    {
      name: 'write-version-json',
      buildStart() {
        writeFileSync('public/version.json', JSON.stringify({ buildAt }))
      },
    },
    react(),
    // PWA: enable when build SW step is fixed (install prompt & update UI work without it)
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['vite.svg'],
      manifest: {
        name: "Charleston's Training",
        short_name: 'Chartrain',
        description: 'Training app for Charleston\'s',
        theme_color: '#1F4D1C',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/us-central1-chartrain-20901\.cloudfunctions\.net\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
      dev: false,
      disable: true,
    }),
  ],
})
