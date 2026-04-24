<p align="center">
  <img src="assets/logo.svg" alt="VoxFlow" width="220" />
</p>

<h1 align="center">VoxFlow</h1>

<p align="center">
  Hold Option, talk, let go. Your words pasted at the cursor.
  <br/>
  A private, local-first macOS dictation menubar app.
</p>

---

## Why VoxFlow instead of Wispr Flow?

| | **VoxFlow** | **Wispr Flow** |
|---|---|---|
| **Price** | Free forever (pay pennies per hour to Groq) | $15 / month |
| **Data path** | Your audio → your Groq key → discarded | Their servers, their pipeline, their retention policy |
| **Your clipboard** | Preserved (restored after paste) | Varies |
| **Transcription history** | Local SQLite on your machine | In their cloud |
| **Source** | Open — fork it, hack it, own it | Closed |
| **Hotkey** | Whatever you want (default: hold `⌥`) | Their choice |
| **Dictionary / corrections** | Your own | Theirs |
| **Lock-in** | None | Subscription |

It also *feels* snappier: no server round-trip for UI events, just local mic capture → Groq Whisper (which is genuinely fast) → in-process paste. Release Option, see your words. On my machine, end-to-end latency for a 2-second dictation is ~800 ms.

## Features

- **Press-and-hold dictation** on the bare `⌥` key (Wispr-style) via an in-process `CGEventTap`. No modifier gymnastics.
- **Live audio waveform** in a floating pill at the bottom of the screen, only visible while you're talking.
- **Auto-paste** at the cursor via an in-process `CGEventPost`, with your pre-dictation clipboard restored automatically after.
- **Transcription history** in the menubar popover — the last 1000 entries, with live search, Copy, and Paste-again.
- **Personal dictionary** for names and jargon. Add `Kaden` → `Kayden` once, it sticks forever.
- **Optional LLM cleanup** via AWS Bedrock Haiku. Off by default (no AWS cost) — turn on in Settings.
- **Repetition scrubber** for long dictations — Whisper's classic `"word word word"` hallucination is collapsed automatically.
- **SQLite-backed everything** — your dictations, corrections, settings, dictionary all live in `~/Library/Application Support/VoxFlow/voxflow.sqlite`.

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/gregdbanks/voxflow.git
cd voxflow
npm install

# 2. System tool
brew install sox            # node-mic shells out to sox/rec

# 3. API key (free tier available)
cp .env.example .env        # then fill in GROQ_API_KEY=gsk_…

# 4. Run in dev mode
npm start
```

## macOS permissions

VoxFlow needs two system grants on first launch:

1. **Microphone** — prompts automatically. Click Allow.
2. **Accessibility** — for capturing the `⌥` hold and posting `⌘V`. Macos may not pop this one on its own; if the hotkey feels dead, open **System Settings → Privacy & Security → Accessibility**, click `+`, and add the running VoxFlow binary.

### Why these permissions keep getting invalidated

macOS TCC (the permission database) keys grants to the exact cdhash of the binary that was granted. Every rebuild changes the cdhash, which means the old grant is technically attached to a "different" binary and the new one looks unknown. This is annoying but *not a bug*: grants stick forever for any build you don't rebuild, and **with an Apple Developer ID signature ($99/yr), grants stick across all builds because TCC tracks by cert identity, not hash.**

VoxFlow ad-hoc signs the bundle with a stable identifier (`com.voxflow.app`) to minimise this for casual development, but rebuilds will still require a re-grant until you pay Apple. See [Apple Developer limitations](#apple-developer-limitations) below.

## Architecture

```
src/
  main/              # Electron main — tray, menubar popover, pill window, hotkey
  preload/           # Context-isolated bridge
  renderer/          # Dropdown UI (Dictate / History / Settings tabs)
  platform/          # Hexagonal ports: IMicrophone, IClipboard, IKeystroke,
                     # IActiveWindow, ITranscriptionService, ICleanupService,
                     # plus macOS implementations.
  services/
    audio/           # AudioRecorder + WavEncoder
    transcription/   # Groq Whisper + `collapseRepeats` scrubber
    injection/       # TextInjector (clipboard + paste + restore)
    storage/         # SQLite migrations, repos (Dictionary, Correction, Settings)
    llm/             # TextCleanupService + PromptBuilder
    pipeline/        # DictationPipeline — state machine orchestrator
  shared/            # Pure: config loader + logger
