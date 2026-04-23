import { describe, it, expect } from 'vitest';
import { TextCleanupService } from '../../src/services/llm/TextCleanupService.js';

const enabled = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

describe.skipIf(!enabled)('TextCleanupService — real Bedrock (gated on AWS creds)', () => {
  it('cleans a filler-heavy sentence and returns something shorter', async () => {
    const service = new TextCleanupService({
      region: process.env.AWS_REGION ?? 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    });
    const result = await service.cleanDetailed({
      text: 'um so I was thinking like we should probably ship the feature tomorrow you know',
      activeApp: 'Slack',
    });
    expect(result.usedFallback).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text.length).toBeLessThan('um so I was thinking like we should probably ship the feature tomorrow you know'.length);
    // Cost check: with ~30 input + ~30 output tokens on Haiku @ ~$0.00025/1K input, ~$0.00125/1K output,
    // we should be well under $0.001 per request.
    expect(result.inputTokens + result.outputTokens).toBeLessThan(300);
  }, 30_000);
});
