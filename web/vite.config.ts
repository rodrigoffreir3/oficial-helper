import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inclui todos os arquivos básicos para o cache offline
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      // Configuração do Manifest (O que faz parecer um app nativo)
      manifest: {
        name: 'Oficial Helper',
        short_name: 'OficialHelper',
        description: 'Coleta de coordenadas de alta precisão para diligências.',
        theme_color: '#007bff',
        background_color: '#ffffff',
        display: 'standalone', // Esconde a barra de endereço do navegador
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },

      // Configuração do Service Worker (Cache offline)
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Permite que o Service Worker assuma o controle mais rápido
        clientsClaim: true,
        skipWaiting: true,
      }
    })
  ],
  server: {
    port: 5173,
    host: true, // Necessário se você for testar acessando do celular pelo Wi-Fi
  }
});