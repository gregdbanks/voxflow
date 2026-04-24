import { describe, it, expect, vi } from 'vitest';
import {
  DictationPipeline,
  NO_OP_TRANSCRIPTION_SENTINEL,
} from '../../../../src/services/pipeline/DictationPipeline.js';
import { AudioRecorder } from '../../../../src/services/audio/AudioRecorder.js';
import { TextInjector } from '../../../../src/services/injection/TextInjector.js';
import { Database } from '../../../../src/services/storage/Database.js';
import { DictionaryRepository } from '../../../../src/services/storage/DictionaryRepository.js';
import {
  StubActiveWindow,
  StubClipboard,
  StubKeystroke,
  StubMicrophone,
} from '../../../helpers/platform-stubs.js';
import type {
  ITranscriptionService,
  TranscriptionRequest,
  TranscriptionResult,
} from '../../../../src/platform/interfaces.js';
import { TranscriptionError } from '../../../../src/services/transcription/TranscriptionService.js';

class StubTranscription implements ITranscriptionService {
  public calls: TranscriptionRequest[] = [];
  constructor(
    private readonly fn: (req: TranscriptionRequest) => Promise<TranscriptionResult>,
  ) {}
  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    this.calls.push(request);
    return this.fn(request);
  }
}

function buildPipeline(transcriptionFn: (req: TranscriptionRequest) => Promise<TranscriptionResult>) {
  const pcm = Buffer.alloc(16000 * 2); // 1s silence
  const mic = new StubMicrophone({ fixture: pcm });
  const recorder = new AudioRecorder(mic);
  const transcription = new StubTranscription(transcriptionFn);
  const events: Array<{ state: string; text?: string; error?: string }> = [];
  const pipeline = new DictationPipeline({
    recorder,
    transcription,
    onEvent: (ev) => {
      events.push({ state: ev.state, text: ev.text, error: ev.error?.message });
    },
  });
  return { pipeline, mic, transcription, events };
}

