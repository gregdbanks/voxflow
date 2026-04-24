import { describe, it, expect } from 'vitest';
import { LocalWhisperTranscriptionService, type WhisperEngine } from '../../../../src/services/transcription/LocalWhisperTranscriptionService.js';
import { TranscriptionError } from '../../../../src/services/transcription/TranscriptionService.js';

// Minimal WAV builder — RIFF header + fmt + data. 16kHz mono int16. Enough
// for the service's parser to round-trip without pulling in a WAV lib.
function makeWav(samples: Int16Array, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = samples.byteLength;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

function stubEngine(textChunks: string[]): WhisperEngine {
  return {
    async transcribe() {
      return {
        result: Promise.resolve(textChunks.map((text) => ({ text }))),
      };
    },
    async free() {
      // no-op
    },
  };
}

describe('LocalWhisperTranscriptionService', () => {
  it('transcribes a WAV buffer and returns concatenated text', async () => {
    const samples = new Int16Array(1600); // 0.1s of silence
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => stubEngine([' hello', ' world']),
    });

    const result = await svc.transcribe({ audio: makeWav(samples) });

    expect(result.text).toBe('hello world');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('applies collapseRepeats to the output (defensive against Whisper stutters)', async () => {
    const samples = new Int16Array(1600);
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => stubEngine([' besides besides besides']),
    });

    const result = await svc.transcribe({ audio: makeWav(samples) });

    // collapseRepeats collapses 3+ consecutive identical words
    expect(result.text).toBe('besides');
  });

  it('wraps underlying errors as TranscriptionError', async () => {
    const samples = new Int16Array(1600);
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => ({
        async transcribe() {
          throw new Error('model not loaded');
        },
        async free() {
          // no-op
        },
      }),
    });

    await expect(svc.transcribe({ audio: makeWav(samples) })).rejects.toBeInstanceOf(
      TranscriptionError,
    );
  });

  it('only loads the engine once across many transcriptions', async () => {
    const samples = new Int16Array(1600);
    let factoryCalls = 0;
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => {
        factoryCalls++;
        return stubEngine([' hi']);
      },
    });

    await svc.transcribe({ audio: makeWav(samples) });
    await svc.transcribe({ audio: makeWav(samples) });
    await svc.transcribe({ audio: makeWav(samples) });

    expect(factoryCalls).toBe(1);
  });

  it('accepts raw int16 PCM (no WAV header) for the in-memory short-circuit', async () => {
    const samples = new Int16Array(1600);
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => stubEngine([' raw pcm']),
    });
    const raw = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

    const result = await svc.transcribe({ audio: raw });

    expect(result.text).toBe('raw pcm');
  });

  it('dispose() frees the engine and subsequent transcribe reloads it', async () => {
    const samples = new Int16Array(1600);
    let factoryCalls = 0;
    const svc = new LocalWhisperTranscriptionService({
      modelPath: '/unused',
      engineFactory: async () => {
        factoryCalls++;
        return stubEngine([' hi']);
      },
    });

    await svc.transcribe({ audio: makeWav(samples) });
    await svc.dispose();
    await svc.transcribe({ audio: makeWav(samples) });

    expect(factoryCalls).toBe(2);
  });
});
