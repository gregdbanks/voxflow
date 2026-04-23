import type { IMicrophone } from './interfaces.js';

export interface MacMicrophoneOptions {
  sampleRate?: number;
  channels?: number;
  debug?: boolean;
}

/**
 * Uses the `node-mic` package (which shells out to `sox`) to record a raw PCM
 * stream from the system default input device.
 *
 * Requires `brew install sox`.
 */
export class MacMicrophone implements IMicrophone {
  private readonly options: Required<MacMicrophoneOptions>;
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
    this.onData = (chunk: Buffer) => this.chunks.push(Buffer.from(chunk));
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
