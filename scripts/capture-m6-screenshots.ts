/**
 * M6 screenshot capture.
 *
 * Shows the cleaning state (new in M6), the settings toggle that controls it,
 * a before/after comparison, and the error-falls-back-to-raw path.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'screenshots', 'm6');

type DomPatch = {
  state?: 'idle' | 'recording' | 'transcribing' | 'cleaning' | 'injecting' | 'error';
  status?: string;
  transcription?: string;
};

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
    await window.waitForTimeout(400);

    const pose = async (patch: DomPatch, filename: string): Promise<void> => {
      await window.evaluate((p: DomPatch) => {
        const dot = document.querySelector<HTMLElement>('.dot');
        const status = document.getElementById('status');
        const transcription = document.getElementById('transcription');
        if (dot && p.state) dot.dataset.state = p.state;
        if (status && p.status !== undefined) status.textContent = p.status;
        if (transcription && p.transcription !== undefined) transcription.textContent = p.transcription;
      }, patch);
      await window.screenshot({ path: path.join(OUT_DIR, filename) });
      console.log(`Wrote ${filename}`);
    };

    // 01 — cleaning state in progress.
    await pose(
      {
        state: 'cleaning',
        status: 'Cleaning up…',
        transcription:
          "um so I was thinking like we should probably ship the feature tomorrow you know",
      },
      '01-cleaning-in-progress.png',
    );

    // 02 — after cleaning, the final text is pasted.
    await pose(
      {
        state: 'idle',
        status: 'Press ⌘⇧Space to dictate',
        transcription:
          "So I was thinking we should probably ship the feature tomorrow.",
      },
      '02-after-cleaning-final-text.png',
    );

    // 03 — settings tab with cleanup toggled ON.
    await window.click('[data-tab="settings"]');
    await window.waitForSelector('#cleanup-toggle');
    await window.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('#cleanup-toggle');
      if (el) el.checked = true;
    });
    await window.screenshot({ path: path.join(OUT_DIR, '03-settings-cleanup-enabled.png') });

    // 04 — settings tab with cleanup toggled OFF.
    await window.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('#cleanup-toggle');
      if (el) el.checked = false;
    });
    await window.screenshot({ path: path.join(OUT_DIR, '04-settings-cleanup-disabled.png') });

    // 05 — dictate tab, cleanup fallback (raw transcription after Bedrock error).
    await window.click('[data-tab="dictate"]');
    await window.waitForSelector('[data-view="dictate"]:not([hidden])');
    await pose(
      {
        state: 'idle',
        status: 'Press ⌘⇧Space to dictate',
        transcription:
          "um so I was thinking like we should probably ship the feature tomorrow you know",
      },
      '05-cleanup-fallback-raw-text.png',
    );

    console.log('Captured all M6 screenshots');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
