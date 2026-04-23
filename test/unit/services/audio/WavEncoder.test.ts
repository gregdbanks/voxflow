import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { encodeWav, parseWav } from '../../../../src/services/audio/WavEncoder.js';

const FIXTURE_DIR = path.resolve(__dirname, '..', '..', '..', 'fixtures', 'audio');

describe('encodeWav', () => {
  it('produces a RIFF/WAVE header with the expected fmt values', () => {
    const pcm = Buffer.alloc(16000 * 2); // 1 second of silence, 16-bit mono
    const wav = encodeWav(pcm);
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.subarray(12, 16).toString('ascii')).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it('round-trips through parseWav with the correct duration', () => {
    const pcm = Buffer.alloc(8000 * 2); // 0.5 s silence
    const wav = encodeWav(pcm);
    const header = parseWav(wav);
    expect(header.sampleRate).toBe(16000);
    expect(header.channels).toBe(1);
    expect(header.bitsPerSample).toBe(16);
    expect(header.dataSize).toBe(pcm.length);
    expect(header.durationMs).toBe(500);
  });

  it('rejects PCM not aligned to block size', () => {
    expect(() => encodeWav(Buffer.alloc(3), { bitsPerSample: 16, channels: 1 })).toThrow(/blockAlign/);
  });

  it('parses checked-in fixtures correctly', () => {
    const silence = fs.readFileSync(path.join(FIXTURE_DIR, 'silence.wav'));
    const sil = parseWav(silence);
    expect(sil.sampleRate).toBe(16000);
    expect(sil.channels).toBe(1);
    expect(sil.durationMs).toBe(1000);

    const hello = fs.readFileSync(path.join(FIXTURE_DIR, 'hello-world.wav'));
    const he = parseWav(hello);
    expect(he.durationMs).toBe(1000);
  });

  it('supports stereo 32-bit by adjusting blockAlign', () => {
    const pcm = Buffer.alloc(100 * 2 * 4); // 100 samples, 2 ch, 4 bytes
    const wav = encodeWav(pcm, { channels: 2, bitsPerSample: 32 });
    const header = parseWav(wav);
    expect(header.channels).toBe(2);
    expect(header.bitsPerSample).toBe(32);
  });
});
