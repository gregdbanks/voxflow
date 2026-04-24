import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IKeystroke } from './interfaces.js';

const execFileAsync = promisify(execFile);

export class AccessibilityPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessibilityPermissionError';
  }
}

/**
 * macOS keystroke port. Uses `osascript` to synthesize a `Cmd+V` paste.
 * Requires Accessibility permission for the *launching* process — note that
 * in dev mode the launching process is the Electron binary inside
 * `node_modules/electron/dist/Electron.app`, NOT your Terminal.
 */
export class MacKeystroke implements IKeystroke {
  async sendPaste(): Promise<void> {
    try {
      await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to keystroke "v" using command down',
      ]);
    } catch (err) {
      const message = (err as { stderr?: string; message?: string }).stderr ?? (err as Error).message;
      if (/is not allowed to send keystrokes|not allowed assistive access|1002/i.test(message)) {
        throw new AccessibilityPermissionError(
          'macOS denied the paste keystroke. Grant Accessibility permission to the app that ran this process ' +
            '(System Settings → Privacy & Security → Accessibility). In dev mode that is Electron.app, not Terminal. ' +
            'After granting, fully quit and re-launch the app.',
        );
      }
      throw err;
    }
  }
}
