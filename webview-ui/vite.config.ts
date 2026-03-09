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
        sddDashboard: resolve(__dirname, 'src/dashboard/index.ts'),
        sddKanban: resolve(__dirname, 'src/kanban/index.ts'),
        sddSpecForm: resolve(__dirname, 'src/specForm/index.ts'),
        sddAiConfig: resolve(__dirname, 'src/aiConfig/index.ts'),
        sddRequirementBoard: resolve(__dirname, 'src/requirementBoard/main.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
      },
    },
  },
});
