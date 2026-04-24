import type { IClipboard, IKeystroke } from '../../platform/interfaces.js';

export interface TextInjectorOptions {
  clipboard: IClipboard;
  keystroke: IKeystroke;
  /** Delay between clipboard write and paste; some apps race otherwise. */
  pasteDelayMs?: number;
  /** Delay before restoring the original clipboard. */
  restoreDelayMs?: number;
  now?: () => number;
}

export interface InjectionResult {
  injected: string;
  previousClipboard: string;
  /** Whether the clipboard was successfully restored. */
  restored: boolean;
  elapsedMs: number;
}

/**
 * Injects text at the active cursor by:
 *   1. Reading the current clipboard contents.
 *   2. Writing the text we want to inject.
 *   3. Firing Cmd+V.
 *   4. Restoring the original clipboard.
 *
 * Steps 3 and 4 run sequentially with a small delay so the receiving app has
 * time to read the clipboard before we restore it.
 */
export class TextInjector {
  private readonly clipboard: IClipboard;
  private readonly keystroke: IKeystroke;
  private readonly pasteDelayMs: number;
  private readonly restoreDelayMs: number;
  private readonly now: () => number;

  constructor(options: TextInjectorOptions) {
    this.clipboard = options.clipboard;
    this.keystroke = options.keystroke;
    this.pasteDelayMs = options.pasteDelayMs ?? 25;
    this.restoreDelayMs = options.restoreDelayMs ?? 250;
    this.now = options.now ?? Date.now;
  }

  async inject(text: string): Promise<InjectionResult> {
    const startedAt = this.now();
    let previousClipboard = '';
    try {
      previousClipboard = await this.clipboard.read();
    } catch {
      // Clipboard read can fail on a fresh boot; proceed without restore info.
    }

    await this.clipboard.write(text);
    await this.sleep(this.pasteDelayMs);
    try {
      await this.keystroke.sendPaste();
    } catch (err) {
      // Leave the text on the clipboard so the user can ⌘V manually while
      // the permission issue is being resolved. Surface the original error.
      throw err;
    }
    await this.sleep(this.restoreDelayMs);

    let restored = false;
    try {
      await this.clipboard.write(previousClipboard);
      restored = true;
    } catch {
      restored = false;
    }

    return {
      injected: text,
      previousClipboard,
      restored,
      elapsedMs: this.now() - startedAt,
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
