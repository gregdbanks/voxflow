# VoxFlow

macOS voice dictation menubar app — local clone of Wispr Flow.

Captures speech via hotkey, transcribes through Groq Whisper, optionally cleans
up with Bedrock Haiku, applies a personal dictionary, and pastes at the cursor.

## Milestones

- **M1** — Project scaffolding + menubar shell ✅
- **M2** — Audio capture pipeline ✅
- **M3** — Cloud transcription (Groq Whisper) ✅
- **M4** — Text injection ✅
- **M5** — Local data layer (SQLite) ✅
- **M6** — AI post-processing (Bedrock Haiku) ✅

## Flow

```
tray press / ⌘⇧Space
 └─ capture mic  →  Groq Whisper  →  Claude Haiku cleanup  →  personal dictionary  →  Cmd+V at cursor
                                  (toggleable)             (exact-match)
```

Each step emits a `PipelineEvent`; the tray tooltip and dropdown dot reflect
the current state (`idle · recording · transcribing · cleaning · injecting ·
error`).

## Quickstart

```bash
npm install
brew install sox
cp .env.example .env          # then fill in GROQ_API_KEY
npm start                     # rebuilds better-sqlite3 for Electron and launches
```

Two macOS permissions the app needs the first time you use it:

- **Microphone** — granted automatically on the first prompt.
- **Accessibility** — required for the Cmd+V paste. **This permission is granted to the launching binary, not to Terminal.**
  - In dev (`npm start`), the binary is `node_modules/electron/dist/Electron.app`. Open System Settings → Privacy & Security → Accessibility → click **+** → navigate to that path and add `Electron.app`.
  - In a packaged build (`npx electron-forge package` → `out/VoxFlow-darwin-arm64/VoxFlow.app`), it's the `VoxFlow` app itself.
  - After granting, fully quit and re-launch — macOS doesn't honor the new permission until the process restarts.

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Run the app (auto-rebuilds for Electron ABI first) |
| `npm test` | Vitest unit suite (auto-rebuilds for Node ABI first) |
| `npm run test:e2e` | Playwright Electron smoke test |
| `npm run test:integration` | Real-cloud tests gated on `GROQ_API_KEY` / `AWS_*` / `VOXFLOW_INTEGRATION=1` |
| `npm run typecheck` | `tsc --noEmit` strict |
| `npm run lint` | ESLint |
| `npm run screenshots:m1` … `m6` | Regenerate per-milestone screenshots |
| `npx electron-forge package` | Build a packaged `.app` in `out/` |

## Environment

Copy `.env.example` to `.env` and fill in:

```
GROQ_API_KEY=gsk_...          # transcription (M3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...         # cleanup (M6) — omit to disable
AWS_SECRET_ACCESS_KEY=...
LOG_LEVEL=info
VOXFLOW_HOTKEY=CommandOrControl+Shift+Space
```

The app happily runs without `GROQ_API_KEY` (no-op transcription, useful for
UI work) and without AWS creds (cleanup is skipped, pipeline still works).

## Architecture

```
src/
  main/              # Electron main (tray, menubar, hotkey, IPC handlers)
  preload/           # Context-isolated bridge to renderer
  renderer/          # Dropdown UI + Settings tab (dictionary + cleanup toggle)
  platform/          # IMicrophone / IClipboard / IKeystroke / IActiveWindow / ...
                     # + MacMicrophone, MacClipboard, MacKeystroke
  services/
    audio/           # AudioRecorder + WavEncoder (M2)
    transcription/   # Groq Whisper (M3)
    injection/       # TextInjector + MacActiveWindowDetector (M4)
    storage/         # Database + DictionaryRepository + CorrectionRepository + SettingsRepository (M5)
    llm/             # TextCleanupService + PromptBuilder (M6)
    pipeline/        # DictationPipeline (orchestrator)
  shared/            # Pure: config + logger
test/
  unit/              # 89 Vitest tests
  e2e/               # Playwright-driven Electron launch
  integration/       # Gated on GROQ_API_KEY / AWS creds / VOXFLOW_INTEGRATION
  fixtures/          # synthetic silence.wav + hello-world.wav
  mocks/             # MSW handlers
screenshots/         # Living QA manual — one README + labelled screenshots per milestone
```

## Screenshots

Every milestone produces labelled screenshots in `screenshots/<milestone>/`
with a README captioning what each image proves and how to reproduce it.
Start at [`screenshots/README.md`](./screenshots/README.md).
