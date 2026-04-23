import { describe, it, expect } from 'vitest';
import { createHotkey } from '../../../src/main/hotkey.js';
import { FakeGlobalShortcut } from '../../helpers/platform-stubs.js';

describe('createHotkey', () => {
  it('registers and unregisters the accelerator with the provided handler', () => {
    const shortcut = new FakeGlobalShortcut();
    const calls: string[] = [];
    const hk = createHotkey({
      accelerator: 'CommandOrControl+Shift+Space',
      onTrigger: () => calls.push('trigger'),
      shortcut,
    });

    expect(hk.register()).toBe(true);
    expect(shortcut.registerCalls).toHaveLength(1);
    expect(shortcut.registerCalls[0]![0]).toBe('CommandOrControl+Shift+Space');
    expect(hk.isRegistered()).toBe(true);

    shortcut.trigger('CommandOrControl+Shift+Space');
    expect(calls).toEqual(['trigger']);

    hk.unregister();
    expect(shortcut.unregisterCalls).toEqual(['CommandOrControl+Shift+Space']);
    expect(hk.isRegistered()).toBe(false);
  });

  it('returns false when the shortcut fails to register', () => {
    const shortcut = new FakeGlobalShortcut();
    shortcut.nextResult = false;
    const hk = createHotkey({
      accelerator: 'CommandOrControl+Shift+Space',
      onTrigger: () => undefined,
      shortcut,
    });
    expect(hk.register()).toBe(false);
    expect(hk.isRegistered()).toBe(false);
  });

  it('is a no-op when no shortcut module is provided', () => {
    const hk = createHotkey({
      accelerator: 'CommandOrControl+Shift+Space',
      onTrigger: () => undefined,
    });
    expect(hk.register()).toBe(false);
    expect(hk.isRegistered()).toBe(false);
    expect(() => hk.unregister()).not.toThrow();
  });
});
