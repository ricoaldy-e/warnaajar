// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { completeJson, COSMOS_MAX_OUTPUT_TOKENS, COSMOS_TIMEOUT_MS } from '../cosmos';
import { errorResponse } from '../http';
import { semanticAnalysisSchemaFor } from '../schemas';
import { analysis } from './fixtures';

vi.mock('server-only', () => ({}));

const key = 'sk-cos-FAKE-UNIT-TEST-ONLY';
const fetchMock = vi.fn<typeof fetch>();
const schema = z.strictObject({ label: z.string() });
const messages = [{ role: 'user' as const, content: 'Baca visual.' }];
const providerResponse = (content: unknown = '{"label":"Terbaca"}', extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({
    choices: [{ message: { content, refusal: null }, finish_reason: 'stop' }], ...extra,
  }), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.stubEnv('COSMOS_API_KEY', key);
  vi.stubEnv('COSMOS_BASE_URL', 'https://api.cosmosin.io/v1');
  vi.stubEnv('COSMOS_MODEL', 'deepseek-v4.1-flash');
  vi.stubEnv('OPENAI_LOG', 'debug');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => providerResponse());
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

it('import bersifat lazy; sukses memvalidasi JSON dan menerapkan seluruh konfigurasi request', async () => {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await completeJson(messages, schema)).toEqual({ label: 'Terbaca' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.cosmosin.io/v1/chat/completions');
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${key}`);
  const body: unknown = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: 'deepseek-v4.1-flash', messages, stream: false, max_tokens: COSMOS_MAX_OUTPUT_TOKENS,
    response_format: { type: 'json_schema', json_schema: { strict: true, schema: { type: 'object' } } },
  });
  expect(body).not.toHaveProperty('max_completion_tokens');
});

it('mendukung text dan image_url dalam satu pesan', async () => {
  const imageUrl = 'data:image/png;base64,TEST_FIXTURE_ONLY';
  await completeJson([{ role: 'user', content: [
    { type: 'text', text: 'Baca gambar.' }, { type: 'image_url', image_url: { url: imageUrl } },
  ] }], schema);
  const body: unknown = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body).toMatchObject({ messages: [{ content: [
    { type: 'text', text: 'Baca gambar.' }, { type: 'image_url', image_url: { url: imageUrl } },
  ] }] });
});

it('schema runtime dengan optional non-nullable ditolak aman sebelum network, tanpa mengubah kontrak', async () => {
  await expect(completeJson(messages, semanticAnalysisSchemaFor(analysis.colors)))
    .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('referensi ID tetap diperiksa oleh Zod sesudah response JSON Schema', async () => {
  const ids = new Set(analysis.colors.map((color) => color.id));
  const responseSchema = z.strictObject({ colorId: z.string() }).refine((value) => ids.has(value.colorId));
  fetchMock.mockImplementation(async () => providerResponse('{"colorId":"invented"}'));
  await expect(completeJson(messages, responseSchema))
    .rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
});

it.each(['COSMOS_API_KEY', 'COSMOS_BASE_URL', 'COSMOS_MODEL'])('menolak env hilang %s sebelum network', async (name) => {
  vi.stubEnv(name, undefined);
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  ['COSMOS_API_KEY', ' '], ['COSMOS_BASE_URL', 'https://other.example/v1'], ['COSMOS_MODEL', 'other-model'],
])('menolak konfigurasi invalid tanpa fallback: %s', async (name, value) => {
  vi.stubEnv(name, value);
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  expect(fetchMock).not.toHaveBeenCalled();
});

describe('response invalid', () => {
  it.each(['not JSON', '{"label":', '{"label":4}', 'null', ''])('menolak konten invalid (%#)', async (content) => {
    fetchMock.mockImplementation(async () => providerResponse(content));
    await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
  it.each([
    { choices: [] }, { choices: [{ message: { content: null }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: '{"label":"x"}', refusal: 'refused' }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: '{"label":"x"}' }, finish_reason: 'length' }] },
    { choices: [{ message: { content: '{"label":"x"}' }, finish_reason: 'content_filter' }] },
    { choices: [{ message: { content: 7 }, finish_reason: 'stop' }] },
    { choices: [{}] },
  ])('menolak response kosong, refusal, terpotong, atau envelope invalid (%#)', async (extra) => {
    fetchMock.mockImplementation(async () => providerResponse(undefined, extra));
    await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
  it('envelope kosong tetap AI_INVALID_RESPONSE', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
});

it.each([
  [400, 'AI_PROVIDER_ERROR'], [401, 'AI_PROVIDER_ERROR'], [402, 'AI_PROVIDER_ERROR'],
  [403, 'AI_PROVIDER_ERROR'], [404, 'AI_PROVIDER_ERROR'], [429, 'RATE_LIMITED'],
  [500, 'AI_PROVIDER_ERROR'], [503, 'AI_PROVIDER_ERROR'], [504, 'AI_TIMEOUT'],
])('memetakan HTTP %s tanpa retry atau kebocoran detail', async (status, code) => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: {
    message: `${key} Authorization: Bearer ${key} data:image/png;base64,SENSITIVE`,
  } }), { status: Number(status), headers: { 'content-type': 'application/json', 'retry-after': '1' } }));
  const error: unknown = await completeJson(messages, schema).catch((value: unknown) => value);
  expect(error).toMatchObject({ code });
  const output = await errorResponse(error).text();
  expect(output).not.toContain(key);
  expect(output).not.toContain('Authorization');
  expect(output).not.toContain('base64');
  expect(error).not.toHaveProperty('cause');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(errorLog).not.toHaveBeenCalled();
});

it('koneksi gagal tidak diulang', async () => {
  fetchMock.mockRejectedValue(new TypeError(key));
  await expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

function hangUntilAbort() {
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
}

it('timeout benar-benar membatalkan transport pada 45000 ms tanpa retry', async () => {
  vi.useFakeTimers();
  hangUntilAbort();
  const pending = expect(completeJson(messages, schema)).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(COSMOS_TIMEOUT_MS + 1);
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('AbortSignal caller membatalkan transport aktif dengan error aman', async () => {
  hangUntilAbort();
  const controller = new AbortController();
  const pending = expect(completeJson(messages, schema, controller.signal)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  controller.abort(new Error(key));
  await pending;
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it('signal yang sudah dibatalkan tidak memanggil transport', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(completeJson(messages, schema, controller.signal)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  expect(fetchMock).not.toHaveBeenCalled();
});
