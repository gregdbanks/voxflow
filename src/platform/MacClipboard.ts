import type { IClipboard } from './interfaces.js';

/**
 * macOS clipboard port. Uses `clipboardy` so it also works from the main
 * process (which doesn't have access to Electron's clipboard renderer API
 * outside an active window context).
 */
export class MacClipboard implements IClipboard {
  async read(): Promise<string> {
    const mod = await loadClipboardy();
    return mod.default.read();
  }

  async write(text: string): Promise<void> {
    const mod = await loadClipboardy();
    await mod.default.write(text);
  }
}

type ClipboardyModule = { default: { read: () => Promise<string>; write: (text: string) => Promise<void> } };

async function loadClipboardy(): Promise<ClipboardyModule> {
  return (await import('clipboardy')) as unknown as ClipboardyModule;
}
