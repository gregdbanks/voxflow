# Contributing to VoxFlow

Thanks for poking at this. VoxFlow is a one-person project shared for anyone who wants a local-first alternative to Wispr Flow, so the bar is "it should be obvious what's going on" rather than strict PR process.

## Setup

```bash
git clone https://github.com/gregdbanks/voxflow.git
cd voxflow
npm install
brew install sox                 # node-mic shells out to sox/rec
cp .env.example .env             # fill in GROQ_API_KEY
npm start
```

### Native modules

Three npm deps have native C/C++ code that must match the Electron ABI:

- `better-sqlite3` — local storage
- `uiohook-napi` — in-process keyboard tap
- `robotjs` — in-process keyboard posting

`npm start` and `npm run package` both run `rebuild:native` first, which uses `@electron/rebuild` to rebuild those three for the embedded Electron version. If you see `NODE_MODULE_VERSION N vs M` errors, run `npm run rebuild:native` manually.

## Repository layout

See the Architecture section of [README.md](./README.md#architecture).

High-level guidelines:

- **Platform ports are interfaces** (`src/platform/interfaces.ts`) with concrete macOS implementations. If you're adding a Windows or Linux port, drop a new class in `src/platform/` and swap it in via `src/main/index.ts` — everything else is platform-agnostic.
- **Services are pure unless they touch IO.** `DictationPipeline`, `PromptBuilder`, `collapseRepeats`, the SQLite repos — all unit-testable without a running Electron.
- **Tests first for non-trivial logic.** `test/unit/` uses Vitest; `msw` mocks any HTTP dependency so tests are deterministic. 95 tests pass on `main`.
- **Don't commit secrets.** `.env` is gitignored. `forge.config.ts` copies your local `.env` into the packaged app for your own convenience — if you ever share a `.app`, strip `Contents/Resources/.env` first.

## Common workflows

```bash
npm start              # dev mode
npm test               # unit tests (fast)
npm run test:e2e       # Playwright — launches Electron
npm run typecheck      # tsc --noEmit strict
npm run lint           # ESLint
npm run package        # build out/VoxFlow-darwin-arm64/VoxFlow.app
```

## macOS permission gotchas

Every rebuild changes the cdhash, which breaks the previous Accessibility grant for unsigned builds. Symptom: hotkey silently stops firing. Fix:

1. System Settings → Privacy & Security → Accessibility.
2. Find the `VoxFlow` row, select it, click `−` to remove.
3. Click `+`, navigate to `/Applications/VoxFlow.app` (or wherever you launched from), add, toggle on.
4. Quit + relaunch VoxFlow.

The only permanent fix is a real Apple Developer ID signature; see the [Apple Developer limitations](./README.md#apple-developer-limitations) section of the README.

## PRs

Branch off `milestone/01-scaffolding` (the effective default branch), push, open a PR against it. No strict commit-message format, but:

- Keep commit subjects under ~72 chars.
- Describe *why* in the body, not just *what*.
- Don't mention AI assistants in commit messages — we pretend humans wrote them (and humans did review them).
- Run `npm test` and `npm run typecheck` before pushing.

## Bugs / ideas

Open a GitHub issue. Include:

- macOS version
- `cat /tmp/voxflow-diag.log` if it's a runtime issue (the app dumps a state trace there for debugging)
- What you expected vs what happened

## License

By contributing, you agree your contributions are licensed under the [MIT License](./LICENSE).
