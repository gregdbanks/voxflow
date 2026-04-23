/**
 * M2 screenshot capture.
 *
 * Launches the built Electron app via Playwright and captures the dropdown
 * in each state the audio pipeline can produce: idle, recording, error.
 * The transcribing/final states are M3 territory.
 *
 * Run: `npx tsx scripts/capture-m2-screenshots.ts`
 * Requires: `npx electron-forge package` to have been run.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'screenshots', 'm2');

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

    // Disable the dot's CSS transition so screenshots aren't mid-animation,
    // and also neutralize the IPC bridge so the main process can't race us
    // by broadcasting a state update after we've posed the DOM.
    await window.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.dot { transition: none !important; }';
      document.head.appendChild(style);
      const w = window as unknown as { voxflow?: { onStateChange?: unknown } };
      if (w.voxflow) w.voxflow.onStateChange = () => undefined;
    });
    // Let any in-flight IPC state updates land before we start posing.
    await window.waitForTimeout(400);

    const captureState = async (
      state: 'idle' | 'recording' | 'error',
      filename: string,
      statusLine: string,
    ): Promise<void> => {
      const applied = await window.evaluate(
        ([nextState, nextStatus]) => {
          const dot = document.querySelector<HTMLElement>('.dot');
          const status = document.getElementById('status');
          if (dot) dot.dataset.state = nextState!;
          if (status) status.textContent = nextStatus!;
          const bg = dot ? window.getComputedStyle(dot).backgroundColor : 'no-dot';
          return { state: dot?.dataset.state, bg };
        },
        [state, statusLine] as const,
      );
      console.log(`  state=${applied.state} bg=${applied.bg}`);
      await window.screenshot({ path: path.join(OUT_DIR, filename) });
      console.log(`Wrote ${filename}`);
    };

    await captureState('idle', '01-idle-waiting-for-hotkey.png', 'Press ⌘⇧Space to dictate');
    await captureState('recording', '02-recording-active.png', 'Listening…');
    await captureState('error', '03-error-state.png', 'Error — see logs');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
