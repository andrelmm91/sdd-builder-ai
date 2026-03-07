import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: resolve(__dirname, '../dist/webviews'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard/main.ts'),
        kanban: resolve(__dirname, 'src/kanban/main.ts'),
        specForm: resolve(__dirname, 'src/specForm/main.ts'),
      },
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
      },
    },
  },
});
