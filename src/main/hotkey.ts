import type { GlobalShortcut } from 'electron';

export interface HotkeyController {
  register(): boolean;
  unregister(): void;
  isRegistered(): boolean;
}

export interface HotkeyOptions {
  accelerator: string;
  onTrigger: () => void;
  shortcut?: Pick<GlobalShortcut, 'register' | 'unregister' | 'isRegistered'>;
}

export function createHotkey(options: HotkeyOptions): HotkeyController {
  const shortcut = options.shortcut;
  let registered = false;

  return {
    register() {
      if (!shortcut) return false;
      const ok = shortcut.register(options.accelerator, options.onTrigger);
      registered = ok;
      return ok;
    },
    unregister() {
      if (!shortcut) return;
      if (registered) {
        shortcut.unregister(options.accelerator);
        registered = false;
      }
    },
    isRegistered() {
      if (!shortcut) return false;
      return shortcut.isRegistered(options.accelerator);
    },
  };
}
