import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('electron app launches and renders the menubar window', async () => {
  const appPath = path.resolve(__dirname, '..', '..');
  const electronApp = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      NODE_ENV: 'test',
    },
  });

  try {
    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    expect(title.toLowerCase()).toContain('voxflow');

    await window.waitForSelector('.panel', { timeout: 5000 });
    const headerText = await window.locator('.panel-header h1').textContent();
    expect(headerText).toBe('VoxFlow');

    const statusText = await window.locator('#status').textContent();
    expect(statusText).toMatch(/dictate/i);

    const dotState = await window.locator('.dot').getAttribute('data-state');
    expect(dotState).toBe('idle');
  } finally {
    await electronApp.close();
  }
});
