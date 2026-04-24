import type { IClipboard, IKeystroke } from '../../platform/interfaces.js';
import { AccessibilityPermissionError } from '../../platform/MacKeystroke.js';

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
  /** True when the keystroke was denied (e.g. macOS Accessibility) and the
   * text is still sitting on the clipboard for the user to paste manually. */
  manualPasteRequired: boolean;
  /** Surface the underlying permission / keystroke error when we fell back. */
  fallbackReason?: string;
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
    // Time between posting ⌘V and restoring the user's clipboard. Needs
    // to be long enough for the target app to consume the paste event from
    // the OS event queue. robotjs.keyTap is synchronous at the post level
    // but receive-side is async; 150ms is a comfortable margin for normal
    // apps (Notes, browsers, editors) without feeling laggy.
    this.restoreDelayMs = options.restoreDelayMs ?? 150;
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
      // If macOS denied the paste keystroke (Accessibility not granted), we
      // leave the transcription on the clipboard so the user can ⌘V manually.
      // This is *not* an error — it's a graceful-degradation path. Other
      // keystroke errors still propagate.
      if (err instanceof AccessibilityPermissionError) {
        return {
          injected: text,
          previousClipboard,
          restored: false,
          manualPasteRequired: true,
          fallbackReason: err.message,
          elapsedMs: this.now() - startedAt,
        };
      }
      throw err;
    }

    // Wait for the target app to consume the paste event, then put the
    // user's previous clipboard back so dictation doesn't clobber things
    // they had copied. The earlier osascript-era race condition (paste
    // reading the restored clipboard) doesn't reappear here because
    // robotjs.keyTap is synchronous at post time and the 150ms margin is
    // much longer than the target app's event-loop latency.
    await this.sleep(this.restoreDelayMs);

    let restored = false;
    try {
      await this.clipboard.write(previousClipboard);
      restored = true;
    } catch {
      // If restore fails, the transcription stays on the clipboard — not
      // ideal but not broken either.
    }

    return {
      injected: text,
      previousClipboard,
      restored,
      manualPasteRequired: false,
      elapsedMs: this.now() - startedAt,
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
