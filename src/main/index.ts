import { app, BrowserWindow, globalShortcut, ipcMain, systemPreferences } from 'electron';
import { menubar } from 'menubar';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Bypass-console diagnostics: when running the packaged .app, electron's
// internal logging can swallow console.log unless ELECTRON_ENABLE_LOGGING is
// set. Writing to a file sidesteps that and gives us a crash trail.
const DIAG_LOG = '/tmp/voxflow-diag.log';
try {
  fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] main.ts loaded (pid=${process.pid})\n`);
} catch {
  // Best effort only.
}
process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(DIAG_LOG, `UNCAUGHT: ${err.stack ?? err.message}\n`);
  } catch {
    // ignore
  }
});
process.on('unhandledRejection', (reason) => {
  try {
    fs.appendFileSync(DIAG_LOG, `UNHANDLED: ${String(reason)}\n`);
  } catch {
    // ignore
  }
});
import url from 'node:url';
import { loadConfig } from '../shared/config.js';

// Load .env from the project root in dev, or from the app resources dir when
// packaged. Electron Forge doesn't auto-load .env files — without this, the
// main process sees neither GROQ_API_KEY nor AWS_* and silently falls back
// to the no-op transcription service.
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.join(app.getAppPath(), '.env'),
  path.join(path.dirname(app.getAppPath()), '.env'),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}
import { createLogger, type Logger } from '../shared/logger.js';
import { createTray, defaultTrayIconPath, type TrayState } from './tray.js';
import { PillWindow } from './pill.js';
import { AudioRecorder } from '../services/audio/AudioRecorder.js';
import { MacMicrophone } from '../platform/MacMicrophone.js';
import { GroqTranscriptionService } from '../services/transcription/TranscriptionService.js';
import { TextCleanupService } from '../services/llm/TextCleanupService.js';
import {
  DictationPipeline,
  type PipelineEvent,
  type PipelineState,
} from '../services/pipeline/DictationPipeline.js';
import type { ITranscriptionService } from '../platform/interfaces.js';
import { TextInjector } from '../services/injection/TextInjector.js';
import { MacClipboard } from '../platform/MacClipboard.js';
import { MacKeystroke } from '../platform/MacKeystroke.js';
import { MacActiveWindowDetector } from '../services/injection/ActiveWindowDetector.js';
import { Database } from '../services/storage/Database.js';
import { DictionaryRepository } from '../services/storage/DictionaryRepository.js';
import { CorrectionRepository } from '../services/storage/CorrectionRepository.js';
import { SettingsRepository } from '../services/storage/SettingsRepository.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) {
  app.quit();
}

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
try {
  fs.appendFileSync(
    DIAG_LOG,
    `[${new Date().toISOString()}] config loaded; groqKey=${config.groqApiKey ? 'set' : 'MISSING'} awsKey=${config.awsAccessKeyId ? 'set' : 'unset'} awsRegion=${config.awsRegion}\n`,
  );
} catch {
  // ignore
}

if (process.platform === 'darwin') {
  app.dock?.hide();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string | undefined;

function resolveIndexHtml(): string {
  const devUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined;
  if (devUrl) return devUrl;
  const name = typeof MAIN_WINDOW_VITE_NAME !== 'undefined' ? MAIN_WINDOW_VITE_NAME : 'main_window';
  const filePath = path.join(__dirname, `../renderer/${name}/index.html`);
  return url.pathToFileURL(filePath).toString();
}

function broadcast(mb: { window?: BrowserWindow | null }, channel: string, payload: unknown): void {
  const win = mb.window;
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

const STATE_TO_TRAY: Record<PipelineState, TrayState> = {
  idle: 'idle',
  recording: 'recording',
  transcribing: 'transcribing',
  cleaning: 'cleaning',
  injecting: 'injecting',
  error: 'error',
};

import { NO_OP_TRANSCRIPTION_SENTINEL } from '../services/pipeline/DictationPipeline.js';

function createTranscriptionService(
  apiKey: string | undefined,
  logger: Logger,
): ITranscriptionService {
  if (apiKey) return new GroqTranscriptionService({ apiKey });
  logger.warn('GROQ_API_KEY not set — using a no-op transcription service');
  return {
    async transcribe() {
      return { text: NO_OP_TRANSCRIPTION_SENTINEL, durationMs: 0 };
    },
  };
}

app.whenReady().then(async () => {
  logger.info('VoxFlow starting');

  // Microphone permission: without this the mic port silently delivers 0
  // bytes and Whisper hallucinates training-set phrases ("Thank you.",
  // "Thanks for watching.") on the resulting silence. Log the status and
  // proactively trigger the system prompt if not yet decided.
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] mic status=${micStatus}\n`);
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] mic askForMediaAccess=${granted}\n`,
      );
    }
  } catch (err) {
    fs.appendFileSync(
      DIAG_LOG,
      `[${new Date().toISOString()}] mic status check failed: ${(err as Error).message}\n`,
    );
  }

  const iconPath = defaultTrayIconPath();
  const trayController = createTray(iconPath, () => {
    logger.info('Quitting via tray');
  });

  const indexUrl = resolveIndexHtml();

  const mb = menubar({
    tray: trayController.getTray(),
    index: indexUrl,
    preloadWindow: true,
    browserWindow: {
      width: 360,
      height: 420,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  });

  let database: Database | undefined;
  let dictionary: DictionaryRepository | undefined;
  let corrections: CorrectionRepository | undefined;
  let settings: SettingsRepository | undefined;
  try {
    database = new Database({ filename: path.join(app.getPath('userData'), 'voxflow.sqlite') });
    const appliedMigrations = database.migrate();
    if (appliedMigrations.length > 0) {
      logger.info(`Applied ${appliedMigrations.length} migration(s): ${appliedMigrations.map((m) => m.name).join(', ')}`);
    }
    dictionary = new DictionaryRepository(database);
    corrections = new CorrectionRepository(database);
    settings = new SettingsRepository(database);
  } catch (err) {
    const e = err as Error;
    try {
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] DB INIT FAILED: ${e.message}\n`,
      );
    } catch {
      // ignore
    }
    logger.error(
      'Failed to open SQLite — run `npm run rebuild:native` or `npx @electron/rebuild -f -w better-sqlite3`',
      err,
    );
  }
  try {
    fs.appendFileSync(
      DIAG_LOG,
      `[${new Date().toISOString()}] DB init ok=${database !== undefined}\n`,
    );
  } catch {
    // ignore
  }

  const microphone = new MacMicrophone();
  const recorder = new AudioRecorder(microphone);
  const transcription = createTranscriptionService(config.groqApiKey, logger);
  const injector = new TextInjector({
    clipboard: new MacClipboard(),
    keystroke: new MacKeystroke(),
  });
  const activeWindow = new MacActiveWindowDetector();

  if (dictionary) {
    ipcMain.handle('voxflow:dictionary:list', () => dictionary!.list());
    ipcMain.handle('voxflow:dictionary:add', (_event, payload: { pattern: string; replacement: string; caseSensitive: boolean }) => {
      return dictionary!.add(payload.pattern, payload.replacement, payload.caseSensitive);
    });
    ipcMain.handle('voxflow:dictionary:remove', (_event, id: number) => {
      dictionary!.remove(id);
      return dictionary!.list();
    });
  }
  if (settings) {
    ipcMain.handle('voxflow:settings:get', () => settings!.get());
    ipcMain.handle('voxflow:settings:update', (_event, patch: Partial<ReturnType<NonNullable<typeof settings>['get']>>) => {
      return settings!.update(patch);
    });
  }
  if (corrections) {
    ipcMain.handle('voxflow:history:list', (_event, limit: number = 25) => {
      return corrections!.recent(limit);
    });
  }
  ipcMain.handle('voxflow:history:copy', async (_event, text: string) => {
    new MacClipboard().write(text);
    return true;
  });
  ipcMain.handle('voxflow:history:reinject', async (_event, text: string) => {
    // Hide the popover first so focus returns to the user's previous app
    // before we paste. Paste will no-op in non-editable contexts.
    mb.hideWindow();
    await new Promise((r) => setTimeout(r, 150));
    const inj = new TextInjector({ clipboard: new MacClipboard(), keystroke: new MacKeystroke() });
    await inj.inject(text);
    return true;
  });

  const pill = new PillWindow();

  const onPipelineEvent = (ev: PipelineEvent): void => {
    try {
      const textLen = ev.text !== undefined ? ev.text.length : -1;
      const errMsg = ev.error ? ev.error.message : '';
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] state=${ev.state} textLen=${textLen} manualPaste=${ev.manualPasteRequired ?? false} err=${errMsg}\n`,
      );
    } catch {
      // ignore
    }
    const trayState = STATE_TO_TRAY[ev.state];
    trayController.setState(trayState);
    pill.update(ev.state);
    // Clear the clipboard the moment the user releases the hotkey so a fast
    // ⌘V during transcribe/clean doesn't paste the stale clipboard contents.
    // TextInjector will refill it with the real transcription once the
    // pipeline reaches the 'injecting' state.
    if (ev.state === 'transcribing') {
      void new MacClipboard().write('').catch(() => undefined);
    }
    broadcast(mb, 'voxflow:state', ev.state);
    if (ev.text !== undefined) {
      broadcast(mb, 'voxflow:transcription', ev.text);
      if (ev.state === 'idle') {
        if (ev.manualPasteRequired) {
          logger.warn(
            `Transcription copied to clipboard — paste denied; press ⌘V to paste manually (${ev.text.length} chars).`,
          );
          broadcast(mb, 'voxflow:manual-paste', ev.text);
        } else {
          logger.info(`Transcription injected (${ev.text.length} chars, app=${ev.activeApp ?? 'unknown'})`);
        }
      }
    }
    if (ev.error) {
      logger.error('Pipeline error', ev.error);
      broadcast(mb, 'voxflow:error', ev.error.message);
    }
  };
  // Always create the cleanup service — the AWS SDK's default credential
  // chain picks up ~/.aws/credentials, IAM role, SSO, etc. We only pass
  // explicit keys if they're in env (e.g. .env). If neither works, the
  // first cleanup call will fail and the pipeline falls back to raw text.
  const cleanup = new TextCleanupService({
    region: config.awsRegion,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });
  logger.info('Bedrock cleanup service enabled');

  const pipeline = new DictationPipeline({
    recorder,
    transcription,
    injector,
    activeWindow,
    cleanup,
    isCleanupEnabled: () => settings?.get().cleanupEnabled ?? true,
    dictionary,
    onEvent: (ev) => {
      if (ev.state === 'idle' && ev.text && ev.text.length > 0 && corrections) {
        try {
          corrections.record(ev.text, ev.text, ev.activeApp ?? null);
        } catch (err) {
          const e = err as Error;
          try {
            fs.appendFileSync(
              DIAG_LOG,
              `[${new Date().toISOString()}] corrections.record failed: ${e.message}\n`,
            );
          } catch {
            // ignore
          }
        }
      }
      onPipelineEvent(ev);
    },
  });
  void pipeline;

  // In-process hotkey (TOGGLE mode — tap to start, tap to stop). Runs inside
  // the main Electron process which has a working Accessibility grant.
  // We tried a native CGEventTap subprocess for press-and-hold but unsigned
  // subprocess Accessibility on macOS is unreliable: the Accessibility toggle
  // can appear "on" in System Settings while AXIsProcessTrusted silently
  // returns false. Until the app is code-signed with an Apple Developer ID,
  // globalShortcut + toggle is the reliable path.
  const registerHotkey = (): boolean => {
    return globalShortcut.register(config.hotkey, () => {
      try {
        fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] hotkey toggle\n`);
      } catch {
        // ignore
      }
      pipeline.toggle().catch((err: Error) => {
        fs.appendFileSync(
          DIAG_LOG,
          `[${new Date().toISOString()}] TOGGLE FAILED: ${err.stack ?? err.message}\n`,
        );
      });
    });
  };

  mb.on('ready', () => {
    logger.info('Menubar ready');
    const ok = registerHotkey();
    try {
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] menubar-ready; hotkey=${config.hotkey} registered=${ok}\n`,
      );
    } catch {
      // ignore
    }
    onPipelineEvent({ state: 'idle' });
  });

  mb.on('after-create-window', () => {
    logger.debug('Menubar window created');
  });

  app.on('window-all-closed', () => {
    // Keep app running in the tray on macOS.
  });

  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    pill.destroy();
    trayController.destroy();
    database?.close();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.debug('Activate event with no windows');
  }
});
