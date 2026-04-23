import { describe, it, expect, vi } from 'vitest';
import { DictationPipeline } from '../../../../src/services/pipeline/DictationPipeline.js';
import { AudioRecorder } from '../../../../src/services/audio/AudioRecorder.js';
import { StubMicrophone } from '../../../helpers/platform-stubs.js';
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
