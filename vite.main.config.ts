import { defineConfig } from 'vite';

// Inline every JS-only dependency into main.js. Only truly native modules
// (or ones that electron requires to be external) stay external; those need
// to be reachable at runtime via node_modules unpacked alongside app.asar —
// see forge.config.ts's `asar.unpack` setting.
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
        'better-sqlite3',
        'node-mic',
        '@paymoapp/active-window',
        'uiohook-napi',
        'robotjs',
        'smart-whisper',
      ],
    },
    commonjsOptions: {
      // dotenv / openai / aws-sdk ship CJS; bundle them.
      transformMixedEsModules: true,
    },
  },
});
