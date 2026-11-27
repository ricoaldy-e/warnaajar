import 'server-only';
import { z } from 'zod';

type FailureStage = 'empty_response' | 'refusal' | 'finish_reason' | 'invalid_json' |
  'wire_schema' | 'public_schema' | 'color_id_reference';

const finishReasons = z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']);
const count = z.number().int().nonnegative();
const usageSchema = z.object({
  prompt_tokens: count.optional(),
  completion_tokens: count.optional(),
  total_tokens: count.optional(),
  completion_tokens_details: z.object({ reasoning_tokens: count.optional() }).optional(),
});
const fieldNames = new Set([
  'visualType', 'dataType', 'categories', 'colorId', 'label', 'included', 'order',
  'suggestedPattern', 'explanation', 'warnings',
]);
const checks = new Set(['color_id_reference', 'duplicate_color_id', 'categorical_order', 'ordinal_order']);

export function logAiFailure(stage: FailureStage, details: {
  finishReason?: unknown;
  httpStatus?: number;
  usage?: unknown;
  issues?: readonly z.core.$ZodIssue[];
  invalidJson?: { content: string; error: unknown };
} = {}): void {
  if (process.env.NODE_ENV !== 'development') return;
  const finishReason = finishReasons.safeParse(details.finishReason);
  const usage = usageSchema.safeParse(details.usage);
  const invalidJson = details.invalidJson;
  const content = invalidJson?.content.replace(/^[\x20\t\r\n]+|[\x20\t\r\n]+$/g, '');
  const fencedContent = content === undefined ? null : /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(content);
  const wholeJsonFence = fencedContent !== null && !/^[\t ]*```/m.test(fencedContent[1]);
  let fencedJsonValid = false;
  if (wholeJsonFence) {
    // Diagnostik saja: hasil ini tidak dipakai untuk menerima response provider.
    try { JSON.parse(fencedContent[1]); fencedJsonValid = true; } catch { /* Tetap tolak response. */ }
  }
  const positionMatch = invalidJson?.error instanceof SyntaxError
    ? /\bat position (\d+)(?: \(line \d+ column \d+\))?$/.exec(invalidJson.error.message) : null;
  const position = positionMatch ? Number(positionMatch[1]) : undefined;
  console.warn('[WarnaAjar AI diagnostic]', {
    stage,
    ...(details.finishReason !== undefined ? { finishReason: finishReason.success ? finishReason.data : 'unrecognized' } : {}),
    ...(details.httpStatus !== undefined ? { httpStatus: details.httpStatus } : {}),
    ...(usage.success ? { tokenUsage: usage.data } : {}),
    ...(content !== undefined ? { jsonContent: {
      type: 'string', length: invalidJson?.content.length,
      hasMarkdownFence: /```|~~~/.test(content), hasBom: content.includes('\uFEFF'),
      wholeJsonFence, fencedJsonValid,
      startsWithJsonDelimiter: content.startsWith('{') || content.startsWith('['),
      endsWithJsonDelimiter: content.endsWith('}') || content.endsWith(']'),
      matchingJsonDelimiters: (content.startsWith('{') && content.endsWith('}')) ||
        (content.startsWith('[') && content.endsWith(']')),
      ...(position !== undefined && Number.isSafeInteger(position) && position <= (invalidJson?.content.length ?? 0)
        ? { syntaxErrorPosition: position } : {}),
    } } : {}),
    issues: details.issues?.slice(0, 10).map((issue) => ({
      code: issue.code,
      // Jangan log message, keys, params mentah, atau nama field dinamis dari input.
      path: issue.path.map((part) => typeof part === 'number' ? part :
        typeof part === 'string' && fieldNames.has(part) ? part : '[field]'),
      ...(issue.code === 'custom' && checks.has(issue.params?.check) ? { check: issue.params?.check } : {}),
    })),
  });
}
