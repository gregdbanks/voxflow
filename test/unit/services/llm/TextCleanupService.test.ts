import { describe, it, expect } from 'vitest';
import {
  TextCleanupService,
  CleanupError,
} from '../../../../src/services/llm/TextCleanupService.js';

class FakeBedrockClient {
  public lastBody: Record<string, unknown> | null = null;
  public nextResponse: unknown = {
    content: [{ type: 'text', text: 'Cleaned text.' }],
    usage: { input_tokens: 30, output_tokens: 5 },
  };
  public nextError: Error | null = null;

  async send(command: { input: { body?: Uint8Array } }): Promise<unknown> {
    if (this.nextError) throw this.nextError;
    const raw = command.input.body;
    if (raw) {
      this.lastBody = JSON.parse(new TextDecoder().decode(raw));
    }
    const encoder = new TextEncoder();
    return {
      body: encoder.encode(JSON.stringify(this.nextResponse)),
      contentType: 'application/json',
    };
  }
}

function makeService(fake: FakeBedrockClient): TextCleanupService {
  return new TextCleanupService({
    region: 'us-east-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: fake as any,
    maxDivergence: 0.8,
  });
}

describe('TextCleanupService', () => {
  it('calls Bedrock and returns the cleaned text for a chat context', async () => {
    const fake = new FakeBedrockClient();
    const service = makeService(fake);
    const result = await service.cleanDetailed({
      text: 'um hey can you like send me the link',
      activeApp: 'Slack',
    });
    expect(result.text).toBe('Cleaned text.');
    expect(result.context).toBe('chat');
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(5);
    expect(result.usedFallback).toBe(false);
    expect(fake.lastBody).not.toBeNull();
    expect(fake.lastBody!.system).toMatch(/contractions/);
    expect(fake.lastBody!.temperature).toBe(0);
  });

  it('returns the original text when Bedrock response has no content', async () => {
    const fake = new FakeBedrockClient();
    fake.nextResponse = { content: [], usage: { input_tokens: 10, output_tokens: 0 } };
    const service = makeService(fake);
    const result = await service.cleanDetailed({
      text: 'the original thing',
      activeApp: 'Mail',
    });
    expect(result.text).toBe('the original thing');
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toMatch(/no text/);
  });

  it('returns the original text when the cleaned text diverges too far', async () => {
    const fake = new FakeBedrockClient();
    fake.nextResponse = {
      content: [{ type: 'text', text: 'this is an entirely different sentence nothing like the original at all' }],
      usage: { input_tokens: 5, output_tokens: 20 },
    };
    const service = new TextCleanupService({
      region: 'us-east-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: fake as any,
      maxDivergence: 0.3,
    });
    const result = await service.cleanDetailed({ text: 'hi there', activeApp: 'Messages' });
    expect(result.text).toBe('hi there');
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toMatch(/diverged/);
  });

  it('throws CleanupError when Bedrock send fails', async () => {
    const fake = new FakeBedrockClient();
    fake.nextError = new Error('access denied');
    const service = makeService(fake);
    await expect(
      service.cleanDetailed({ text: 'hello', activeApp: 'Slack' }),
    ).rejects.toBeInstanceOf(CleanupError);
  });

  it('short-circuits on empty input', async () => {
    const fake = new FakeBedrockClient();
    const service = makeService(fake);
    const result = await service.cleanDetailed({ text: '   ', activeApp: 'Mail' });
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toMatch(/empty/);
    expect(fake.lastBody).toBeNull();
  });

  it('clean() returns a bare string for ICleanupService conformance', async () => {
    const fake = new FakeBedrockClient();
    fake.nextResponse = {
      content: [{ type: 'text', text: 'Hello, world.' }],
      usage: { input_tokens: 10, output_tokens: 4 },
    };
    const service = makeService(fake);
    const text = await service.clean({ text: 'um hello world', activeApp: 'Code' });
    expect(typeof text).toBe('string');
    expect(text).toBe('Hello, world.');
  });
});
