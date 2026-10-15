import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // service worker próprio (src/sw.ts): precisa tratar o POST do menu "Compartilhar"
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png}'], maximumFileSizeToCacheInBytes: 5_000_000 },
      manifest: {
        // aparece no "Compartilhar" do Android (banco, WhatsApp, galeria) para imagens e PDF
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['image/*', 'application/pdf', '.pdf'] }] },
        },
        name: 'KaRo',
        short_name: 'KaRo',
        description: 'Finanças pessoais com leitura de cupom fiscal, tudo no seu aparelho.',
        lang: 'pt-BR',
        theme_color: '#1e1b4b',
        background_color: '#1e1b4b',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})
