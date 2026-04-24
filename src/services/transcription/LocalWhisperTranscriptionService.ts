import type {
  ITranscriptionService,
  TranscriptionRequest,
  TranscriptionResult,
} from '../../platform/interfaces.js';
import { TranscriptionError } from './TranscriptionService.js';
import { collapseRepeats } from './TranscriptionService.js';

/**
 * Matches the Whisper class surface from smart-whisper that we rely on. Kept
 * as a typed local alias so the dynamic import doesn't poison the rest of
 * the codebase with smart-whisper types and so tests can inject a stub.
 */
export interface WhisperEngine {
  transcribe(
    pcm: Float32Array,
    params?: Record<string, unknown>,
  ): Promise<{ result: Promise<Array<{ text: string }>> }>;
  free(): Promise<void>;
}

export interface LocalWhisperOptions {
  /** Path to the ggml model file (e.g. large-v3-turbo.bin). */
  modelPath: string;
  /** Optional: ISO language code to bias recognition, e.g. "en". */
  language?: string;
  /** Use GPU (CoreML on Apple Silicon) when available. Default: true. */
  gpu?: boolean;
  /** Injected engine — tests pass a stub, production loads smart-whisper. */
  engine?: WhisperEngine;
  /** Factory for the engine; defaults to lazily importing smart-whisper. */
  engineFactory?: (modelPath: string, gpu: boolean) => Promise<WhisperEngine>;
}

/**
 * Local whisper.cpp-powered transcription. Audio is processed in-process via
 * smart-whisper, which loads a ggml model into memory and runs inference on
 * CPU + CoreML (Apple Silicon) / Metal. Zero network calls — PCM is
 * converted to Float32 in-memory, fed to whisper.cpp, and the resulting
 * text comes back synchronously.
 */
export class LocalWhisperTranscriptionService implements ITranscriptionService {
  private readonly modelPath: string;
  private readonly language: string | undefined;
  private readonly gpu: boolean;
  private readonly engineFactory: NonNullable<LocalWhisperOptions['engineFactory']>;
  private engine: WhisperEngine | undefined;

  constructor(options: LocalWhisperOptions) {
    this.modelPath = options.modelPath;
    this.language = options.language;
    this.gpu = options.gpu ?? true;
    this.engine = options.engine;
    this.engineFactory = options.engineFactory ?? defaultEngineFactory;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const startedAt = Date.now();
    try {
      const engine = await this.ensureEngine();
      const pcm = pcmFromWav(request.audio);
      const task = await engine.transcribe(pcm, {
        language: request.language ?? this.language ?? 'en',
        // temperature=0 matches the Groq service behavior (deterministic,
        // fewer "word word word" stutters on long hesitant audio).
        temperature: 0,
        no_timestamps: true,
        suppress_non_speech_tokens: true,
      });
      const segments = await task.result;
      const text = segments.map((s) => s.text).join('').trim();
      return {
        text: collapseRepeats(text),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      throw toLocalError(err);
    }
  }

  /** Free the model from memory. Safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.free();
      } finally {
        this.engine = undefined;
      }
    }
  }

  private async ensureEngine(): Promise<WhisperEngine> {
    if (!this.engine) {
      this.engine = await this.engineFactory(this.modelPath, this.gpu);
    }
    return this.engine;
  }
}

async function defaultEngineFactory(modelPath: string, gpu: boolean): Promise<WhisperEngine> {
  // Dynamic import so tests and other platforms can skip loading the native
  // binding when they don't need it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Whisper } = require('smart-whisper') as typeof import('smart-whisper');
  const w = new Whisper(modelPath, { gpu });
  return w as unknown as WhisperEngine;
}

/**
 * WAV → mono 16 kHz Float32. Accepts both our encoded WAVs and a bare PCM
 * Int16 buffer (when a caller skips WavEncoder). Lightweight parser — we
 * only need the bits per sample, channel count, and sample rate to find
 * the data chunk and normalize.
 */
function pcmFromWav(buffer: Buffer): Float32Array {
  // Detect a RIFF WAV header. If absent, assume it's already raw 16-bit
  // little-endian PCM at 16 kHz mono (matches AudioRecorder's pcm field).
  const isWav = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF';
  if (!isWav) return int16BufferToFloat32(buffer);

  // Scan chunks to find "fmt " and "data".
  let offset = 12;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let channels = 1;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bitsPerSample = buffer.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataStart = start;
      dataLen = size;
      break;
    }
    offset = start + size;
  }
  if (dataStart < 0) throw new Error('WAV has no data chunk');
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bitsPerSample ${bitsPerSample} — Whisper needs 16-bit PCM`);
  }

  const samples = dataLen / 2 / channels;
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    // Average channels (typically mono → same value) to a single mono sample.
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buffer.readInt16LE(dataStart + (i * channels + c) * 2);
    }
    out[i] = sum / channels / 32768;
  }
  return resampleTo16k(out, sampleRate);
}

function int16BufferToFloat32(buffer: Buffer): Float32Array {
  const samples = Math.floor(buffer.length / 2);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = buffer.readInt16LE(i * 2) / 32768;
  }
  return out;
}

// Whisper demands 16 kHz mono. Our AudioRecorder is already 16 kHz, so this
// is a short-circuit for the common case. A naive linear-interpolation
// fallback covers anyone who changes that default.
function resampleTo16k(samples: Float32Array, rate: number): Float32Array {
  if (rate === 16000) return samples;
  const ratio = rate / 16000;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(samples.length - 1, lo + 1);
    const t = src - lo;
    out[i] = samples[lo] * (1 - t) + samples[hi] * t;
  }
  return out;
}

function toLocalError(err: unknown): TranscriptionError {
  if (err instanceof TranscriptionError) return err;
  const message = (err as { message?: string }).message ?? 'Local transcription failed';
  return new TranscriptionError(message, 'unknown');
}
