import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Serve the method page at /how in development; Netlify does the same in production.
function cleanUrls(): Plugin {
  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/how' || req.url?.startsWith('/how?')) req.url = req.url.replace('/how', '/how.html');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/how' || req.url?.startsWith('/how?')) req.url = req.url.replace('/how', '/how.html');
        next();
      });
    },
  };
}

export default defineConfig({
  build: { rollupOptions: { input: { index: 'index.html', how: 'how.html' } } },
  plugins: [
    cleanUrls(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Unlag',
        short_name: 'Unlag',
        description: 'A jet lag schedule from your flight and your sleep.',
        theme_color: '#fafaf7',
        background_color: '#fafaf7',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/how/],
      },
    }),
  ],
});
