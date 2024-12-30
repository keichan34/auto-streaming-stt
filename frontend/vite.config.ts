import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',

      manifest: {
        "short_name": "防災放送",
        "name": "屋久島の防災放送",
        "icons": [
          {
            "src": "icon-32.png",
            "type": "image/png",
            "sizes": "32x32"
          },
          {
            "src": "icon-192.png",
            "type": "image/png",
            "sizes": "192x192"
          }
        ],
        "start_url": ".",
        "display": "standalone",
        "theme_color": "#000000",
        "background_color": "#ffffff"
      },

      devOptions: {
        enabled: true,
        type: 'module',
      }
    }),
  ],
  server: {
    proxy: {
      '/api/streams': {
        target: "https://bousai.yakushima.blog",
        changeOrigin: true,
      }
    }
  }
})
