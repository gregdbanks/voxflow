import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IKeystroke } from './interfaces.js';

const execFileAsync = promisify(execFile);

/**
 * macOS keystroke port. Uses `osascript` to synthesize a `Cmd+V` paste.
 * Requires Accessibility permission for the launching process.
 */
export class MacKeystroke implements IKeystroke {
  async sendPaste(): Promise<void> {
    // tell application "System Events" to keystroke "v" using command down
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ]);
  }
}
