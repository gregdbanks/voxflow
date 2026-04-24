/**
 * Re-captures the M6 screenshots using the REAL Bedrock outputs collected
 * via scripts/demo-real-bedrock.ts (Sonnet 4.5 fallback — Haiku 4.5 is
 * pending a Marketplace payment fix on this account).
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

const REAL = {
  chat: {
    before: 'um so I was thinking like we should probably ship the feature tomorrow you know',
    after: 'I was thinking we should probably ship the feature tomorrow.',
  },
  email: {
    before:
      'hey team just wanted to follow up on the uh migration plan we discussed last week I think we are good to go on Thursday',
    after:
      'Hey team, just wanted to follow up on the migration plan we discussed last week. I think we are good to go on Thursday.',
  },
  code: {
    before:
      'add a new async function called fetch user profile that takes a user ID and returns a promise of user profile',
    after:
      'Add a new async function called fetchUserProfile that takes a user ID and returns a promise of user profile.',
  },
  docs: {
    before:
      'in conclusion our quarterly results exceeded expectations across all three regions and we expect similar growth next quarter',
    after:
      'In conclusion, our quarterly results exceeded expectations across all three regions, and we expect similar growth next quarter.',
  },
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

    // 01 — cleaning state with real raw input (the actual Slack sample).
    await pose(
      {
        state: 'cleaning',
        status: 'Cleaning up…',
        transcription: REAL.chat.before,
      },
      '01-cleaning-in-progress.png',
    );

    // 02 — after cleanup, showing real Sonnet output for chat.
    await pose(
      {
        state: 'idle',
        status: 'Press ⌘⇧Space to dictate',
        transcription: REAL.chat.after,
      },
      '02-after-cleaning-final-text.png',
    );

    // 03/04 — settings toggle states (unchanged, re-capture to keep them fresh).
    await window.click('[data-tab="settings"]');
    await window.waitForSelector('#cleanup-toggle');
    await window.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('#cleanup-toggle');
      if (el) el.checked = true;
    });
    await window.screenshot({ path: path.join(OUT_DIR, '03-settings-cleanup-enabled.png') });
    console.log('Wrote 03-settings-cleanup-enabled.png');

    await window.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('#cleanup-toggle');
      if (el) el.checked = false;
    });
    await window.screenshot({ path: path.join(OUT_DIR, '04-settings-cleanup-disabled.png') });
    console.log('Wrote 04-settings-cleanup-disabled.png');

    // 05 — fallback to raw: cleanup disabled, raw transcription shown.
    await window.click('[data-tab="dictate"]');
    await window.waitForSelector('[data-view="dictate"]:not([hidden])');
    await pose(
      {
        state: 'idle',
        status: 'Press ⌘⇧Space to dictate',
        transcription: REAL.chat.before,
      },
      '05-cleanup-fallback-raw-text.png',
    );

    // 06–09 — one screenshot per context showing real before/after.
    type Ctx = keyof typeof REAL;
    const contextScreens: Array<[Ctx, string]> = [
      ['chat', '06-context-chat-slack.png'],
      ['email', '07-context-email-mail.png'],
      ['code', '08-context-code-vscode.png'],
      ['docs', '09-context-docs-pages.png'],
    ];
    for (const [ctx, filename] of contextScreens) {
      await pose(
        {
          state: 'idle',
          status: `Press ⌘⇧Space to dictate  ·  ${ctx} context`,
          transcription: `BEFORE: ${REAL[ctx].before}\n\nAFTER: ${REAL[ctx].after}`,
        },
        filename,
      );
    }

    console.log('Captured all M6 real-output screenshots');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
