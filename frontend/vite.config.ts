import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  css: {
    transformer: 'postcss',
  },
  build: {
    cssMinify: 'esbuild',
    outDir: 'dist',
    assetsDir: 'assets',
    // Mermaid's parser is emitted as one lazy-loaded async chunk. The app shell,
    // workspace, editor, and regular vendor chunks stay under the 500KB budget.
    chunkSizeWarningLimit: 650,
  },
})
