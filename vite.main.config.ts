import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'menubar',
        'node-mic',
        'better-sqlite3',
        'clipboardy',
        '@paymoapp/active-window',
        'openai',
      ],
    },
  },
});
