# VoxFlow Screenshots

Each milestone directory (`m1/`, `m2/`, …) contains numbered screenshots plus a
`README.md` that captions what each image shows and how to reproduce it. This
folder is the living QA manual — scan through the screenshots and you should be
able to figure out how to test the app end-to-end.

## Regenerating screenshots

```bash
# Build the packaged app (required — Playwright points at .vite/build/main.js)
npx electron-forge package

# Per-milestone capture scripts
npx tsx scripts/capture-m1-screenshots.ts
```

## Capture conventions

- **Filenames** are `NN-description-state.png` — sequential prefixes so a file
  listing reads like a storyboard of the user flow.
- **Automated** screenshots live inline in the milestone directory.
- **Manual** screenshots (anything Playwright can't see, e.g. the macOS menu
  bar tray icon or system-level context menus) get a prose note in the
  milestone README describing exactly which steps to perform and what to see.
