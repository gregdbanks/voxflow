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
  private readonly now: () => number;

  constructor(options: TextInjectorOptions) {
    this.clipboard = options.clipboard;
    this.keystroke = options.keystroke;
    this.pasteDelayMs = options.pasteDelayMs ?? 25;
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

    // Deliberately NOT restoring the clipboard: the async CGEvent paste can
    // race with the restore write and cause the target app to paste the
    // pre-dictation clipboard instead of the transcription. Leaving the
    // transcription on the clipboard also lets the user ⌘V again to re-paste
    // into a different field — closer to Wispr's behavior.

    return {
      injected: text,
      previousClipboard,
      restored: false,
      manualPasteRequired: false,
      elapsedMs: this.now() - startedAt,
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
