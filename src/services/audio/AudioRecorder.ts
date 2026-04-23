import type { IMicrophone } from '../../platform/interfaces.js';
import { encodeWav, type WavEncodeOptions } from './WavEncoder.js';

export interface AudioRecorderOptions {
  sampleRate: number;
  bitsPerSample: 16;
  channels: 1;
  now?: () => number;
}

export interface RecordingResult {
  pcm: Buffer;
  wav: Buffer;
  durationMs: number;
  sampleRate: number;
}

const DEFAULTS: AudioRecorderOptions = {
  sampleRate: 16000,
  bitsPerSample: 16,
  channels: 1,
};

export class AudioRecorder {
  private readonly mic: IMicrophone;
  private readonly opts: AudioRecorderOptions;
  private startedAt: number | null = null;

  constructor(mic: IMicrophone, options: Partial<AudioRecorderOptions> = {}) {
    this.mic = mic;
    this.opts = { ...DEFAULTS, ...options };
  }

  isRecording(): boolean {
    return this.mic.isRecording();
  }

  async start(): Promise<void> {
    if (this.isRecording()) {
      throw new Error('AudioRecorder.start called while already recording');
    }
    this.startedAt = this.now();
    await this.mic.start();
  }

  async stop(): Promise<RecordingResult> {
    if (!this.isRecording()) {
      throw new Error('AudioRecorder.stop called while not recording');
    }
    const stoppedAt = this.now();
    const pcm = await this.mic.stop();
    const startedAt = this.startedAt ?? stoppedAt;
    this.startedAt = null;

    const wavOpts: WavEncodeOptions = {
      sampleRate: this.opts.sampleRate,
      bitsPerSample: this.opts.bitsPerSample,
      channels: this.opts.channels,
    };
    const wav = encodeWav(pcm, wavOpts);
    const pcmDurationMs = this.pcmDurationMs(pcm.length);
    const wallDurationMs = Math.max(0, stoppedAt - startedAt);

    return {
      pcm,
      wav,
      sampleRate: this.opts.sampleRate,
      durationMs: pcm.length > 0 ? pcmDurationMs : wallDurationMs,
    };
  }

  private pcmDurationMs(bytes: number): number {
    const bytesPerSample = this.opts.bitsPerSample / 8;
    const totalSamples = bytes / (bytesPerSample * this.opts.channels);
    return Math.round((totalSamples / this.opts.sampleRate) * 1000);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }
}
