// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { POST } from '@/app/api/analyze/route';
import { completeJson } from '../cosmos';
import { logAiFailure } from '../diagnostics';
import { errorResponse } from '../http';
import { analyzeForm, providerReply, wireSemantic } from './analyze-fixtures';

vi.mock('server-only', () => ({}));

const fetchMock = vi.fn<typeof fetch>();
const schema = z.strictObject({ label: z.string() });
const messages = [{ role: 'user' as const, content: 'Baca visual.' }];
const sensitive = 'sk-cos-PRIVATE Authorization: Bearer private data:image/png;base64,PRIVATE';
const usage = {
  prompt_tokens: 100, completion_tokens: 2048, total_tokens: 2148,
  completion_tokens_details: { reasoning_tokens: 1900, private: sensitive },
  private: sensitive,
};
const choice = (content: unknown, finish_reason = 'stop', refusal: string | null = null) => ({
  message: { content, refusal }, finish_reason,
});

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('COSMOS_API_KEY', 'sk-cos-FAKE-DIAGNOSTIC-TEST-ONLY');
  vi.stubEnv('COSMOS_BASE_URL', 'https://api.cosmosin.io/v1');
  vi.stubEnv('COSMOS_MODEL', 'deepseek-v4.1-flash');
  vi.stubEnv('OPENAI_LOG', 'debug');
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fetchMock.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([
  ['empty_response', []],
  ['empty_response', [choice(null)]],
  ['refusal', [choice(null, 'stop', sensitive)]],
  ['finish_reason', [choice(null, 'length')]],
  ['finish_reason', [choice('{"label":"valid"}', 'tool_calls')]],
  ['invalid_json', [choice(sensitive)]],
  ['wire_schema', [choice(JSON.stringify({ label: null }))]],
] as const)('diagnostik membedakan %s dengan error publik yang tetap sama (%#)', async (stage, choices) => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices, usage }), {
    status: 200, headers: { 'content-type': 'application/json', authorization: sensitive },
  }));
  const error: unknown = await completeJson(messages, schema).catch((value: unknown) => value);
  expect(error).toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  expect(await errorResponse(error).json()).toEqual({ error: {
    code: 'AI_INVALID_RESPONSE', message: 'Hasil layanan AI tidak valid. Silakan coba lagi.',
  } });
  expect(console.warn).toHaveBeenCalledTimes(1);
  expect(console.warn).toHaveBeenCalledWith('[WarnaAjar AI diagnostic]', expect.objectContaining({
    stage, httpStatus: 200,
    tokenUsage: { prompt_tokens: 100, completion_tokens: 2048, total_tokens: 2148, completion_tokens_details: { reasoning_tokens: 1900 } },
  }));
  if (stage === 'finish_reason' && choices[0]?.finish_reason === 'length') {
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ finishReason: 'length' }));
  }
  if (stage === 'wire_schema') {
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      issues: [{ code: 'invalid_type', path: ['label'] }],
    }));
  }
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(sensitive);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('authorization');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([
  ['color_id_reference', 'color_id_reference', [{ ...wireSemantic.categories[0], colorId: sensitive }]],
  ['public_schema', 'duplicate_color_id', [wireSemantic.categories[0], wireSemantic.categories[0]]],
  ['public_schema', 'categorical_order', [{ ...wireSemantic.categories[0], order: 1 }]],
] as const)('route membedakan %s / %s sesudah normalisasi tanpa mengekspos detail (%#)', async (stage, check, categories) => {
  fetchMock.mockImplementation(async () => providerReply({ ...wireSemantic, categories }));
  const response = await POST(new Request('https://warnaajar.test/api/analyze', { method: 'POST', body: analyzeForm() }));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: {
    code: 'AI_INVALID_RESPONSE', message: 'Hasil layanan AI tidak valid. Silakan coba lagi.',
  } });
  expect(console.warn).toHaveBeenCalledTimes(1);
  expect(console.warn).toHaveBeenCalledWith('[WarnaAjar AI diagnostic]', expect.objectContaining({
    stage, issues: [{ code: 'custom', path: ['categories'], check }],
  }));
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(sensitive);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('path, issue message, params, keys, finish reason, dan token usage asing tidak dicatat mentah', () => {
  const error = new z.ZodError([{
    code: 'custom', path: ['categories', 0, sensitive], message: sensitive,
    params: { check: sensitive, private: sensitive },
  }]);
  logAiFailure('public_schema', {
    finishReason: sensitive, usage: { completion_tokens: sensitive }, issues: error.issues,
  });
  expect(console.warn).toHaveBeenCalledWith('[WarnaAjar AI diagnostic]', {
    stage: 'public_schema', finishReason: 'unrecognized', issues: [{ code: 'custom', path: ['categories', 0, '[field]'] }],
  });
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(sensitive);
});

