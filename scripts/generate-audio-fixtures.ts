/**
 * Generates synthetic WAV fixtures used by audio pipeline tests.
 *
 * Run: `npx tsx scripts/generate-audio-fixtures.ts`
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodeWav } from '../src/services/audio/WavEncoder.js';

const SAMPLE_RATE = 16000;
const DURATION_SECONDS = 1;
const OUT_DIR = path.resolve(__dirname, '..', 'test', 'fixtures', 'audio');

function pcmSilence(samples: number): Buffer {
  return Buffer.alloc(samples * 2);
}

function pcmSine(samples: number, hz: number, amplitude = 0.25): Buffer {
  const buf = Buffer.alloc(samples * 2);
  const twoPi = Math.PI * 2;
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((twoPi * hz * i) / SAMPLE_RATE) * amplitude;
    buf.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return buf;
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const samples = SAMPLE_RATE * DURATION_SECONDS;

  const silenceWav = encodeWav(pcmSilence(samples));
  fs.writeFileSync(path.join(OUT_DIR, 'silence.wav'), silenceWav);

  const helloWav = encodeWav(pcmSine(samples, 440));
  fs.writeFileSync(path.join(OUT_DIR, 'hello-world.wav'), helloWav);

  console.log(`Wrote ${OUT_DIR}/silence.wav (${silenceWav.length}B)`);
  console.log(`Wrote ${OUT_DIR}/hello-world.wav (${helloWav.length}B)`);
}

main();
