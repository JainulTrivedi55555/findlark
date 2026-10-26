import 'server-only';
import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, briefMessage } from '@/lib/search/prompt';
import { ModelOutput, fromModelOutput, type RawFilters } from '@/lib/search/normalize';

// The one place the model is chosen. The key comes from ANTHROPIC_API_KEY.
export const MODEL = 'claude-sonnet-5-5';

export const MAX_BRIEF_LENGTH = 500;

export type LlmUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type ExtractResult = {
  /** null when the model declined the brief (safety refusal). */
  raw: RawFilters | null;
  refused: boolean;
  usage: LlmUsage;
  latencyMs: number;
  model: string;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Key comes from ANTHROPIC_API_KEY in the environment only (the SDK reads it).
  // 5 s per attempt and two retries: a normal call takes ~1.5 s, so a 5 s attempt
  // is already an outlier, and the retries still fit well inside a user's patience.
  client ??= new Anthropic({ timeout: 5_000, maxRetries: 2 });
  return client;
}

/**
 * Thinking off, for speed: this is a short extraction, not a reasoning task.
 * Each model spells "off" differently, and sampling params like temperature 0
 * are rejected (400) on these models, so determinism comes from the schema
 * plus the vocabulary check afterwards.
 */
function thinkingOff(model: string): Anthropic.Messages.ThinkingConfigParam | undefined {
  if (model.startsWith('claude-sonnet-5-5')) return { type: 'between_tools' };
  if (model.startsWith('claude-haiku-5-5')) return { type: 'disabled' };
  return undefined;
}

/** One model call: brief in, raw (unvalidated against the vocabulary) filters out. */
export async function extractFilters(brief: string, model: string = MODEL): Promise<ExtractResult> {
  if (brief.length > MAX_BRIEF_LENGTH) {
    throw new Error(`brief longer than ${MAX_BRIEF_LENGTH} characters`);
  }

  const started = performance.now();
  const response = await getClient().messages.create({
    model,
    max_tokens: 1024,
    thinking: thinkingOff(model),
    // Structured output instead of a forced tool: forced tool_choice is a 400 on
    // claude-sonnet-5-5, and structured output guarantees schema-valid JSON.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    // Static prompt (vocabulary + rules) cached for 1 hour; the brief is not in it.
    // 1h instead of the default 5 min: searches are bursty with long idle gaps,
    // and a cache miss adds latency to the user's first search.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: briefMessage(brief) }],
  });
  const latencyMs = performance.now() - started;

  const usage: LlmUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  if (response.stop_reason === 'refusal') {
    return { raw: null, refused: true, usage, latencyMs, model };
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('model output was cut off (max_tokens)');
  }

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('model returned no text block');

  // Structured output should always be valid JSON in this shape; check anyway.
  const raw = fromModelOutput(ModelOutput.parse(JSON.parse(text.text)));
  return { raw, refused: false, usage, latencyMs, model };
}

/**
 * Safe fields for logging a failed model call: error class, HTTP status and the
 * API's request id (to trace it with Anthropic). Never the message, which can
 * echo request content, and never the key or the brief.
 * A timeout or network failure has no response, so no status or request id.
 */
export function llmErrorDetails(err: unknown): { name: string; status: string; requestId: string } {
  const name = err instanceof Error ? err.constructor.name : 'unknown';
  if (err instanceof APIError) {
    return { name, status: String(err.status ?? 'none'), requestId: err.requestID ?? 'none' };
  }
  return { name, status: 'none', requestId: 'none' };
}

/**
 * One small real call at server start (see instrumentation.ts) so the first
 * user search finds the prompt cache and the compiled output schema warm.
 * A real call, not max_tokens: 0, because max_tokens: 0 is rejected together
 * with structured output. Never throws.
 */
export async function warmUp(): Promise<void> {
  try {
    const result = await extractFilters('backend engineers in Boston');
    console.log(`llm warm-up done in ${Math.round(result.latencyMs)} ms`);
  } catch {
    console.log('llm warm-up skipped (model call failed)');
  }
}
