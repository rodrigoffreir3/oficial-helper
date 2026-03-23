import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 5173,
    host: true, // Necessário se você for testar acessando do celular pelo Wi-Fi
  }
});