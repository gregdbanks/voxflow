import type { IActiveWindow, ITranscriptionService } from '../../platform/interfaces.js';
import { AudioRecorder, type RecordingResult } from '../audio/AudioRecorder.js';
import { TranscriptionError } from '../transcription/TranscriptionService.js';
import type { TextInjector } from '../injection/TextInjector.js';

export type PipelineState = 'idle' | 'recording' | 'transcribing' | 'injecting' | 'error';

export interface PipelineEvent {
  state: PipelineState;
  error?: TranscriptionError | Error;
  text?: string;
  activeApp?: string;
}

export interface DictationPipelineOptions {
  recorder: AudioRecorder;
  transcription: ITranscriptionService;
  /** Optional — when present, the transcription is pasted at the active cursor. */
  injector?: TextInjector;
  /** Optional — used to stamp each event with the focused app at record time. */
  activeWindow?: IActiveWindow;
  onEvent?: (event: PipelineEvent) => void;
  language?: string;
}

export class DictationPipeline {
  private readonly recorder: AudioRecorder;
  private readonly transcription: ITranscriptionService;
  private readonly injector: TextInjector | undefined;
  private readonly activeWindow: IActiveWindow | undefined;
  private readonly onEvent: (event: PipelineEvent) => void;
  private readonly language: string | undefined;
  private state: PipelineState = 'idle';
  private focusedApp: string | undefined;

  constructor(opts: DictationPipelineOptions) {
    this.recorder = opts.recorder;
    this.transcription = opts.transcription;
    this.injector = opts.injector;
    this.activeWindow = opts.activeWindow;
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
    // transcribing / injecting: ignore repeat presses
  }

  async begin(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') {
      throw new Error(`Cannot begin pipeline in state ${this.state}`);
    }
    // Capture the focused app BEFORE we start recording — once the hotkey
    // fires and our main process becomes frontmost, focus is no longer the
    // target app.
    this.focusedApp = await this.captureFocusedApp();
    await this.recorder.start();
    this.setState('recording', { activeApp: this.focusedApp });
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

    this.setState('transcribing', { activeApp: this.focusedApp });
    let text: string;
    try {
      const result = await this.transcription.transcribe({
        audio: recording.wav,
        language: this.language,
      });
      text = result.text;
    } catch (err) {
      this.setState('error', { error: err as Error });
      throw err;
    }

    if (this.injector && text.length > 0) {
      this.setState('injecting', { text, activeApp: this.focusedApp });
      try {
        await this.injector.inject(text);
      } catch (err) {
        this.setState('error', { error: err as Error, text, activeApp: this.focusedApp });
        throw err;
      }
    }

    this.setState('idle', { text, activeApp: this.focusedApp });
    return text;
  }

  private async captureFocusedApp(): Promise<string | undefined> {
    if (!this.activeWindow) return undefined;
    try {
      const info = await this.activeWindow.getActive();
      return info?.appName;
    } catch {
      return undefined;
    }
  }

  private setState(state: PipelineState, extra: Omit<PipelineEvent, 'state'> = {}): void {
    this.state = state;
    this.onEvent({ state, ...extra });
  }
}
