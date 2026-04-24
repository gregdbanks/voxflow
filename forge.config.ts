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
// Seed list: direct deps we know main.js requires at runtime. Transitives are
// walked automatically via each package.json — keeps this list minimal.
const NATIVE_EXTERNAL_DEP_ROOTS = [
  'better-sqlite3',
  'node-mic',
  '@paymoapp/active-window',
  'electron-squirrel-startup',
  'uiohook-napi',
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

// Walks each root dep's package.json and collects the full dependency closure.
// Without this, any transitive (e.g. shelljs → glob → minimatch → …) silently
// vanishes from the packaged app and crashes at first require.
function collectTransitiveDeps(projectNodeModules: string, roots: string[]): string[] {
  const resolved = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (resolved.has(name)) continue;
    const pkgPath = path.join(projectNodeModules, name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    resolved.add(name);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
    for (const d of deps) if (!resolved.has(d)) queue.push(d);
  }
  return [...resolved];
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
    // NOTE: `.env` is shipped into Resources/ so the packaged main process
    // can load secrets at startup (dotenv picks it up via
    // path.dirname(app.getAppPath())). This bakes local keys into the .app —
    // don't redistribute the built bundle.
    extraResource: [
      './assets',
      './.env',
      './native/build/paste-helper',
      './native/build/key-listener',
    ],
    // Without NSMicrophoneUsageDescription macOS silently denies mic access
    // and Whisper hallucinates "Thank you." on the resulting silence.
    // NSAppleEventsUsageDescription covers the legacy osascript fallback.
    extendInfo: {
      NSMicrophoneUsageDescription: 'VoxFlow needs microphone access to transcribe your dictation.',
      NSAppleEventsUsageDescription: 'VoxFlow sends ⌘V to paste transcriptions into the focused app.',
    },
  },
  hooks: {
    // Ad-hoc codesign the packaged .app with a stable identifier so macOS TCC
    // can remember Accessibility/Microphone grants across rebuilds. Without
    // this, the default Electron code-signing identity is "com.github.Electron"
    // and every fresh hash is treated as a brand-new unknown app — prompts
    // stop firing, `askForMediaAccess` returns false immediately, and Whisper
    // gets silent audio.
    async postPackage(_forgeConfig, packageResult) {
      for (const appPath of packageResult.outputPaths) {
        const appBundle = path.join(appPath, 'VoxFlow.app');
        if (!fs.existsSync(appBundle)) continue;
        const { execSync } = await import('node:child_process');
        execSync(
          `codesign --sign - --identifier com.voxflow.app --force --deep "${appBundle}"`,
          { stdio: 'inherit' },
        );
        console.log(`[forge] ad-hoc signed ${appBundle} as com.voxflow.app`);
      }
    },
    // Copy native modules that vite kept external into the packaged app,
    // because @electron-forge/plugin-vite doesn't do this on its own.
    async packageAfterCopy(_forgeConfig, buildPath) {
      const projectNodeModules = path.resolve(__dirname, 'node_modules');
      const targetNodeModules = path.join(buildPath, 'node_modules');
      const allDeps = collectTransitiveDeps(projectNodeModules, NATIVE_EXTERNAL_DEP_ROOTS);
      for (const dep of allDeps) {
        const src = path.join(projectNodeModules, dep);
        if (!fs.existsSync(src)) {
          console.warn(`[forge] native dep not found, skipping: ${dep}`);
          continue;
        }
        const dest = path.join(targetNodeModules, dep);
        copyDirRecursive(src, dest);
      }
      console.log(`[forge] copied ${allDeps.length} external modules into packaged app`);
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
