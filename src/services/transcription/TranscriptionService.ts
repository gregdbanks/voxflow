// Shared transcription error type + the output-scrubbing utility.
// The concrete transcription implementation lives in
// LocalWhisperTranscriptionService (on-device whisper.cpp). VoxFlow no
// longer ships a cloud transcription provider.

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

// Collapse 3+ immediate repetitions of the same token to a single occurrence.
// Targets Whisper's "word word word" and "word, word, word" stutter without
// clobbering intentional two-word repetitions like "yes yes".
export function collapseRepeats(text: string): string {
  return text.replace(/\b(\w+)(?:[\s,]+\1\b){2,}/gi, '$1');
}