it('Zod unrecognized_keys tidak membocorkan nama field input', async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [choice(JSON.stringify({ label: 'valid', [sensitive]: sensitive }))] }), {
    headers: { 'content-type': 'application/json' },
  }));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    stage: 'wire_schema', issues: [{ code: 'unrecognized_keys', path: [] }],
  }));
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(sensitive);
});

it.each(['production', 'test', undefined])('tidak ada log diagnostik pada NODE_ENV=%s', async (environment) => {
  vi.stubEnv('NODE_ENV', environment);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [choice('not JSON')] }), {
    headers: { 'content-type': 'application/json' },
  }));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  logAiFailure('public_schema');
  expect(console.warn).not.toHaveBeenCalled();
});

it.each([
  ['```json\n{"label":"secret"}\n```', true, false, false, false, false],
  ['\uFEFF{"label":"secret"}', false, true, false, true, false],
  [' {"label": } ', false, false, true, true, true],
  ['[1, 2}', false, false, true, true, false],
] as const)('diagnostik JSON hanya mencatat bentuk content dan posisi aman (%#)', async (content, fence, bom, start, end, matching) => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [choice(content)] }), {
    headers: { 'content-type': 'application/json' },
  }));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  const details = vi.mocked(console.warn).mock.calls[0][1];
  expect(details).toEqual(expect.objectContaining({ stage: 'invalid_json', jsonContent: expect.objectContaining({
    type: 'string', length: content.length, hasMarkdownFence: fence, hasBom: bom,
    startsWithJsonDelimiter: start, endsWithJsonDelimiter: end, matchingJsonDelimiters: matching,
  }) }));
  expect(JSON.stringify(details)).not.toContain(content);
  expect(JSON.stringify(details)).not.toContain('secret');
});

it('posisi syntax error dicatat sebagai angka tanpa pesan error mentah', async () => {
  const content = '{"x": 1,}';
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [choice(content)] }), {
    headers: { 'content-type': 'application/json' },
  }));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    jsonContent: expect.objectContaining({ syntaxErrorPosition: 8 }),
  }));
});

it.each([
  ['```json\n{"label":"secret"}\n```', true, true],
  [' \r\n```JSON\r\n{"label":"secret"}\r\n```\r\n ', true, true],
  ['```\n{"label":"secret"}\n```', true, true],
  ['Penjelasan\n```json\n{"label":"secret"}\n```', false, false],
  ['```json\n{"label":"secret"}\n```\nPenjelasan', false, false],
  ['```json\n{"label":"secret",}\n```', true, false],
  ['```json\n{"label":"secret"}\n```\n```json\n{}\n```', false, false],
] as const)('diagnostik membedakan fence utuh dan JSON valid tanpa menerima respons (%#)', async (content, wholeJsonFence, fencedJsonValid) => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [choice(content)] }), {
    headers: { 'content-type': 'application/json' },
  }));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    stage: 'invalid_json', jsonContent: expect.objectContaining({ wholeJsonFence, fencedJsonValid }),
  }));
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('response sukses tidak menambah log diagnostik atau request', async () => {
  fetchMock.mockImplementation(async () => providerReply());
  const response = await POST(new Request('https://warnaajar.test/api/analyze', { method: 'POST', body: analyzeForm() }));
  expect(response.status).toBe(200);
  expect(console.warn).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
