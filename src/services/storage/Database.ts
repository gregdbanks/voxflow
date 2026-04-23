import fs from 'node:fs';
import path from 'node:path';
import type DatabaseConstructor from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';

type BetterSqlite = typeof DatabaseConstructor;
type Db = ReturnType<BetterSqlite>;

export interface DatabaseOptions {
  /** Path to the SQLite file, or `:memory:` for an in-memory database (tests). */
  filename: string;
  /** Override the `better-sqlite3` constructor (for tests without native binding). */
  SqliteCtor?: BetterSqlite;
  /** Override the list of migration sources (for tests). Defaults to `MIGRATIONS`. */
  migrationSources?: MigrationSource[];
}

export interface MigrationSource {
  id: number;
  name: string;
  sql: string;
}

export class Database {
  readonly raw: Db;
  private readonly migrations: MigrationSource[];

  constructor(options: DatabaseOptions) {
    if (options.filename !== ':memory:' && options.filename.length > 0) {
      fs.mkdirSync(path.dirname(options.filename), { recursive: true });
    }
    const Ctor = (options.SqliteCtor ?? loadBetterSqlite()) as BetterSqlite;
    this.raw = new Ctor(options.filename);
    this.raw.pragma('journal_mode = WAL');
    this.raw.pragma('foreign_keys = ON');
    this.migrations = options.migrationSources ?? MIGRATIONS;
  }

  migrate(): MigrationSource[] {
    this.raw.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    );
    const getApplied = this.raw.prepare<[], { id: number }>('SELECT id FROM schema_migrations ORDER BY id');
    const applied = new Set(getApplied.all().map((row) => row.id));
    const record = this.raw.prepare<[number, string, number]>(
      'INSERT INTO schema_migrations(id, name, applied_at) VALUES (?, ?, ?)',
    );
    const ran: MigrationSource[] = [];

    for (const migration of this.migrations) {
      if (applied.has(migration.id)) continue;
      this.raw.transaction(() => {
        this.raw.exec(migration.sql);
        record.run(migration.id, migration.name, Date.now());
      })();
      ran.push(migration);
    }
    return ran;
  }

  close(): void {
    this.raw.close();
  }
}

function loadBetterSqlite(): BetterSqlite {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('better-sqlite3');
  return mod.default ?? mod;
}
