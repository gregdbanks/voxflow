import { describe, it, expect } from 'vitest';
import { Database } from '../../../../src/services/storage/Database.js';

describe('Database', () => {
  it('runs every migration in order and records them in schema_migrations', () => {
    const db = new Database({ filename: ':memory:' });
    const ran = db.migrate();
    expect(ran.map((m) => m.id)).toEqual([1]);

    const rows = db.raw
      .prepare<[], { id: number; name: string }>('SELECT id, name FROM schema_migrations ORDER BY id')
      .all();
    expect(rows).toEqual([{ id: 1, name: 'initial' }]);
    db.close();
  });

  it('is idempotent — a second migrate() is a no-op', () => {
    const db = new Database({ filename: ':memory:' });
    expect(db.migrate()).toHaveLength(1);
    expect(db.migrate()).toHaveLength(0);
    db.close();
  });

  it('respects an explicit list of migration sources', () => {
    const db = new Database({
      filename: ':memory:',
      migrationSources: [
        { id: 1, name: 'core', sql: 'CREATE TABLE thing(id INTEGER PRIMARY KEY, name TEXT NOT NULL)' },
        { id: 2, name: 'extra', sql: 'CREATE TABLE other(id INTEGER PRIMARY KEY)' },
      ],
    });
    db.migrate();
    expect(() => db.raw.exec(`INSERT INTO thing(name) VALUES ('one')`)).not.toThrow();
    expect(() => db.raw.exec('INSERT INTO other DEFAULT VALUES')).not.toThrow();
    db.close();
  });
});
