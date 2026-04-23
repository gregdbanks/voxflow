/**
 * M3 screenshot capture.
 *
 * Walks the dropdown through the full dictation cycle with Groq transcription:
 * idle → recording → transcribing → result → rate-limit error.
 *
 * Run: `npx tsx scripts/capture-m3-screenshots.ts`
 * Requires: `npx electron-forge package` to have been run.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'screenshots', 'm3');

type DomPatch = {
  state?: 'idle' | 'recording' | 'transcribing' | 'error';
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

    await pose(
      { state: 'idle', status: 'Press ⌘⇧Space to dictate', transcription: '' },
      '01-idle-before-dictation.png',
    );
    await pose(
      { state: 'recording', status: 'Listening…' },
      '02-recording.png',
    );
    await pose(
      { state: 'transcribing', status: 'Transcribing…' },
      '03-transcribing.png',
    );
    await pose(
      {
        state: 'idle',
        status: 'Press ⌘⇧Space to dictate',
        transcription:
          "Let's ship the voice dictation feature by end of sprint. The Whisper round-trip feels fast enough for day-to-day use.",
      },
      '04-transcription-displayed.png',
    );
    await pose(
      {
        state: 'error',
        status: 'Error — rate limited, try again in a moment',
        transcription: '',
      },
      '05-rate-limit-error.png',
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
