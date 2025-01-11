import { defineConfig, loadEnv } from 'vite'
import { visualizer } from "rollup-plugin-visualizer";
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd());
  const upstream = env.VITE_API_UPSTREAM || 'http://localhost:3000';

  return {
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
      visualizer({
        filename: 'stats.html',
        gzipSize: true,
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: upstream,
          changeOrigin: true,
        },
        '/api/ws': {
          target: upstream.replace(/^http/, 'ws'),
          changeOrigin: true,
          ws: true,
        },
      }
    }
  };
});
