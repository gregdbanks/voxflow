export interface WavEncodeOptions {
  sampleRate: number;
  bitsPerSample: 8 | 16 | 24 | 32;
  channels: number;
}

const DEFAULT_OPTIONS: WavEncodeOptions = {
  sampleRate: 16000,
  bitsPerSample: 16,
  channels: 1,
};

const RIFF = Buffer.from('RIFF', 'ascii');
const WAVE = Buffer.from('WAVE', 'ascii');
const FMT = Buffer.from('fmt ', 'ascii');
const DATA = Buffer.from('data', 'ascii');

export function encodeWav(pcm: Buffer, options: Partial<WavEncodeOptions> = {}): Buffer {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (opts.sampleRate <= 0) throw new Error(`Invalid sampleRate: ${opts.sampleRate}`);
  if (opts.channels <= 0) throw new Error(`Invalid channels: ${opts.channels}`);
  if (![8, 16, 24, 32].includes(opts.bitsPerSample)) {
    throw new Error(`Invalid bitsPerSample: ${opts.bitsPerSample}`);
  }

  const bytesPerSample = opts.bitsPerSample / 8;
  const blockAlign = opts.channels * bytesPerSample;
  if (pcm.length % blockAlign !== 0) {
    throw new Error(
      `PCM buffer length ${pcm.length} is not a multiple of blockAlign ${blockAlign}`,
    );
  }

  const byteRate = opts.sampleRate * blockAlign;
  const fmtChunkSize = 16;
  const dataChunkSize = pcm.length;
  const riffChunkSize = 4 + (8 + fmtChunkSize) + (8 + dataChunkSize);

  const header = Buffer.alloc(44);
  let o = 0;
  RIFF.copy(header, o); o += 4;
  header.writeUInt32LE(riffChunkSize, o); o += 4;
  WAVE.copy(header, o); o += 4;
  FMT.copy(header, o); o += 4;
  header.writeUInt32LE(fmtChunkSize, o); o += 4;
  header.writeUInt16LE(1, o); o += 2; // PCM format
  header.writeUInt16LE(opts.channels, o); o += 2;
  header.writeUInt32LE(opts.sampleRate, o); o += 4;
  header.writeUInt32LE(byteRate, o); o += 4;
  header.writeUInt16LE(blockAlign, o); o += 2;
  header.writeUInt16LE(opts.bitsPerSample, o); o += 2;
  DATA.copy(header, o); o += 4;
  header.writeUInt32LE(dataChunkSize, o);

  return Buffer.concat([header, pcm]);
}

export interface WavHeader extends WavEncodeOptions {
  dataSize: number;
  durationMs: number;
}

export function parseWav(wav: Buffer): WavHeader {
  if (wav.length < 44) throw new Error('WAV too short for header');
  if (wav.subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error('Missing RIFF');
  if (wav.subarray(8, 12).toString('ascii') !== 'WAVE') throw new Error('Missing WAVE');
  if (wav.subarray(12, 16).toString('ascii') !== 'fmt ') throw new Error('Missing fmt chunk');

  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34) as 8 | 16 | 24 | 32;

  // Walk chunks after fmt to find data (handles arbitrary fmt sizes).
  let cursor = 12;
  let dataSize = 0;
  while (cursor + 8 <= wav.length) {
    const id = wav.subarray(cursor, cursor + 4).toString('ascii');
    const size = wav.readUInt32LE(cursor + 4);
    if (id === 'data') {
      dataSize = size;
      break;
    }
    cursor += 8 + size;
  }

  const durationMs = Math.round((dataSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);

  return { sampleRate, bitsPerSample, channels, dataSize, durationMs };
}
