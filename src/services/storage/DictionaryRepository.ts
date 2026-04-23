import type { Database } from './Database.js';
import type { DictionaryEntry, IDictionaryRepository } from '../../platform/interfaces.js';

interface Row {
  id: number;
  pattern: string;
  replacement: string;
  case_sensitive: number;
  created_at: number;
}

export class DictionaryRepository implements IDictionaryRepository {
  constructor(private readonly db: Database) {}

  list(): DictionaryEntry[] {
    const rows = this.db.raw
      .prepare<[], Row>('SELECT id, pattern, replacement, case_sensitive, created_at FROM dictionary ORDER BY pattern')
      .all();
    return rows.map(toEntry);
  }

  add(pattern: string, replacement: string, caseSensitive: boolean): DictionaryEntry {
    if (pattern.trim().length === 0) throw new Error('Dictionary pattern cannot be empty');
    const createdAt = Date.now();
    const info = this.db.raw
      .prepare<[string, string, number, number]>(
        'INSERT INTO dictionary(pattern, replacement, case_sensitive, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(pattern, replacement, caseSensitive ? 1 : 0, createdAt);
    const row = this.db.raw
      .prepare<[number], Row>('SELECT id, pattern, replacement, case_sensitive, created_at FROM dictionary WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    if (!row) throw new Error('Failed to read back inserted dictionary row');
    return toEntry(row);
  }

  remove(id: number): void {
    this.db.raw.prepare<[number]>('DELETE FROM dictionary WHERE id = ?').run(id);
  }

  applyTo(text: string): string {
    if (text.length === 0) return text;
    const entries = this.list();
    if (entries.length === 0) return text;

    let result = text;
    for (const entry of entries) {
      result = applyOne(result, entry);
    }
    return result;
  }
}

function applyOne(text: string, entry: DictionaryEntry): string {
  const pattern = escapeRegex(entry.pattern);
  // `\b` doesn't treat punctuation cleanly across locales, so prefer a
  // boundary that's (start / non-word) + (end / non-word).
  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${pattern}(?=$|[^\\p{L}\\p{N}_])`,
    entry.caseSensitive ? 'gu' : 'giu',
  );
  return text.replace(regex, (_match, boundary: string) => boundary + entry.replacement);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toEntry(row: Row): DictionaryEntry {
  return {
    id: row.id,
    pattern: row.pattern,
    replacement: row.replacement,
    caseSensitive: row.case_sensitive === 1,
    createdAt: row.created_at,
  };
}
