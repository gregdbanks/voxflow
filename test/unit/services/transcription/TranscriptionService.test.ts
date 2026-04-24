import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse } from 'msw';
import { server } from '../../../mocks/server.js';
import { setTranscriptionResponder, resetTranscriptionResponder } from '../../../mocks/handlers.js';
import {
  GroqTranscriptionService,
  TranscriptionError,
  collapseRepeats,
} from '../../../../src/services/transcription/TranscriptionService.js';

// The OpenAI SDK's telemetry inspects request URLs in a way that surfaces as
// `GET null` under MSW. We only care about the transcription endpoint, so
// bypass everything else silently.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  resetTranscriptionResponder();
});
afterAll(() => server.close());

const SAMPLE_WAV = Buffer.from('RIFF....WAVEfmt ', 'utf8');

describe('GroqTranscriptionService', () => {
  it('returns trimmed text on success', async () => {
    setTranscriptionResponder(() => ({ status: 200, body: { text: '  hello world  ' } }));
    const service = new GroqTranscriptionService({ apiKey: 'gsk_test' });
    const result = await service.transcribe({ audio: SAMPLE_WAV });
    expect(result.text).toBe('hello world');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sends the audio as a form upload with model and optional language', async () => {
    let captured: FormData | null = null;
    setTranscriptionResponder((body) => {
      captured = body;
      return HttpResponse.json({ text: 'ok' });
    });
    const service = new GroqTranscriptionService({ apiKey: 'gsk_test', model: 'whisper-v3-turbo' });
    await service.transcribe({ audio: SAMPLE_WAV, language: 'en' });
    expect(captured).not.toBeNull();
    expect(captured!.get('model')).toBe('whisper-v3-turbo');
    expect(captured!.get('language')).toBe('en');
    expect(captured!.get('file')).toBeInstanceOf(File);
  });

  it('maps 429 to a rate_limited error', async () => {
    setTranscriptionResponder(() => ({ status: 429, body: { error: { message: 'slow down' } } }));
    const service = new GroqTranscriptionService({ apiKey: 'gsk_test' });
    await expect(service.transcribe({ audio: SAMPLE_WAV })).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
    });
  });

  it('maps 401 to an auth error', async () => {
    setTranscriptionResponder(() => ({ status: 401, body: { error: { message: 'bad key' } } }));
    const service = new GroqTranscriptionService({ apiKey: 'gsk_test' });
    await expect(service.transcribe({ audio: SAMPLE_WAV })).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
  });

  it('maps 5xx to a server error', async () => {
    setTranscriptionResponder(() => ({ status: 503, body: { error: { message: 'upstream' } } }));
    const service = new GroqTranscriptionService({ apiKey: 'gsk_test' });
    await expect(service.transcribe({ audio: SAMPLE_WAV })).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('rejects when no apiKey is provided', () => {
    expect(() => new GroqTranscriptionService({ apiKey: '' })).toThrow(/apiKey/);
  });
});

describe('collapseRepeats', () => {
  it('collapses 3+ consecutive identical words (space-separated)', () => {
    expect(collapseRepeats('besides besides besides the point')).toBe('besides the point');
  });

  it('collapses comma-separated repetition', () => {
    expect(collapseRepeats('word, word, word, word next')).toBe('word next');
  });

  it('leaves two-word repetition alone (likely intentional)', () => {
    expect(collapseRepeats('yes yes I agree')).toBe('yes yes I agree');
  });

  it('does not cross different words', () => {
    expect(collapseRepeats('a a a b b b')).toBe('a b');
  });

  it('preserves punctuation outside the collapsed run', () => {
    expect(collapseRepeats('So, time time time passes. Then done.')).toBe(
      'So, time passes. Then done.',
    );
  });
});
