import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { menubar } from 'menubar';
import path from 'node:path';
import url from 'node:url';
import { loadConfig } from '../shared/config.js';
import { createLogger, type Logger } from '../shared/logger.js';
import { createTray, defaultTrayIconPath, type TrayState } from './tray.js';
import { createHotkey } from './hotkey.js';
import { AudioRecorder } from '../services/audio/AudioRecorder.js';
import { MacMicrophone } from '../platform/MacMicrophone.js';
import { GroqTranscriptionService } from '../services/transcription/TranscriptionService.js';
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
  injecting: 'injecting',
  error: 'error',
};

function createTranscriptionService(
  apiKey: string | undefined,
  logger: Logger,
): ITranscriptionService {
  if (apiKey) return new GroqTranscriptionService({ apiKey });
  logger.warn('GROQ_API_KEY not set — using a no-op transcription service');
  return {
    async transcribe() {
      return { text: '(no transcription — set GROQ_API_KEY)', durationMs: 0 };
    },
  };
}

app.whenReady().then(() => {
  logger.info('VoxFlow starting');

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
    logger.error(
      'Failed to open SQLite — run `npm run rebuild:native` or `npx @electron/rebuild -f -w better-sqlite3`',
      err,
    );
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

  const onPipelineEvent = (ev: PipelineEvent): void => {
    const trayState = STATE_TO_TRAY[ev.state];
    trayController.setState(trayState);
    broadcast(mb, 'voxflow:state', ev.state);
    if (ev.text !== undefined) {
      broadcast(mb, 'voxflow:transcription', ev.text);
      if (ev.state === 'idle') {
        logger.info(`Transcription injected (${ev.text.length} chars, app=${ev.activeApp ?? 'unknown'})`);
      }
    }
    if (ev.error) {
      logger.error('Pipeline error', ev.error);
      broadcast(mb, 'voxflow:error', ev.error.message);
    }
  };
  const pipeline = new DictationPipeline({
    recorder,
    transcription,
    injector,
    activeWindow,
    dictionary,
    onEvent: (ev) => {
      if (ev.state === 'idle' && ev.text && ev.text.length > 0 && corrections) {
        corrections.record(ev.text, ev.text, ev.activeApp ?? null);
      }
      onPipelineEvent(ev);
    },
  });
  void pipeline;

  const hotkey = createHotkey({
    accelerator: config.hotkey,
    onTrigger: () => {
      pipeline.toggle().catch((err) => logger.error('Pipeline toggle failed', err));
    },
    shortcut: globalShortcut,
  });

  mb.on('ready', () => {
    logger.info('Menubar ready');
    const ok = hotkey.register();
    if (!ok) {
      logger.warn(`Failed to register hotkey ${config.hotkey}`);
    } else {
      logger.info(`Hotkey registered: ${config.hotkey}`);
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
    hotkey.unregister();
    trayController.destroy();
    database?.close();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.debug('Activate event with no windows');
  }
});
