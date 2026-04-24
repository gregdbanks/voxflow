import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/shared/config.js';

describe('loadConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
    expect(config.groqApiKey).toBeUndefined();
    expect(config.hotkey).toBe('Command+Alt+Z');
    expect(config.transcriptionProvider).toBe('local');
    expect(config.whisperModel).toBe('large-v3-turbo');
  });

  it('overrides defaults from env', () => {
    const config = loadConfig({
      LOG_LEVEL: 'debug',
      GROQ_API_KEY: 'gsk_test',
      VOXFLOW_HOTKEY: 'CommandOrControl+Shift+V',
      VOXFLOW_TRANSCRIPTION_PROVIDER: 'groq',
      VOXFLOW_WHISPER_MODEL: 'small.en',
    } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('debug');
    expect(config.groqApiKey).toBe('gsk_test');
    expect(config.hotkey).toBe('CommandOrControl+Shift+V');
    expect(config.transcriptionProvider).toBe('groq');
    expect(config.whisperModel).toBe('small.en');
  });

  it('falls back to default for invalid LOG_LEVEL', () => {
    const config = loadConfig({ LOG_LEVEL: 'verbose' } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
  });

  it('treats empty string env vars as undefined for optional keys', () => {
    const config = loadConfig({
      GROQ_API_KEY: '',
    } as NodeJS.ProcessEnv);
    expect(config.groqApiKey).toBeUndefined();
  });

  it('falls back to default on invalid transcription provider', () => {
    const config = loadConfig({
      VOXFLOW_TRANSCRIPTION_PROVIDER: 'bogus',
    } as NodeJS.ProcessEnv);
    expect(config.transcriptionProvider).toBe('local');
  });
});
