import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Unlag',
        short_name: 'Unlag',
        description: 'A jet lag schedule from your flight and your sleep.',
        theme_color: '#fbfaf7',
        background_color: '#fbfaf7',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'], navigateFallback: 'index.html' },
    }),
  ],
});
