import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../.vite/renderer/main_window',
    emptyOutDir: true,
  },
});
