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
  return path.join(app.getAppPath(), 'assets', 'tray-iconTemplate.png');
}
