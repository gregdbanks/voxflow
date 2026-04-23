import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GroqTranscriptionService } from '../../src/services/transcription/TranscriptionService.js';

const apiKey = process.env.GROQ_API_KEY;
const enabled = Boolean(apiKey);

describe.skipIf(!enabled)('Groq transcription integration', () => {
  it('transcribes the silence fixture without error', async () => {
    const audio = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'audio', 'silence.wav'));
    const service = new GroqTranscriptionService({ apiKey: apiKey! });
    const result = await service.transcribe({ audio });
    // Silence transcribes to either empty or a short plausible placeholder.
    expect(typeof result.text).toBe('string');
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30_000);
});
