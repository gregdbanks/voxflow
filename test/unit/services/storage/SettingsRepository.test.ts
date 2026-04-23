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
    expect(settings.cleanupEnabled).toBe(true);
    expect(settings.hotkey).toBe('CommandOrControl+Shift+Space');
    expect(settings.language).toBe('auto');
  });

  it('merges partial updates and round-trips', () => {
    const repo = fresh();
    const after = repo.update({ cleanupEnabled: false, language: 'en' });
    expect(after.cleanupEnabled).toBe(false);
    expect(after.language).toBe('en');
    expect(after.hotkey).toBe('CommandOrControl+Shift+Space');

    const reloaded = repo.get();
    expect(reloaded).toEqual(after);
  });

  it('accepts arbitrary hotkey strings', () => {
    const repo = fresh();
    const after = repo.update({ hotkey: 'Option+Space' });
    expect(after.hotkey).toBe('Option+Space');
  });
});
