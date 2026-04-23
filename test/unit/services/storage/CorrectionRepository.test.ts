import { describe, it, expect } from 'vitest';
import { Database } from '../../../../src/services/storage/Database.js';
import { CorrectionRepository } from '../../../../src/services/storage/CorrectionRepository.js';

function fresh() {
  const db = new Database({ filename: ':memory:' });
  db.migrate();
  return new CorrectionRepository(db);
}

describe('CorrectionRepository', () => {
  it('records and returns recent corrections in DESC order', async () => {
    const repo = fresh();
    repo.record('hello wrld', 'hello world', 'TextEdit');
    await new Promise((r) => setTimeout(r, 5));
    repo.record('teh quick', 'the quick', null);
    const recent = repo.recent(10);
    expect(recent.map((r) => r.corrected)).toEqual(['the quick', 'hello world']);
    expect(recent[0]!.appName).toBeNull();
    expect(recent[1]!.appName).toBe('TextEdit');
  });

  it('respects the limit parameter', () => {
    const repo = fresh();
    for (let i = 0; i < 5; i++) repo.record(`o${i}`, `c${i}`, 'App');
    expect(repo.recent(3)).toHaveLength(3);
  });
});