native/
  paste-helper.c     # Reserved for a future Developer-ID-signed build
  key-listener.c     # Reserved for a future Developer-ID-signed build
assets/              # Logo, tray icons
screenshots/         # Living QA manual — labelled screenshots per milestone
test/
  unit/              # 95 Vitest tests
  e2e/               # Playwright-driven Electron launch
  integration/       # Gated by VOXFLOW_INTEGRATION=1
```

### State machine

```
          hold ⌥                  release ⌥
idle  ──────────────► recording ──────────────► transcribing
                          │                         │
                          │ (tray or /stop)         ▼
                          │                      cleaning (optional Bedrock)
                          ▼                         │
                        idle                        ▼
                                                injecting
                                                    │
                                                    ▼
                                                  idle
```

Every state transition emits a `PipelineEvent`. The tray title, floating pill, and menubar popover all subscribe to it over IPC.

## Tech stack

| Layer | Library | Why |
|---|---|---|
| Shell | Electron 33 | Cross-platform foundation, menubar support via `menubar` package |
| Hotkey | `uiohook-napi` | In-process `CGEventTap`, detects bare `⌥` hold/release |
| Paste | `robotjs` | In-process `CGEventPost`, avoids the unsigned-subprocess TCC hole |
| Mic | `node-mic` (+ Homebrew `sox`) | Cheap, scriptable PCM capture |
| Transcription | [Groq](https://groq.com) Whisper v3 via OpenAI SDK | Fast, cheap, great accuracy |
| Cleanup (opt) | AWS Bedrock Haiku | Punctuation & grammar when you want it |
| Storage | `better-sqlite3` | Local, synchronous, zero-deps |
| Window UI | Vanilla HTML + vite | No framework weight for a 400-px popover |
| Tests | `vitest` + `msw` + Playwright | Unit / mocked-network / e2e |

All production deps are MIT / Apache-2.0 / ISC. Run `npx license-checker --production --summary` to verify.

## Apple Developer limitations

Everything in VoxFlow works today on an unsigned build. The paper cut is re-granting Accessibility after rebuilds, because TCC pins grants to the code directory hash and an unsigned rebuild changes the hash.

**With a paid Apple Developer ID ($99/yr)**, you'd additionally get:

1. **Sticky grants across rebuilds** — sign with the Developer ID cert, macOS tracks grants by cert identity. Never re-grant again.
2. **Reliable helper-subprocess TCC** — the old `paste-helper` / `key-listener` architecture (preserved in `native/` for reference) would work, letting you factor keyboard logic out of the Electron main process.
3. **Gatekeeper-clean distribution** — sharing the `.app` with friends wouldn't trigger "unidentified developer" warnings.

For a personal build, none of this is necessary. `robotjs` and `uiohook-napi` run inside the main process, which does get its Accessibility grant respected across reasonable use. The re-grant ritual is the only cost.

## Roadmap

- [ ] First-launch onboarding window that walks through permissions with screenshots.
- [ ] Launch-at-login toggle (LoginItems registration).
- [ ] Fuzzy dictionary correction (e.g. "teh"→"the" without an explicit rule).
- [ ] Auto-learn dictionary entries from clipboard edits after dictation.
- [ ] Offline Whisper (`whisper.cpp`) as an opt-in backend — zero-network mode.
- [ ] Pagination / time filters for history beyond 1000 entries.
- [ ] Snippets: `/email` → expands to an email template.
- [ ] Push-to-type (instead of push-to-paste) using `robotjs.typeString` so clipboard is never touched.
- [ ] Windows + Linux ports (the platform ports are already abstracted; just need implementations).

## Development

```bash
npm start             # dev mode (auto-rebuilds native modules for Electron ABI)
npm test              # 95 unit tests
npm run test:e2e      # Playwright Electron smoke
npm run typecheck     # tsc --noEmit strict
npm run package       # builds out/VoxFlow-darwin-arm64/VoxFlow.app

# Copy a packaged build into /Applications
cp -R out/VoxFlow-darwin-arm64/VoxFlow.app /Applications/
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more.

## License

MIT — do whatever you want with it, don't sue me. See [LICENSE](./LICENSE).

## Credits

- Transcription by [Groq](https://groq.com)'s Whisper endpoint.
- Inspired by — and straightforwardly a free alternative to — [Wispr Flow](https://wisprflow.ai). Not affiliated with or endorsed by Wispr.
- Logo: pixel art by me.
