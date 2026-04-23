import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../../../../src/services/storage/Database.js';
import { DictionaryRepository } from '../../../../src/services/storage/DictionaryRepository.js';

function freshRepo() {
  const db = new Database({ filename: ':memory:' });
  db.migrate();
  return { db, repo: new DictionaryRepository(db) };
}

describe('DictionaryRepository', () => {
  let ctx: ReturnType<typeof freshRepo>;
  beforeEach(() => {
    ctx = freshRepo();
  });

  it('inserts, reads, and removes entries', () => {
    const added = ctx.repo.add('voxflow', 'VoxFlow', false);
    expect(added.pattern).toBe('voxflow');
    expect(added.replacement).toBe('VoxFlow');
    expect(added.caseSensitive).toBe(false);
    expect(added.id).toBeGreaterThan(0);

    const list = ctx.repo.list();
    expect(list).toHaveLength(1);

    ctx.repo.remove(added.id);
    expect(ctx.repo.list()).toHaveLength(0);
  });

  it('applies case-insensitive replacements by default with word boundaries', () => {
    ctx.repo.add('voxflow', 'VoxFlow', false);
    const result = ctx.repo.applyTo('i love voxflow and VoxFlow and Voxflow.');
    expect(result).toBe('i love VoxFlow and VoxFlow and VoxFlow.');
  });

  it('does not replace substrings inside other words', () => {
    ctx.repo.add('cat', 'dog', false);
    const result = ctx.repo.applyTo('concatenate the cat');
    expect(result).toBe('concatenate the dog');
  });

  it('respects case-sensitive entries when configured', () => {
    ctx.repo.add('API', 'API', true); // no change expected
    ctx.repo.add('api', 'API', true);
    const result = ctx.repo.applyTo('the api layer and the API layer');
    expect(result).toBe('the API layer and the API layer');
  });

  it('applies multiple entries in a stable order', () => {
    ctx.repo.add('github', 'GitHub', false);
    ctx.repo.add('api', 'API', false);
    const result = ctx.repo.applyTo('the github api');
    expect(result).toBe('the GitHub API');
  });

  it('is a no-op on empty input or empty dictionary', () => {
    expect(ctx.repo.applyTo('')).toBe('');
    expect(ctx.repo.applyTo('hello')).toBe('hello');
  });

  it('rejects empty patterns', () => {
    expect(() => ctx.repo.add('', 'x', false)).toThrow(/empty/);
    expect(() => ctx.repo.add('   ', 'x', false)).toThrow(/empty/);
  });
});
