import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 상대 경로로 빌드해야 GitHub Pages 하위 경로(/저장소이름/)에서도 그대로 동작한다.
  base: './',
  plugins: [
    react(),
    // 개발 서버를 HTTPS로 띄워 같은 와이파이의 태블릿에서도 카메라를 쓸 수 있게 한다.
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: '쑥쑥 모션놀이터',
        short_name: '모션놀이터',
        lang: 'ko',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#FFF7E0',
        theme_color: '#FFB703',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,task,mp3,wav}'],
        // 예비용 non-SIMD 런타임은 거의 쓰이지 않으므로 미리 캐시하지 않는다.
        globIgnores: ['**/vision_wasm_nosimd_internal.*'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
});
