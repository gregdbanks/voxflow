import type { IKeystroke } from './interfaces.js';

export class AccessibilityPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessibilityPermissionError';
  }
}

/**
 * macOS keystroke port. Posts ⌘V via robotjs, which calls CGEventPost
 * IN-PROCESS from the Electron main — so it inherits VoxFlow.app's
 * Accessibility grant rather than needing a separate grant for a helper
 * binary (the unsigned-subprocess TCC hole that killed our earlier
 * paste-helper attempts). If robotjs fails to load on any given platform,
 * we fall back to the clipboard-only path.
 */
export class MacKeystroke implements IKeystroke {
  async sendPaste(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const robot = require('robotjs') as { keyTap: (key: string, modifier?: string | string[]) => void };
      robot.keyTap('v', 'command');
    } catch (err) {
      throw new AccessibilityPermissionError(
        `Auto-paste failed (${(err as Error).message}). Transcription is on the clipboard; press ⌘V.`,
      );
    }
  }
}
