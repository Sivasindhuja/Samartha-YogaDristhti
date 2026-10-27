import axios from 'axios';
import { config } from '../config/env';

export type GeminiPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GeminiPart[];
}

export interface GeminiResult {
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class GeminiUnavailableError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiUnavailableError';
    this.status = status;
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(config.geminiApiKey);
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    return data?.error?.message || data?.message || err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

interface CallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

async function callModel(
  model: string,
  messages: GeminiMessage[],
  opts: CallOptions
): Promise<GeminiResult> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const resp = await axios.post(`${config.geminiBaseUrl}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${config.geminiApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: opts.timeoutMs ?? 45000,
  });

  const content = resp.data?.choices?.[0]?.message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part: any) => part?.text ?? '').join('')
        : '';

  if (!text.trim()) throw new Error('Gemini returned an empty completion');

  return { text, model, usage: resp.data?.usage };
}

/**
 * Calls Gemini with the primary model, then falls back to the configured
 * fallback model when the primary is rate limited / overloaded.
 */
export async function callGemini(
  messages: GeminiMessage[],
  opts: CallOptions = {}
): Promise<GeminiResult> {
  if (!isGeminiConfigured()) {
    throw new GeminiUnavailableError('GEMINI_API_KEY is not configured');
  }

  const candidates = [opts.model || config.geminiModel, config.geminiFallbackModel].filter(
    (model, index, all): model is string => Boolean(model) && all.indexOf(model) === index
  );

  let lastError: unknown = null;

  for (const model of candidates) {
    try {
      return await callModel(model, messages, opts);
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const retryDifferentModel = status === undefined || RETRYABLE_STATUS.has(status);
      if (!retryDifferentModel) break;
    }
  }

  const status = axios.isAxiosError(lastError) ? lastError.response?.status : undefined;
  throw new GeminiUnavailableError(describeError(lastError), status);
}

/**
 * Extracts the first JSON object from a model response. Models occasionally
 * wrap JSON in prose or markdown fences, so we fail soft rather than throw.
 */
export function parseJsonObject<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
