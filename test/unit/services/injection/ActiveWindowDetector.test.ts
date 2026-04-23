import { describe, it, expect } from 'vitest';
import { StubActiveWindow } from '../../../helpers/platform-stubs.js';

describe('StubActiveWindow', () => {
  // The concrete MacActiveWindowDetector loads a native module so it can't
  // be exercised in the unit tier. These tests pin the contract that M4 +
  // M6 rely on: the port is async, may return null, and exposes appName.
  it('returns the configured window info', async () => {
    const stub = new StubActiveWindow({ appName: 'Code', title: 'main.ts', bundleId: 'com.microsoft.VSCode' });
    const info = await stub.getActive();
    expect(info?.appName).toBe('Code');
    expect(info?.title).toBe('main.ts');
    expect(stub.calls).toBe(1);
  });

  it('returns null when no window is known', async () => {
    const stub = new StubActiveWindow();
    const info = await stub.getActive();
    expect(info).toBeNull();
  });
});
