import type { ITranscriptionService } from '../../platform/interfaces.js';
import { AudioRecorder, type RecordingResult } from '../audio/AudioRecorder.js';
import { TranscriptionError } from '../transcription/TranscriptionService.js';

export type PipelineState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface PipelineEvent {
  state: PipelineState;
  error?: TranscriptionError | Error;
  text?: string;
}

export interface DictationPipelineOptions {
  recorder: AudioRecorder;
  transcription: ITranscriptionService;
  onEvent?: (event: PipelineEvent) => void;
  language?: string;
}

export class DictationPipeline {
  private readonly recorder: AudioRecorder;
  private readonly transcription: ITranscriptionService;
  private readonly onEvent: (event: PipelineEvent) => void;
  private readonly language: string | undefined;
  private state: PipelineState = 'idle';

  constructor(opts: DictationPipelineOptions) {
    this.recorder = opts.recorder;
    this.transcription = opts.transcription;
    this.onEvent = opts.onEvent ?? (() => undefined);
    this.language = opts.language;
  }

  getState(): PipelineState {
    return this.state;
  }

  async toggle(): Promise<void> {
    if (this.state === 'idle' || this.state === 'error') {
      await this.begin();
      return;
    }
    if (this.state === 'recording') {
      await this.finish();
      return;
    }
    // transcribing: ignore repeat presses
  }

  async begin(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') {
      throw new Error(`Cannot begin pipeline in state ${this.state}`);
    }
    await this.recorder.start();
    this.setState('recording');
  }

  async finish(): Promise<string> {
    if (this.state !== 'recording') {
      throw new Error(`Cannot finish pipeline in state ${this.state}`);
    }
    let recording: RecordingResult;
    try {
      recording = await this.recorder.stop();
    } catch (err) {
      this.setState('error', { error: err as Error });
      throw err;
    }

    this.setState('transcribing');
    try {
      const result = await this.transcription.transcribe({
        audio: recording.wav,
        language: this.language,
      });
      this.setState('idle', { text: result.text });
      return result.text;
    } catch (err) {
      this.setState('error', { error: err as Error });
      throw err;
    }
  }

  private setState(state: PipelineState, extra: Omit<PipelineEvent, 'state'> = {}): void {
    this.state = state;
    this.onEvent({ state, ...extra });
  }
}
