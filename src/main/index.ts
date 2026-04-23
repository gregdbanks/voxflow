import { app, BrowserWindow, globalShortcut } from 'electron';
import { menubar } from 'menubar';
import path from 'node:path';
import url from 'node:url';
import { loadConfig } from '../shared/config.js';
import { createLogger, type Logger } from '../shared/logger.js';
import { createTray, defaultTrayIconPath, type TrayController, type TrayState } from './tray.js';
import { createHotkey } from './hotkey.js';
import { AudioRecorder } from '../services/audio/AudioRecorder.js';
import { MacMicrophone } from '../platform/MacMicrophone.js';

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

function broadcastState(mb: { window?: BrowserWindow | null }, state: TrayState): void {
  const win = mb.window;
  if (win && !win.isDestroyed()) {
    win.webContents.send('voxflow:state', state);
  }
}

function updateState(
  trayController: TrayController,
  mb: { window?: BrowserWindow | null },
  state: TrayState,
): void {
  trayController.setState(state);
  broadcastState(mb, state);
}

async function handleHotkeyToggle(
  recorder: AudioRecorder,
  trayController: TrayController,
  mb: { window?: BrowserWindow | null },
  logger: Logger,
): Promise<void> {
  try {
    if (!recorder.isRecording()) {
      updateState(trayController, mb, 'recording');
      await recorder.start();
      logger.info('Recording started');
      return;
    }

    const result = await recorder.stop();
    logger.info(
      `Recording stopped — pcm=${result.pcm.length}B wav=${result.wav.length}B duration=${result.durationMs}ms`,
    );
    updateState(trayController, mb, 'idle');
  } catch (err) {
    logger.error('Hotkey toggle failed', err);
    updateState(trayController, mb, 'error');
  }
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

  const microphone = new MacMicrophone();
  const recorder = new AudioRecorder(microphone);
  const hotkey = createHotkey({
    accelerator: config.hotkey,
    onTrigger: () => {
      void handleHotkeyToggle(recorder, trayController, mb, logger);
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
    updateState(trayController, mb, 'idle');
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
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.debug('Activate event with no windows');
  }
});
