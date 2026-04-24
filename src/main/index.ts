import { app, BrowserWindow, globalShortcut, ipcMain, systemPreferences } from 'electron';
import { menubar } from 'menubar';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// GUI-launched apps inherit a minimal PATH that omits Homebrew's bin dirs.
// node-mic shells out to `sox`/`rec` via shelljs.which(), so without this
// prepend, dictation dies at pipeline.begin() with "sox is not installed".
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`;

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
import { LocalWhisperTranscriptionService } from '../services/transcription/LocalWhisperTranscriptionService.js';
import { WhisperModelManager } from '../services/transcription/WhisperModelManager.js';
import type { AppConfig } from '../shared/config.js';

function createTranscriptionService(
  config: AppConfig,
  logger: Logger,
  modelManager: WhisperModelManager,
): ITranscriptionService {
  if (config.transcriptionProvider === 'local') {
    // Local whisper.cpp inference. If the model isn't downloaded yet, the
    // pipeline falls back to a sentinel service so the user sees a clear
    // "downloading…" state instead of recording silently.
    if (!modelManager.isDownloaded(config.whisperModel)) {
      logger.warn(`Whisper model ${config.whisperModel} not downloaded — transcription gated until ready`);
      return {
        async transcribe() {
          return { text: NO_OP_TRANSCRIPTION_SENTINEL, durationMs: 0 };
        },
      };
    }
    return new LocalWhisperTranscriptionService({
      modelPath: modelManager.pathFor(config.whisperModel),
    });
  }
  if (config.transcriptionProvider === 'groq' && config.groqApiKey) {
    return new GroqTranscriptionService({ apiKey: config.groqApiKey });
  }
  logger.warn(`Transcription provider "${config.transcriptionProvider}" is not available — using a no-op service`);
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
  //
  // The `app.dock.show() + app.focus()` dance is important: for menubar apps
  // without a visible window or dock icon, macOS buries the permission
  // prompt behind other windows, and the user has to click the tray icon to
  // surface it. Briefly showing the dock gives the process an on-screen
  // identity, the prompt pops to the front, and we re-hide the dock as soon
  // as the user responds.
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] mic status=${micStatus}\n`);
    if (micStatus !== 'granted') {
      if (process.platform === 'darwin') {
        try {
          await app.dock?.show();
        } catch {
          // ignore — Electron versions without this method fall through
        }
      }
      app.focus({ steal: true });
      const granted = await systemPreferences.askForMediaAccess('microphone');
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] mic askForMediaAccess=${granted}\n`,
      );
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
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
  const modelManager = new WhisperModelManager();
  let transcription = createTranscriptionService(config, logger, modelManager);

  // If local is selected and the model isn't on disk yet, kick off the
  // download in the background and swap the transcription service to the
  // real local engine once it's ready. We emit a custom state so the UI can
  // show progress without changing the pipeline's state machine.
  if (config.transcriptionProvider === 'local' && !modelManager.isDownloaded(config.whisperModel)) {
    modelManager.on('progress', (p: { percent: number; bytesWritten: number; totalBytes: number }) => {
      try {
        fs.appendFileSync(
          DIAG_LOG,
          `[${new Date().toISOString()}] model download ${p.percent}% (${p.bytesWritten}/${p.totalBytes})\n`,
        );
      } catch {
        // ignore
      }
      broadcast(mb, 'voxflow:model-progress', p);
    });
    modelManager
      .ensure(config.whisperModel)
      .then(() => {
        fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] model download done\n`);
        transcription = new LocalWhisperTranscriptionService({
          modelPath: modelManager.pathFor(config.whisperModel),
        });
        // Rewire the pipeline's transcription reference so subsequent
        // dictations use the real local engine.
        (pipeline as unknown as { transcription: ITranscriptionService }).transcription = transcription;
        broadcast(mb, 'voxflow:model-ready', { model: config.whisperModel });
      })
      .catch((err: Error) => {
        logger.error('Whisper model download failed', err);
        fs.appendFileSync(
          DIAG_LOG,
          `[${new Date().toISOString()}] model download failed: ${err.message}\n`,
        );
        broadcast(mb, 'voxflow:model-error', { message: err.message });
      });
  }

  const injector = new TextInjector({
    clipboard: new MacClipboard(),
    keystroke: new MacKeystroke(),
  });
  const activeWindow = new MacActiveWindowDetector();

  // Late-bound reference so IPC handlers registered before the pipeline
  // is constructed can still reach it once it exists.
  const pipelineRef: { current: DictationPipeline | null } = { current: null };

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
  ipcMain.handle('voxflow:privacy-info', async () => {
    return {
      provider: config.transcriptionProvider,
      model: config.transcriptionProvider === 'local' ? config.whisperModel : undefined,
    };
  });
  ipcMain.handle('voxflow:stop', async () => {
    // Pill's X button. Force-reset the pipeline so a stuck recording state
    // doesn't require a full quit/relaunch cycle.
    try {
      // pipeline is defined below; we capture it via the late-binding ref.
      if (pipelineRef.current) await pipelineRef.current.cancel();
    } catch (err) {
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] pipeline.cancel failed: ${(err as Error).message}\n`,
      );
    }
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
  // Hook the mic's RMS level into the pill so the waveform bars dance in
  // real time while recording. The listener fires whenever node-mic emits a
  // PCM chunk (~20 Hz at 16 kHz / 800-sample chunks).
  microphone.setLevelListener((level) => pill.level(level));

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
  pipelineRef.current = pipeline;

  // Press-and-hold on the bare Option (⌥) key via uiohook-napi. Runs
  // IN-PROCESS inside the main Electron binary which already has
  // Accessibility — so we dodge the subprocess TCC mess the standalone
  // key-listener hit. Option down starts recording, Option up ends it.
  // If the user presses Option+letter for a special character, recording
  // simply continues and the character types through as normal.
  let uioStarted = false;
  let optionHeld = false;
  let beginInFlight: Promise<void> | null = null;
  const installUiohook = async (): Promise<boolean> => {
    try {
      const { uIOhook, UiohookKey } = await import('uiohook-napi');
      // Both Alt keycodes (left + right) — macOS surfaces each physical
      // Option key with its own keycode.
      const ALT_KEYCODES = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight]);

      uIOhook.on('keydown', (ev) => {
        if (!ALT_KEYCODES.has(ev.keycode) || optionHeld) return;
        optionHeld = true;
        try {
          fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] uio option down\n`);
        } catch {
          // ignore
        }
        beginInFlight = pipeline.begin().catch((err: Error) => {
          fs.appendFileSync(
            DIAG_LOG,
            `[${new Date().toISOString()}] BEGIN FAILED: ${err.stack ?? err.message}\n`,
          );
        });
      });

      uIOhook.on('keyup', async (ev) => {
        if (!ALT_KEYCODES.has(ev.keycode) || !optionHeld) return;
        optionHeld = false;
        try {
          fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] uio option up\n`);
        } catch {
          // ignore
        }
        if (beginInFlight) {
          await beginInFlight;
          beginInFlight = null;
        }
        pipeline.finish().catch((err: Error) => {
          fs.appendFileSync(
            DIAG_LOG,
            `[${new Date().toISOString()}] FINISH FAILED: ${err.stack ?? err.message}\n`,
          );
        });
      });

      uIOhook.start();
      uioStarted = true;
      return true;
    } catch (err) {
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] uiohook install failed: ${(err as Error).message}\n`,
      );
      return false;
    }
  };

  // Fallback: if uiohook fails to load/start, keep the Cmd+Option+Z toggle
  // working so the user isn't stranded without a hotkey.
  const registerFallbackHotkey = (): boolean => {
    return globalShortcut.register(config.hotkey, () => {
      try {
        fs.appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] fallback hotkey toggle\n`);
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

  mb.on('ready', async () => {
    logger.info('Menubar ready');
    const uioOk = await installUiohook();
    // Always register the Cmd+Option+Z toggle too — it's a harmless backup
    // and gives the user a way to trigger dictation if uiohook is deafened
    // for any reason (e.g. Accessibility reset).
    const fbOk = registerFallbackHotkey();
    try {
      fs.appendFileSync(
        DIAG_LOG,
        `[${new Date().toISOString()}] menubar-ready; uiohook=${uioOk} fallback=${config.hotkey} registered=${fbOk}\n`,
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
    if (uioStarted) {
      void import('uiohook-napi').then((m) => m.uIOhook.stop()).catch(() => undefined);
    }
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
