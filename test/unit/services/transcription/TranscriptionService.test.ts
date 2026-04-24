import { describe, it, expect } from 'vitest';
import {
  TranscriptionError,
  collapseRepeats,
} from '../../../../src/services/transcription/TranscriptionService.js';

describe('TranscriptionError', () => {
  it('captures kind and optional status', () => {
    const err = new TranscriptionError('rate limited', 'rate_limited', 429);
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe('rate_limited');
    expect(err.status).toBe(429);
    expect(err.name).toBe('TranscriptionError');
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
