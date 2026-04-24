import type { IKeystroke } from './interfaces.js';

export class AccessibilityPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessibilityPermissionError';
  }
}

/**
 * macOS keystroke port. We've been through osascript (-1743 Automation
 * denials) and a CGEventPost helper binary (unsigned subprocess Accessibility
 * is unreliable — toggles show "on" but AXIsProcessTrusted returns false).
 * Without a real Apple Developer ID signature, auto-paste is not
 * dependable, so this class now short-circuits: TextInjector writes the
 * transcription to the clipboard, and the user pastes with ⌘V. That matches
 * Wispr Flow's behaviour in manual-paste mode and is perfectly reliable.
 */
export class MacKeystroke implements IKeystroke {
  async sendPaste(): Promise<void> {
    throw new AccessibilityPermissionError(
      'Auto-paste disabled — transcription is on the clipboard; press ⌘V to paste.',
    );
  }
}
