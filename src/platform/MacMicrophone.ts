import type { IMicrophone } from './interfaces.js';

export interface MacMicrophoneOptions {
  sampleRate?: number;
  channels?: number;
  debug?: boolean;
  /** Called with an RMS amplitude in [0,1] for each captured PCM chunk. */
  onLevel?: (level: number) => void;
}

/**
 * Uses the `node-mic` package (which shells out to `sox`) to record a raw PCM
 * stream from the system default input device.
 *
 * Requires `brew install sox`.
 */
export class MacMicrophone implements IMicrophone {
  private readonly options: Required<Omit<MacMicrophoneOptions, 'onLevel'>>;
  private levelListener: ((level: number) => void) | undefined;
  private mic: { start(): void; stop(): void; getAudioStream(): NodeJS.ReadableStream } | null =
    null;
  private chunks: Buffer[] = [];
  private recording = false;
  private onData: ((chunk: Buffer) => void) | null = null;

  constructor(options: MacMicrophoneOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate ?? 16000,
      channels: options.channels ?? 1,
      debug: options.debug ?? false,
    };
    this.levelListener = options.onLevel;
  }

  setLevelListener(listener: ((level: number) => void) | undefined): void {
    this.levelListener = listener;
  }

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    if (this.recording) throw new Error('MacMicrophone already recording');
    // Dynamic import so unit tests that mock IMicrophone don't require sox.
    const mod: { default?: unknown } = await import('node-mic');
    const Ctor = (mod.default ?? mod) as new (opts: Record<string, unknown>) => {
      start(): void;
      stop(): void;
      getAudioStream(): NodeJS.ReadableStream;
    };
    this.mic = new Ctor({
      rate: String(this.options.sampleRate),
      channels: String(this.options.channels),
      debug: this.options.debug,
      fileType: 'raw',
      encoding: 'signed-integer',
      bitwidth: '16',
    });
    this.chunks = [];
    const stream = this.mic.getAudioStream();
    this.onData = (chunk: Buffer) => {
      this.chunks.push(Buffer.from(chunk));
      if (this.levelListener) {
        // Compute RMS over int16 little-endian samples. Normalised to [0,1]
        // by dividing by 32768. The listener broadcasts this to the pill
        // window for the waveform bars.
        let sumSquares = 0;
        const n = chunk.length / 2;
        for (let i = 0; i + 1 < chunk.length; i += 2) {
          const sample = chunk.readInt16LE(i);
          sumSquares += sample * sample;
        }
        const rms = n > 0 ? Math.sqrt(sumSquares / n) / 32768 : 0;
        this.levelListener(Math.min(1, rms));
      }
    };
    stream.on('data', this.onData);
    this.recording = true;
    this.mic.start();
  }

  async stop(): Promise<Buffer> {
    if (!this.recording || !this.mic) throw new Error('MacMicrophone not recording');
    this.mic.stop();
    const stream = this.mic.getAudioStream();
    if (this.onData) stream.off('data', this.onData);
    this.recording = false;
    this.mic = null;
    this.onData = null;
    const combined = Buffer.concat(this.chunks);
    this.chunks = [];
    return combined;
  }
}
