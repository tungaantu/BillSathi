import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, mkdirSync } from 'node:fs';
export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'database-migrations',
        closeBundle() {
          mkdirSync('out/main/migrations', { recursive: true });
          cpSync('src/main/db/migrations', 'out/main/migrations', { recursive: true });
        },
      },
    ],
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react(), tailwindcss()] },
});
