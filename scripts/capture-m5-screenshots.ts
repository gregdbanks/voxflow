/**
 * M5 screenshot capture.
 *
 * Walks the new Settings tab: empty dictionary → form filled → two entries
 * seeded → dictate tab showing a replaced transcription.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'screenshots', 'm5');

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
    await window.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.dot { transition: none !important; }';
      document.head.appendChild(style);
      const w = window as unknown as { voxflow?: { onStateChange?: unknown; onTranscription?: unknown } };
      if (w.voxflow) {
        w.voxflow.onStateChange = () => undefined;
        w.voxflow.onTranscription = () => undefined;
      }
    });
    await window.waitForTimeout(500);

    // 01 — settings tab with an empty dictionary.
    await window.click('[data-tab="settings"]');
    await window.waitForSelector('.dict-empty:not([hidden])');
    await window.screenshot({ path: path.join(OUT_DIR, '01-settings-empty-dictionary.png') });

    // 02 — form filled, about to submit the first entry.
    await window.fill('input[name="pattern"]', 'voxflow');
    await window.fill('input[name="replacement"]', 'VoxFlow');
    await window.screenshot({ path: path.join(OUT_DIR, '02-settings-entry-typed.png') });

    // Submit; add a second entry that's case-sensitive.
    await window.click('.dict-add');
    await window.waitForSelector('.dict-entry');
    await window.fill('input[name="pattern"]', 'api');
    await window.fill('input[name="replacement"]', 'API');
    await window.check('input[name="caseSensitive"]');
    await window.click('.dict-add');
    await window.waitForSelector('.dict-entry:nth-of-type(2)');
    await window.screenshot({ path: path.join(OUT_DIR, '03-settings-two-entries.png') });

    // 04 — back on the dictate tab, showing a transcription that has already
    // been passed through the dictionary (this is what the user sees post-paste).
    await window.click('[data-tab="dictate"]');
    await window.waitForSelector('[data-view="dictate"]:not([hidden])');
    await window.evaluate(() => {
      const dot = document.querySelector<HTMLElement>('.dot');
      if (dot) dot.dataset.state = 'idle';
      const status = document.getElementById('status');
      if (status) status.textContent = 'Press ⌘⇧Space to dictate';
      const transcription = document.getElementById('transcription');
      if (transcription)
        transcription.textContent = 'The VoxFlow API ships in sprint 23 — dictionary replacements applied.';
    });
    await window.screenshot({ path: path.join(OUT_DIR, '04-dictate-after-dictionary.png') });

    // 05 — settings tab, removing an entry (hover state via aria-label trigger).
    await window.click('[data-tab="settings"]');
    await window.waitForSelector('.dict-entry');
    await window.screenshot({ path: path.join(OUT_DIR, '05-settings-entry-removable.png') });

    console.log('Captured all M5 screenshots');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