describe('DictationPipeline', () => {
  it('walks idle → recording → transcribing → idle on success', async () => {
    const { pipeline, events, transcription } = buildPipeline(async () => ({
      text: 'hello world',
      durationMs: 5,
    }));

    expect(pipeline.getState()).toBe('idle');
    await pipeline.toggle();
    expect(pipeline.getState()).toBe('recording');
    const text = await pipeline.finish();
    expect(text).toBe('hello world');
    expect(pipeline.getState()).toBe('idle');
    expect(events.map((e) => e.state)).toEqual(['recording', 'transcribing', 'idle']);
    expect(events[2]!.text).toBe('hello world');
    expect(transcription.calls).toHaveLength(1);
  });

  it('toggle starts and stops via the same call', async () => {
    const { pipeline } = buildPipeline(async () => ({ text: 'ok', durationMs: 1 }));
    await pipeline.toggle();
    expect(pipeline.getState()).toBe('recording');
    await pipeline.toggle();
    expect(pipeline.getState()).toBe('idle');
  });

  it('lands in error on transcription failure', async () => {
    const { pipeline, events } = buildPipeline(async () => {
      throw new TranscriptionError('rate limited', 'rate_limited', 429);
    });
    await pipeline.toggle();
    await expect(pipeline.toggle()).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(pipeline.getState()).toBe('error');
    expect(events.at(-1)!.state).toBe('error');
  });

  it('can recover from an error and start a new recording', async () => {
    const fn = vi
      .fn<(req: TranscriptionRequest) => Promise<TranscriptionResult>>()
      .mockRejectedValueOnce(new TranscriptionError('boom', 'server', 503))
      .mockResolvedValue({ text: 'second try', durationMs: 1 });
    const { pipeline } = buildPipeline(fn);
    await pipeline.toggle();
    await expect(pipeline.toggle()).rejects.toBeInstanceOf(TranscriptionError);
    expect(pipeline.getState()).toBe('error');

    await pipeline.toggle();
    expect(pipeline.getState()).toBe('recording');
    const text = await pipeline.finish();
    expect(text).toBe('second try');
    expect(pipeline.getState()).toBe('idle');
  });

  it('injects text and records the active app when an injector is provided', async () => {
    const pcm = Buffer.alloc(16000 * 2);
    const mic = new StubMicrophone({ fixture: pcm });
    const recorder = new AudioRecorder(mic);
    const transcription: ITranscriptionService = {
      transcribe: async () => ({ text: 'hello there', durationMs: 1 }),
    };
    const clipboard = new StubClipboard('original');
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });
    const activeWindow = new StubActiveWindow({ appName: 'TextEdit', title: 'Untitled' });
    const events: Array<{ state: string; text?: string; app?: string }> = [];
    const pipeline = new DictationPipeline({
      recorder,
      transcription,
      injector,
      activeWindow,
      onEvent: (ev) => events.push({ state: ev.state, text: ev.text, app: ev.activeApp }),
    });

    await pipeline.toggle();
    expect(events[0]).toMatchObject({ state: 'recording', app: 'TextEdit' });

    await pipeline.finish();
    expect(events.map((e) => e.state)).toEqual(['recording', 'transcribing', 'injecting', 'idle']);
    expect(keystroke.pasteCalls).toBe(1);
    expect(clipboard.writes).toEqual(['hello there', 'original']);
    expect(events.at(-1)).toMatchObject({ state: 'idle', text: 'hello there', app: 'TextEdit' });
  });

  it('skips the injection step when the transcription is empty', async () => {
    const pcm = Buffer.alloc(16000 * 2);
    const mic = new StubMicrophone({ fixture: pcm });
    const recorder = new AudioRecorder(mic);
    const transcription: ITranscriptionService = {
      transcribe: async () => ({ text: '', durationMs: 1 }),
    };
    const clipboard = new StubClipboard('keep me');
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({
      clipboard,
      keystroke,
      pasteDelayMs: 0,
      restoreDelayMs: 0,
    });
    const events: string[] = [];
    const pipeline = new DictationPipeline({
      recorder,
      transcription,
      injector,
      onEvent: (ev) => events.push(ev.state),
    });
    await pipeline.toggle();
    await pipeline.finish();
    expect(events).toEqual(['recording', 'transcribing', 'idle']);
    expect(keystroke.pasteCalls).toBe(0);
    expect(clipboard.writes).toEqual([]);
  });

  it('applies the personal dictionary to the transcription before injection', async () => {
    const pcm = Buffer.alloc(16000 * 2);
    const mic = new StubMicrophone({ fixture: pcm });
    const recorder = new AudioRecorder(mic);
    const transcription: ITranscriptionService = {
      transcribe: async () => ({ text: 'the voxflow api works great', durationMs: 1 }),
    };
    const clipboard = new StubClipboard('');
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({ clipboard, keystroke, pasteDelayMs: 0, restoreDelayMs: 0 });
    const db = new Database({ filename: ':memory:' });
    db.migrate();
    const dictionary = new DictionaryRepository(db);
    dictionary.add('voxflow', 'VoxFlow', false);
    dictionary.add('api', 'API', false);

    const pipeline = new DictationPipeline({
      recorder,
      transcription,
      injector,
      dictionary,
    });
    await pipeline.toggle();
    const text = await pipeline.finish();
    expect(text).toBe('the VoxFlow API works great');
    expect(clipboard.writes[0]).toBe('the VoxFlow API works great');
    db.close();
  });

  it('lands in error and skips injection when transcription returns the no-op sentinel', async () => {
    const pcm = Buffer.alloc(16000 * 2);
    const mic = new StubMicrophone({ fixture: pcm });
    const recorder = new AudioRecorder(mic);
    const transcription: ITranscriptionService = {
      transcribe: async () => ({ text: NO_OP_TRANSCRIPTION_SENTINEL, durationMs: 0 }),
    };
    const clipboard = new StubClipboard('original');
    const keystroke = new StubKeystroke();
    const injector = new TextInjector({ clipboard, keystroke, pasteDelayMs: 0, restoreDelayMs: 0 });
    const events: Array<{ state: string; error?: string }> = [];
    const pipeline = new DictationPipeline({
      recorder,
      transcription,
      injector,
      onEvent: (ev) => events.push({ state: ev.state, error: ev.error?.message }),
    });
    await pipeline.toggle();
    const result = await pipeline.finish();
    expect(result).toBe('');
    expect(events.at(-1)!.state).toBe('error');
    expect(events.at(-1)!.error).toMatch(/Transcription is not configured/);
    expect(keystroke.pasteCalls).toBe(0);
    expect(clipboard.writes).toEqual([]);
  });

  it('ignores repeat toggles while transcribing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { pipeline } = buildPipeline(async () => {
      await gate;
      return { text: 'done', durationMs: 1 };
    });
    await pipeline.toggle(); // start
    const finishPromise = pipeline.toggle(); // stop → transcribing
    // Eagerly resolve any queued microtasks so the state can flip to transcribing.
    await Promise.resolve();
    await Promise.resolve();
    expect(pipeline.getState()).toBe('transcribing');
    await pipeline.toggle(); // should be ignored
    release();
    await finishPromise;
    expect(pipeline.getState()).toBe('idle');
  });
});
