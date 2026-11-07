import { defineConfig } from 'vite';
import netlify from '@netlify/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        netlify(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/**/*.png', 'icons/**/*.svg', 'grass.jpg'],
            manifest: {
                id: '/',
                name: 'Cat & Rats',
                short_name: 'Cat & Rats',
                description: 'A little hunt. A lot of trouble.',
                theme_color: '#151b13',
                background_color: '#151b13',
                display: 'fullscreen',
                orientation: 'landscape',
                start_url: '/',
                scope: '/',
                categories: ['games', 'entertainment'],
                icons: [
                    {
                        src: '/icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                navigateFallback: '/index.html',
                globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webmanifest,woff2}'],
                globIgnores: ['**/models/**', '**/*.glb'],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.endsWith('.glb'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'game-models',
                            expiration: {
                                maxEntries: 32,
                                maxAgeSeconds: 60 * 60 * 24 * 30
                            },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    {
                        urlPattern: ({ url }) => url.pathname === '/api/leaderboard',
                        handler: 'NetworkFirst',
                        method: 'GET',
                        options: {
                            cacheName: 'leaderboard-get',
                            networkTimeoutSeconds: 8,
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    }
                ]
            },
            devOptions: {
                enabled: false
            }
        })
    ]
});
