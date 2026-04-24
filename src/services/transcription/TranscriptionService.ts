import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import type {
  ITranscriptionService,
  TranscriptionRequest,
  TranscriptionResult,
} from '../../platform/interfaces.js';

export interface GroqTranscriptionOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = 'whisper-large-v3';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'network'
      | 'rate_limited'
      | 'auth'
      | 'server'
      | 'timeout'
      | 'unknown',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export class GroqTranscriptionService implements ITranscriptionService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: GroqTranscriptionOptions) {
    if (!options.apiKey) throw new Error('GroqTranscriptionService requires an apiKey');
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      maxRetries: 0,
    });
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const startedAt = Date.now();
    try {
      const file = await toFile(request.audio, 'audio.wav', { type: 'audio/wav' });
      const response = await this.client.audio.transcriptions.create(
        {
          file,
          model: this.model,
          language: request.language,
          response_format: 'json',
          // temperature=0 makes Whisper deterministic — reduces the classic
          // "besides besides besides" stutter on audio with hesitations.
          temperature: 0,
        },
        { timeout: this.timeoutMs },
      );
      const text = typeof response === 'string' ? response : response.text;
      return {
        text: collapseRepeats(text.trim()),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      throw toTranscriptionError(err);
    }
  }
}

// Collapse 3+ immediate repetitions of the same token to a single occurrence.
// Targets Whisper's "word word word" and "word, word, word" stutter without
// clobbering intentional two-word repetitions like "yes yes".
export function collapseRepeats(text: string): string {
  return text.replace(/\b(\w+)(?:[\s,]+\1\b){2,}/gi, '$1');
}

function toTranscriptionError(err: unknown): TranscriptionError {
  if (err instanceof TranscriptionError) return err;
  const maybe = err as { status?: number; code?: string; message?: string; name?: string };
  const message = maybe.message ?? 'Transcription failed';
  if (maybe.status === 429) return new TranscriptionError(message, 'rate_limited', 429);
  if (maybe.status === 401 || maybe.status === 403) return new TranscriptionError(message, 'auth', maybe.status);
  if (typeof maybe.status === 'number' && maybe.status >= 500) {
    return new TranscriptionError(message, 'server', maybe.status);
  }
  if (maybe.name === 'APIConnectionTimeoutError' || maybe.code === 'ETIMEDOUT') {
    return new TranscriptionError(message, 'timeout');
  }
  if (maybe.name === 'APIConnectionError' || maybe.code === 'ENOTFOUND' || maybe.code === 'ECONNREFUSED') {
    return new TranscriptionError(message, 'network');
  }
  return new TranscriptionError(message, 'unknown', maybe.status);
}
