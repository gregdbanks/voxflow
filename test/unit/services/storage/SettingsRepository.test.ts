import { describe, it, expect } from 'vitest';
import { Database } from '../../../../src/services/storage/Database.js';
import { SettingsRepository } from '../../../../src/services/storage/SettingsRepository.js';

function fresh() {
  const db = new Database({ filename: ':memory:' });
  db.migrate();
  return new SettingsRepository(db);
}

describe('SettingsRepository', () => {
  it('returns the seeded defaults', () => {
    const settings = fresh().get();
    expect(settings.hotkey).toBe('Command+Alt+Z');
    expect(settings.language).toBe('auto');
    expect(settings.whisperModel).toBe('large-v3-turbo');
  });

  it('merges partial updates and round-trips', () => {
    const repo = fresh();
    const after = repo.update({ language: 'en' });
    expect(after.language).toBe('en');
    expect(after.hotkey).toBe('Command+Alt+Z');
    expect(after.whisperModel).toBe('large-v3-turbo');

    const reloaded = repo.get();
    expect(reloaded).toEqual(after);
  });

  it('accepts arbitrary hotkey strings', () => {
    const repo = fresh();
    const after = repo.update({ hotkey: 'Option+Space' });
    expect(after.hotkey).toBe('Option+Space');
  });

  it('persists whisperModel changes', () => {
    const repo = fresh();
    const after = repo.update({ whisperModel: 'small.en' });
    expect(after.whisperModel).toBe('small.en');
    expect(repo.get().whisperModel).toBe('small.en');
  });
});
