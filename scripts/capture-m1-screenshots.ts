/**
 * M1 screenshot capture.
 *
 * Launches the built Electron app via Playwright and captures the dropdown
 * window in its idle state.
 *
 * Run: `npx tsx scripts/capture-m1-screenshots.ts`
 * Requires: `npx electron-forge package` to have been run.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'screenshots', 'm1');

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const app = await electron.launch({
    args: [REPO_ROOT],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  try {
    const window = await app.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('.panel');

    await window.screenshot({
      path: path.join(OUT_DIR, '02-dropdown-window-idle.png'),
    });
    console.log('Wrote 02-dropdown-window-idle.png');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
