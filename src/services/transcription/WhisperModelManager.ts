import fs from 'node:fs';
import path from 'node:path';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { EventEmitter } from 'node:events';

/**
 * Manages local Whisper model files. Downloads from Hugging Face on first
 * use, persists to a stable cache directory outside the app bundle, and
 * exposes progress events for the UI.
 */

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

// Observed sizes from Hugging Face as of April 2026. Used to estimate
// progress when the HTTP response doesn't give us a Content-Length.
const EXPECTED_BYTES: Record<string, number> = {
  'ggml-tiny.en.bin': 77_691_713,
  'ggml-base.en.bin': 147_964_211,
  'ggml-small.en.bin': 487_601_967,
  'ggml-medium.en.bin': 1_533_763_059,
  'ggml-large-v3-turbo.bin': 1_624_555_275,
  'ggml-large-v3.bin': 3_094_623_691,
};

export type WhisperModelId =
  | 'tiny.en'
  | 'base.en'
  | 'small.en'
  | 'medium.en'
  | 'large-v3-turbo'
  | 'large-v3';

export interface ModelDownloadProgress {
  model: WhisperModelId;
  bytesWritten: number;
  totalBytes: number;
  percent: number;
}

export interface WhisperModelManagerOptions {
  /** Base directory for model files. Defaults to ~/Library/Application Support/VoxFlow/models */
  cacheDir?: string;
  /** HTTP client override — primarily for tests. */
  fetchFn?: typeof fetch;
  /** File-system facade — primarily for tests. */
  fs?: Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'statSync' | 'createWriteStream' | 'renameSync' | 'unlinkSync'>;
}

export class WhisperModelManager extends EventEmitter {
  private readonly cacheDir: string;
  private readonly fetchFn: typeof fetch;
  private readonly fsImpl: NonNullable<WhisperModelManagerOptions['fs']>;

  constructor(options: WhisperModelManagerOptions = {}) {
    super();
    this.cacheDir = options.cacheDir ?? path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'VoxFlow', 'models');
    this.fetchFn = options.fetchFn ?? fetch;
    this.fsImpl = options.fs ?? fs;
  }

  /** Absolute path where the given model is stored (may not exist yet). */
  pathFor(model: WhisperModelId): string {
    return path.join(this.cacheDir, `ggml-${model}.bin`);
  }

  /** Returns true if the model file exists locally and is roughly the expected size. */
  isDownloaded(model: WhisperModelId): boolean {
    const filePath = this.pathFor(model);
    if (!this.fsImpl.existsSync(filePath)) return false;
    try {
      const { size } = this.fsImpl.statSync(filePath);
      const expected = EXPECTED_BYTES[`ggml-${model}.bin`];
      if (expected === undefined) return size > 0;
      // Accept ±5% as a rough sanity check against partial/corrupt downloads.
      return size > expected * 0.95;
    } catch {
      return false;
    }
  }

  /**
   * Download the model if it isn't already cached. Emits `progress` events
   * during the download and resolves with the local file path when done.
   * Safe to call multiple times — no-op if already present.
   */
  async ensure(model: WhisperModelId): Promise<string> {
    const filePath = this.pathFor(model);
    if (this.isDownloaded(model)) return filePath;

    this.fsImpl.mkdirSync(this.cacheDir, { recursive: true });
    const url = `${HF_BASE}/ggml-${model}.bin`;
    const tmpPath = `${filePath}.partial`;

    const response = await this.fetchFn(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
    }

    const headerSize = Number(response.headers.get('content-length') ?? '0');
    const totalBytes = headerSize > 0 ? headerSize : (EXPECTED_BYTES[`ggml-${model}.bin`] ?? 0);

    let bytesWritten = 0;
    const writeStream = this.fsImpl.createWriteStream(tmpPath);

    // Progress throttled to one emit per ~200ms so we don't flood IPC.
    let lastEmit = 0;
    const sourceStream = nodeReadableFromWeb(response.body);
    sourceStream.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      const now = Date.now();
      if (now - lastEmit >= 200 || (totalBytes > 0 && bytesWritten >= totalBytes)) {
        lastEmit = now;
        this.emit('progress', {
          model,
          bytesWritten,
          totalBytes,
          percent: totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0,
        } satisfies ModelDownloadProgress);
      }
    });

    await streamPipeline(sourceStream, writeStream);
    this.fsImpl.renameSync(tmpPath, filePath);
    this.emit('done', { model, filePath });
    return filePath;
  }
}

// Convert the WHATWG ReadableStream returned by fetch into a Node.js Readable
// so we can use stream.pipeline and 'data' events with Buffer chunks.
function nodeReadableFromWeb(body: ReadableStream<Uint8Array>): NodeJS.ReadableStream {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Readable } = require('node:stream') as typeof import('node:stream');
  return Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
}
