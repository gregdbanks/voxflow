import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/shared/config.js';

describe('loadConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
    expect(config.awsRegion).toBe('us-east-1');
    expect(config.groqApiKey).toBeUndefined();
    expect(config.awsAccessKeyId).toBeUndefined();
    expect(config.awsSecretAccessKey).toBeUndefined();
    expect(config.hotkey).toBe('Command+Alt+Z');
  });

  it('overrides defaults from env', () => {
    const config = loadConfig({
      LOG_LEVEL: 'debug',
      GROQ_API_KEY: 'gsk_test',
      AWS_REGION: 'eu-west-1',
      AWS_ACCESS_KEY_ID: 'AKIA',
      AWS_SECRET_ACCESS_KEY: 'secret',
      VOXFLOW_HOTKEY: 'CommandOrControl+Shift+V',
    } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('debug');
    expect(config.groqApiKey).toBe('gsk_test');
    expect(config.awsRegion).toBe('eu-west-1');
    expect(config.awsAccessKeyId).toBe('AKIA');
    expect(config.awsSecretAccessKey).toBe('secret');
    expect(config.hotkey).toBe('CommandOrControl+Shift+V');
  });

  it('falls back to default for invalid LOG_LEVEL', () => {
    const config = loadConfig({ LOG_LEVEL: 'verbose' } as NodeJS.ProcessEnv);
    expect(config.logLevel).toBe('info');
  });

  it('treats empty string env vars as undefined for optional keys', () => {
    const config = loadConfig({
      GROQ_API_KEY: '',
      AWS_ACCESS_KEY_ID: '',
    } as NodeJS.ProcessEnv);
    expect(config.groqApiKey).toBeUndefined();
    expect(config.awsAccessKeyId).toBeUndefined();
  });
});
