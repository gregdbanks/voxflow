import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';

export type TrayState = 'idle' | 'recording' | 'transcribing' | 'cleaning' | 'injecting' | 'error';

export interface TrayController {
  setState(state: TrayState): void;
  destroy(): void;
  getTray(): Tray;
}

export function createTray(iconPath: string, onQuit: () => void): TrayController {
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('VoxFlow');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'VoxFlow', enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        onQuit();
        app.quit();
      },
    },
  ]);

  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });

  return {
    setState(state) {
      const suffix = state === 'idle' ? '' : ` · ${state}`;
      tray.setToolTip(`VoxFlow${suffix}`);
      // Visible indicator — without this you'd have to hover the icon to know
      // dictation is live. Red dot while recording, small dot during the
      // post-recording pipeline, cleared at idle.
      const title =
        state === 'recording'
          ? '●'
          : state === 'transcribing' || state === 'cleaning' || state === 'injecting'
            ? '·'
            : '';
      tray.setTitle(title);
    },
    destroy() {
      tray.destroy();
    },
    getTray() {
      return tray;
    },
  };
}

export function defaultTrayIconPath(): string {
  // In a packaged app, `app.getAppPath()` resolves inside app.asar, but
  // forge.config.ts ships `assets/` via `extraResource`, which lands next to
  // app.asar under process.resourcesPath. Joining against getAppPath() there
  // points nowhere, which makes `new Tray(emptyImage)` an invisible tray.
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, 'assets', 'tray-iconTemplate.png');
}
