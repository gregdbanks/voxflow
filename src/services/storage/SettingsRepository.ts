import type { Database } from './Database.js';
import type { AppSettings, ISettingsRepository } from '../../platform/interfaces.js';

const DEFAULTS: AppSettings = {
  hotkey: 'Command+Alt+Z',
  language: 'auto',
};

interface Row {
  key: string;
  value: string;
}

const KEY_MAP: Record<keyof AppSettings, string> = {
  hotkey: 'hotkey',
  language: 'language',
};

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Database) {}

  get(): AppSettings {
    const rows = this.db.raw
      .prepare<[], Row>('SELECT key, value FROM settings')
      .all();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      hotkey: byKey.get(KEY_MAP.hotkey) ?? DEFAULTS.hotkey,
      language: byKey.get(KEY_MAP.language) ?? DEFAULTS.language,
    };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const entries = Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>;
    const upsert = this.db.raw.prepare<[string, string]>(
      'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    this.db.raw.transaction(() => {
      for (const [key, value] of entries) {
        const sqlKey = KEY_MAP[key];
        upsert.run(sqlKey, serialize(value));
      }
    })();
    return this.get();
  }
}

function serialize(value: unknown): string {
  return String(value);
}
