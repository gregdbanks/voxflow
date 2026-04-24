import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/shared/config.js';

describe('loadConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
    expect(config.hotkey).toBe('Command+Alt+Z');
    expect(config.whisperModel).toBe('large-v3-turbo');
  });

  it('overrides defaults from env', () => {
    const config = loadConfig({
      LOG_LEVEL: 'debug',
      VOXFLOW_HOTKEY: 'CommandOrControl+Shift+V',
      VOXFLOW_WHISPER_MODEL: 'small.en',
    } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('debug');
    expect(config.hotkey).toBe('CommandOrControl+Shift+V');
    expect(config.whisperModel).toBe('small.en');
  });

  it('falls back to default for invalid LOG_LEVEL', () => {
    const config = loadConfig({ LOG_LEVEL: 'verbose' } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
  });

  it('falls back to default on invalid whisper model', () => {
    const config = loadConfig({
      VOXFLOW_WHISPER_MODEL: 'bogus',
    } as NodeJS.ProcessEnv);
    expect(config.whisperModel).toBe('large-v3-turbo');
  });
});
