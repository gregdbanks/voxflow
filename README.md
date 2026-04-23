# VoxFlow

macOS voice dictation menubar app — local clone of Wispr Flow.

Captures speech via hotkey, transcribes through Groq Whisper, cleans up with
Bedrock Haiku, and pastes at cursor.

## Milestones

- **M1** — Project Scaffolding + Menubar Shell ✅
- M2 — Audio Capture Pipeline
- M3 — Cloud Transcription
- M4 — Text Injection
- M5 — Local Data Layer
- M6 — AI Post-Processing

See [GitHub Issues](https://github.com/gregdbanks/voxflow/issues) for full details.

## Quickstart

```bash
npm install
npm start              # run in dev mode (tray icon appears in menu bar)
```

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Run the app via Electron Forge dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Electron end-to-end tests (Playwright) |
| `npm run typecheck` | `tsc --noEmit` with strict mode |
| `npm run lint` | ESLint |
| `npm run screenshots:m1` | Regenerate M1 screenshots |
| `npx electron-forge package` | Build a packaged `.app` in `out/` |

Before running the e2e tests or screenshot scripts, package the app once:

```bash
npx electron-forge package
npm run test:e2e
npm run screenshots:m1
```

## Architecture

```
src/
  main/          # Electron main process (tray, menubar, hotkey — M2+)
  preload/       # Context-isolated bridge to renderer
  renderer/      # Dropdown UI (HTML / CSS / TS)
  platform/      # Port interfaces (IMicrophone, IClipboard, …) + macOS impls
  services/      # AudioRecorder, TranscriptionService, DictationPipeline, … (M2+)
  shared/        # config.ts, logger.ts — pure, unit-tested
test/
  unit/          # Vitest unit tests
  e2e/           # Playwright Electron smoke tests
screenshots/     # Living QA manual — per-milestone evidence
```

## Screenshots

Every milestone produces labeled screenshots in `screenshots/<milestone>/` with
a README captioning each image. See [`screenshots/README.md`](./screenshots/README.md).
