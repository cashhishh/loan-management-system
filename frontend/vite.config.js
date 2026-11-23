import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tailwind v4 runs through its Vite plugin; an empty PostCSS config stops Vite
  // from picking up a stray postcss.config.js in a parent folder.
  css: { postcss: {} },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
