import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import path from 'node:path';

// Modules vite keeps external because they ship native bindings and can't be
// bundled. electron-forge + plugin-vite doesn't copy these into the packaged
// app on its own (the asar ends up with just the .vite output + package.json),
// so we ship them explicitly via a post-copy hook.
// Modules that must exist in node_modules at runtime inside the packaged app.
// The list is deliberately minimal: things with native .node files + their
// transitive helpers, plus electron-squirrel-startup which is required
// unconditionally at main.ts top level before vite can treeshake it.
const NATIVE_EXTERNAL_DEPS = [
  'better-sqlite3',
  'node-mic',
  'fflate', // node-mic transitive
  'node-fetch', // node-mic transitive
  'shelljs', // node-mic transitive
  '@paymoapp/active-window',
  'bindings', // better-sqlite3 + active-window
  'file-uri-to-path', // bindings transitive
  'electron-squirrel-startup',
  'debug', // electron-squirrel-startup transitive
  'ms', // debug transitive
];

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Unpack native bindings out of app.asar so `require('better-sqlite3')`
      // etc. can dlopen their .node files at runtime — dlopen can't read
      // files from inside an asar archive.
      unpack: '**/{*.node,better-sqlite3,node-mic,@paymoapp/active-window}/**',
    },
    name: 'VoxFlow',
    extraResource: ['./assets'],
  },
  hooks: {
    // Copy native modules that vite kept external into the packaged app,
    // because @electron-forge/plugin-vite doesn't do this on its own.
    async packageAfterCopy(_forgeConfig, buildPath) {
      const projectNodeModules = path.resolve(__dirname, 'node_modules');
      const targetNodeModules = path.join(buildPath, 'node_modules');
      for (const dep of NATIVE_EXTERNAL_DEPS) {
        const src = path.join(projectNodeModules, dep);
        if (!fs.existsSync(src)) {
          console.warn(`[forge] native dep not found, skipping: ${dep}`);
          continue;
        }
        const dest = path.join(targetNodeModules, dep);
        copyDirRecursive(src, dest);
      }
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({})],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
