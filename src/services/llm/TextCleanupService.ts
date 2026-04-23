import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { distance as levenshteinDistance } from 'fastest-levenshtein';
import type { CleanupRequest, ICleanupService } from '../../platform/interfaces.js';
import { buildPrompt, detectContext, type PromptContext } from './PromptBuilder.js';

export interface BedrockCleanupOptions {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  modelId?: string;
  /** Max tokens to request from Claude Haiku. */
  maxTokens?: number;
  /** Max ms before we abort and return the raw text. */
  timeoutMs?: number;
  /** Abort the cleanup if it diverges from the original by more than this ratio (0..1). */
  maxDivergence?: number;
  /** Override the HTTP client (tests). */
  client?: BedrockRuntimeClient;
}

const DEFAULT_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_MAX_DIVERGENCE = 0.6;

export class CleanupError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'CleanupError';
  }
}

export interface CleanupResult {
  text: string;
  context: PromptContext;
  inputTokens: number;
  outputTokens: number;
  usedFallback: boolean;
  fallbackReason?: string;
}

/**
 * Cleans a raw transcription with Claude Haiku on Bedrock. Designed to be
 * cheap ( <$0.001 / request at typical transcription lengths) and safe: if
 * the response is missing, malformed, or diverges too far from the input, the
 * service returns the original text so dictation isn't blocked by LLM flakiness.
 */
export class TextCleanupService implements ICleanupService {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly maxDivergence: number;

  constructor(options: BedrockCleanupOptions) {
    this.client =
      options.client ??
      new BedrockRuntimeClient({
        region: options.region,
        credentials:
          options.accessKeyId && options.secretAccessKey
            ? {
                accessKeyId: options.accessKeyId,
                secretAccessKey: options.secretAccessKey,
                sessionToken: options.sessionToken,
              }
            : undefined,
      });
    this.modelId = options.modelId ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxDivergence = options.maxDivergence ?? DEFAULT_MAX_DIVERGENCE;
  }

  async cleanDetailed(request: CleanupRequest): Promise<CleanupResult> {
    const prompt = buildPrompt({ text: request.text, activeApp: request.activeApp });

    if (request.text.trim().length === 0) {
      return { text: request.text, context: prompt.context, inputTokens: 0, outputTokens: 0, usedFallback: true, fallbackReason: 'empty input' };
    }

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      body: new TextEncoder().encode(
        JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: this.maxTokens,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          temperature: 0,
        }),
      ),
      contentType: 'application/json',
      accept: 'application/json',
    });

    let response: InvokeModelCommandOutput;
    try {
      response = (await this.client.send(command, {
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      })) as InvokeModelCommandOutput;
    } catch (err) {
      throw new CleanupError(`Bedrock invoke failed: ${(err as Error).message}`, err);
    }

    if (!response.body) throw new CleanupError('Bedrock returned an empty body');
    const decoded = new TextDecoder().decode(response.body);
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch (err) {
      throw new CleanupError('Bedrock returned non-JSON body', err);
    }

    const content = extractText(parsed);
    if (!content) {
      return {
        text: request.text,
        context: prompt.context,
        inputTokens: extractUsage(parsed).input,
        outputTokens: extractUsage(parsed).output,
        usedFallback: true,
        fallbackReason: 'no text in response',
      };
    }

    if (divergesTooFar(request.text, content, this.maxDivergence)) {
      return {
        text: request.text,
        context: prompt.context,
        inputTokens: extractUsage(parsed).input,
        outputTokens: extractUsage(parsed).output,
        usedFallback: true,
        fallbackReason: 'diverged from input',
      };
    }

    const usage = extractUsage(parsed);
    return {
      text: content,
      context: prompt.context,
      inputTokens: usage.input,
      outputTokens: usage.output,
      usedFallback: false,
    };
  }

  async clean(request: CleanupRequest): Promise<string> {
    const result = await this.cleanDetailed(request);
    return result.text;
  }
}

interface AnthropicChunk {
  type: string;
  text?: string;
}

function extractText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const content = (response as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const chunk of content as AnthropicChunk[]) {
    if (chunk?.type === 'text' && typeof chunk.text === 'string') {
      parts.push(chunk.text);
    }
  }
  const text = parts.join('').trim();
  return text.length > 0 ? text : null;
}

function extractUsage(response: unknown): { input: number; output: number } {
  if (!response || typeof response !== 'object') return { input: 0, output: 0 };
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
  };
}

function divergesTooFar(original: string, cleaned: string, threshold: number): boolean {
  if (original.length === 0) return false;
  const d = levenshteinDistance(original.toLowerCase(), cleaned.toLowerCase());
  return d / Math.max(original.length, cleaned.length) > threshold;
}

export { detectContext };
