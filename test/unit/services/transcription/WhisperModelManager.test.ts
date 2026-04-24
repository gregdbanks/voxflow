import { describe, it, expect, beforeEach } from 'vitest';
import { WhisperModelManager } from '../../../../src/services/transcription/WhisperModelManager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'voxflow-model-test-'));
}

describe('WhisperModelManager', () => {
  let cacheDir: string;
  beforeEach(() => {
    cacheDir = tmpDir();
  });

  it('pathFor composes the expected file path per model', () => {
    const m = new WhisperModelManager({ cacheDir });
    expect(m.pathFor('large-v3-turbo')).toBe(path.join(cacheDir, 'ggml-large-v3-turbo.bin'));
    expect(m.pathFor('small.en')).toBe(path.join(cacheDir, 'ggml-small.en.bin'));
  });

  it('isDownloaded is false when the file does not exist', () => {
    const m = new WhisperModelManager({ cacheDir });
    expect(m.isDownloaded('large-v3-turbo')).toBe(false);
  });

  it('isDownloaded is false when the file is obviously too small', () => {
    const m = new WhisperModelManager({ cacheDir });
    fs.writeFileSync(m.pathFor('large-v3-turbo'), Buffer.alloc(100));
    expect(m.isDownloaded('large-v3-turbo')).toBe(false);
  });

  it('isDownloaded accepts a file near the expected size', () => {
    const m = new WhisperModelManager({ cacheDir });
    // ggml-large-v3-turbo.bin expected ~1.62 GB. Simulate by lying with
    // a same-sized sparse file (punches a hole; actually 1 GB on disk).
    const filePath = m.pathFor('large-v3-turbo');
    const fd = fs.openSync(filePath, 'w');
    fs.ftruncateSync(fd, 1_620_000_000);
    fs.closeSync(fd);
    expect(m.isDownloaded('large-v3-turbo')).toBe(true);
    fs.unlinkSync(filePath);
  });

  it('ensure() no-ops when model is already downloaded', async () => {
    const m = new WhisperModelManager({
      cacheDir,
      fetchFn: async () => {
        throw new Error('fetch should not have been called');
      },
    });
    const filePath = m.pathFor('large-v3-turbo');
    const fd = fs.openSync(filePath, 'w');
    fs.ftruncateSync(fd, 1_620_000_000);
    fs.closeSync(fd);

    await expect(m.ensure('large-v3-turbo')).resolves.toBe(filePath);
    fs.unlinkSync(filePath);
  });

  it('ensure() throws a helpful error on a failed HTTP response', async () => {
    const m = new WhisperModelManager({
      cacheDir,
      fetchFn: async () =>
        new Response(null, { status: 403, statusText: 'Forbidden' }),
    });
    await expect(m.ensure('tiny.en')).rejects.toThrow(/403/);
  });
});
