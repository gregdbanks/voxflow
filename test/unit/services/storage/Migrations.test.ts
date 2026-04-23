import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from '../../../../src/services/storage/migrations.js';

const SQL_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'services', 'storage', 'migrations');

describe('migrations.ts mirrors migrations/*.sql', () => {
  it('matches each on-disk SQL migration byte-for-byte (trim/whitespace-normalized)', () => {
    const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(files).toHaveLength(MIGRATIONS.length);
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const match = /^(\d+)_(.+)\.sql$/.exec(file);
      expect(match).toBeTruthy();
      const id = parseInt(match![1]!, 10);
      const name = match![2]!;
      const onDisk = fs.readFileSync(path.join(SQL_DIR, file), 'utf8').trim();
      const inTs = MIGRATIONS.find((m) => m.id === id);
      expect(inTs, `TS migration for id=${id}`).toBeTruthy();
      expect(inTs!.name).toBe(name);
      // Strip SQL comments + collapse blank lines so a header comment on the
      // .sql file doesn't force the TS copy to carry it too.
      const normalize = (s: string) =>
        s
          .split('\n')
          .map((l) => l.replace(/\s+$/, ''))
          .filter((l) => !l.trim().startsWith('--'))
          .join('\n')
          .replace(/\n{2,}/g, '\n\n')
          .trim();
      expect(normalize(inTs!.sql)).toBe(normalize(onDisk));
    }
  });
});
