import { describe, it, expect } from 'vitest';
import { TextInjector } from '../../../../src/services/injection/TextInjector.js';
import { StubClipboard, StubKeystroke } from '../../../helpers/platform-stubs.js';

describe('TextInjector', () => {
  it('writes text, pastes, and restores the original clipboard', async () => {
    const clipboard = new StubClipboard('original clipboard');
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });

    const result = await injector.inject('hello from voxflow');

    expect(clipboard.writes).toEqual(['hello from voxflow', 'original clipboard']);
    expect(keystroke.pasteCalls).toBe(1);
    expect(clipboard.contents).toBe('original clipboard');
    expect(result).toMatchObject({
      injected: 'hello from voxflow',
      previousClipboard: 'original clipboard',
      restored: true,
      manualPasteRequired: false,
    });
  });

  it('falls back to manual-paste (keeps text on clipboard) when paste is denied', async () => {
    const { AccessibilityPermissionError } = await import('../../../../src/platform/MacKeystroke.js');
    const clipboard = new StubClipboard('original');
    const keystroke = new StubKeystroke();
    keystroke.sendPaste = async () => {
      throw new AccessibilityPermissionError('keystroke denied');
    };
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });

    const result = await injector.inject('hi there');

    expect(result.manualPasteRequired).toBe(true);
    expect(result.fallbackReason).toMatch(/denied/);
    // The transcription is still on the clipboard — user will press ⌘V.
    expect(clipboard.contents).toBe('hi there');
    // We did NOT restore the previous clipboard, by design.
    expect(clipboard.writes).toEqual(['hi there']);
  });

  it('writes transcription before sending the paste keystroke', async () => {
    const events: string[] = [];
    const clipboard = new StubClipboard('');
    const originalWrite = clipboard.write.bind(clipboard);
    clipboard.write = async (t: string) => {
      events.push(`write:${t.slice(0, 6)}`);
      await originalWrite(t);
    };
    const keystroke = new StubKeystroke();
    const originalPaste = keystroke.sendPaste.bind(keystroke);
    keystroke.sendPaste = async () => {
      events.push('paste');
      await originalPaste();
    };
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });
    await injector.inject('voxflow');
    expect(events).toEqual(['write:voxflo', 'paste', 'write:']);
  });

  it('survives a clipboard read failure and still injects', async () => {
    const clipboard = new StubClipboard('ignored');
    clipboard.read = async () => {
      throw new Error('read denied');
    };
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });
    const result = await injector.inject('works');
    expect(result.injected).toBe('works');
    expect(keystroke.pasteCalls).toBe(1);
    expect(result.previousClipboard).toBe('');
  });
});
