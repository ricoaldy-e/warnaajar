import 'server-only';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { Module2Error } from './http';
import { logAiFailure } from './diagnostics';

export const COSMOS_TIMEOUT_MS = 45_000;
export const COSMOS_MAX_OUTPUT_TOKENS = 2_048;

const environmentSchema = z.object({
  COSMOS_API_KEY: z.string().trim().min(1),
  COSMOS_BASE_URL: z.literal('https://api.cosmosin.io/v1'),
  COSMOS_MODEL: z.literal('deepseek-v4.1-flash'),
});

export async function completeJson<T>(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  // Lazy: import/build tidak memerlukan secret. Tidak ada state sesi atau cache hasil AI.
  const environment = environmentSchema.safeParse({
    COSMOS_API_KEY: process.env.COSMOS_API_KEY,
    COSMOS_BASE_URL: process.env.COSMOS_BASE_URL,
    COSMOS_MODEL: process.env.COSMOS_MODEL,
  });
  if (!environment.success) throw new Module2Error('INTERNAL_ERROR');
  let responseFormat: ReturnType<typeof zodResponseFormat>;
  try {
    responseFormat = zodResponseFormat(schema, 'warnaajar_response');
  } catch {
    // Schema wire tidak kompatibel adalah kesalahan konfigurasi lokal, bukan provider.
    throw new Module2Error('INTERNAL_ERROR');
  }
  const client = new OpenAI({
    apiKey: environment.data.COSMOS_API_KEY,
    baseURL: environment.data.COSMOS_BASE_URL,
    maxRetries: 0,
    timeout: COSMOS_TIMEOUT_MS,
    logLevel: 'off',
  });
  try {
    const { data: response, response: httpResponse } = await client.chat.completions.create({
      model: environment.data.COSMOS_MODEL,
      messages,
      response_format: responseFormat,
      stream: false,
      max_tokens: COSMOS_MAX_OUTPUT_TOKENS,
    }, { signal }).withResponse();
    const choice = response?.choices?.[0];
    function fail(stage: Parameters<typeof logAiFailure>[0], issues?: readonly z.core.$ZodIssue[], invalidJson?: { content: string; error: unknown }): never {
      logAiFailure(stage, {
        finishReason: choice?.finish_reason, httpStatus: httpResponse.status,
        usage: response?.usage, issues, invalidJson,
      });
      throw new Module2Error('AI_INVALID_RESPONSE');
    }
    if (!choice?.message) fail('empty_response');
    if (choice?.message?.refusal) fail('refusal');
    // length dengan content kosong tetap dibedakan dari response kosong biasa.
    if (choice?.finish_reason !== undefined && choice.finish_reason !== 'stop') fail('finish_reason');
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim()) fail('empty_response');
    if (choice?.finish_reason !== 'stop') fail('finish_reason');
    let value: unknown;
    try { value = JSON.parse(content); } catch (error: unknown) {
      fail('invalid_json', undefined, { content, error });
    }
    const result = schema.safeParse(value);
    if (!result.success) fail('wire_schema', result.error.issues);
    return result.data;
  } catch (error: unknown) {
    if (error instanceof Module2Error) throw error;
    if (error instanceof OpenAI.APIConnectionTimeoutError || (error instanceof OpenAI.APIError && error.status === 504)) {
      throw new Module2Error('AI_TIMEOUT');
    }
    if (error instanceof OpenAI.APIError && error.status === 429) throw new Module2Error('RATE_LIMITED');
    // Tidak meneruskan message/cause provider: bisa berisi key, headers, atau gambar.
    throw new Module2Error('AI_PROVIDER_ERROR');
  }
}
