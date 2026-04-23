import type { Database } from './Database.js';
import type { CorrectionRecord, ICorrectionRepository } from '../../platform/interfaces.js';

interface Row {
  id: number;
  original: string;
  corrected: string;
  app_name: string | null;
  created_at: number;
}

export class CorrectionRepository implements ICorrectionRepository {
  constructor(private readonly db: Database) {}

  record(original: string, corrected: string, appName: string | null): CorrectionRecord {
    const createdAt = Date.now();
    const info = this.db.raw
      .prepare<[string, string, string | null, number]>(
        'INSERT INTO corrections(original, corrected, app_name, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(original, corrected, appName, createdAt);
    return {
      id: Number(info.lastInsertRowid),
      original,
      corrected,
      appName,
      createdAt,
    };
  }

  recent(limit: number): CorrectionRecord[] {
    const rows = this.db.raw
      .prepare<[number], Row>(
        'SELECT id, original, corrected, app_name, created_at FROM corrections ORDER BY created_at DESC LIMIT ?',
      )
      .all(limit);
    return rows.map((row) => ({
      id: row.id,
      original: row.original,
      corrected: row.corrected,
      appName: row.app_name,
      createdAt: row.created_at,
    }));
  }
}
