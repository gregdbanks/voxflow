import type { MigrationSource } from './Database.js';

/**
 * Migrations inlined as TypeScript so they land in the packaged bundle without
 * needing an extra copy step. The canonical source of each migration is
 * `src/services/storage/migrations/NNN_name.sql`; keep them in sync (both files
 * are covered by the Database + repository tests).
 */
export const MIGRATIONS: MigrationSource[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE IF NOT EXISTS dictionary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL,
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dictionary_pattern
  ON dictionary(pattern, case_sensitive);

CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original TEXT NOT NULL,
  corrected TEXT NOT NULL,
  app_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_created_at
  ON corrections(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(key, value) VALUES ('cleanup_enabled', '1');
INSERT OR IGNORE INTO settings(key, value) VALUES ('hotkey', 'CommandOrControl+Shift+Space');
INSERT OR IGNORE INTO settings(key, value) VALUES ('language', 'auto');
`.trim(),
  },
];
