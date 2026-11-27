// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { POST } from '@/app/api/analyze/route';
import { MAX_AI_IMAGE_BYTES, MAX_METADATA_BYTES, MAX_REQUEST_BYTES } from '../http';
import { semanticAnalysisSchemaFor } from '../schemas';
import { analysis, semantic } from './fixtures';
import { analyzeForm, providerReply, sourceImage } from './analyze-fixtures';

vi.mock('server-only', () => ({}));

const fetchMock = vi.fn<typeof fetch>();
const request = (form = analyzeForm(), signal?: AbortSignal) =>
  new Request('https://warnaajar.test/api/analyze', { method: 'POST', body: form, signal });
beforeEach(() => {
  vi.stubEnv('COSMOS_API_KEY', 'sk-cos-FAKE-ROUTE-TEST-ONLY');
  vi.stubEnv('COSMOS_BASE_URL', 'https://api.cosmosin.io/v1');
  vi.stubEnv('COSMOS_MODEL', 'deepseek-v4.1-flash');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => providerReply());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('multipart valid mengembalikan SemanticAnalysis langsung, satu panggilan provider', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).toEqual(semantic);
  expect(semanticAnalysisSchemaFor(analysis.colors).safeParse(body).success).toBe(true);
  expect(body).not.toHaveProperty('data'); expect(body).not.toHaveProperty('success');
  expect(body).not.toHaveProperty('sessionId'); expect(body).not.toHaveProperty('timestamp');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('context opsional diteruskan hanya ketika tersedia', async () => {
  const form = analyzeForm(); form.append('context', JSON.stringify({ subject: 'Geografi', grade: 'SMA' }));
  expect((await POST(request(form))).status).toBe(200);
  expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('Geografi');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([
  ['missing image', (form: FormData) => form.delete('image'), 400, 'INVALID_INPUT'],
  ['missing analysis', (form: FormData) => form.delete('analysis'), 400, 'INVALID_INPUT'],
  ['invalid JSON', (form: FormData) => form.set('analysis', '{'), 400, 'INVALID_INPUT'],
  ['invalid context', (form: FormData) => form.append('context', '{'), 400, 'INVALID_INPUT'],
  ['unsupported MIME', (form: FormData) => form.set('image', new File(['gif'], 'a.gif', { type: 'image/gif' })), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ['bad signature', (form: FormData) => form.set('image', new File(['bad'], 'a.png', { type: 'image/png' })), 400, 'INVALID_INPUT'],
  ['oversized image', (form: FormData) => form.set('image', new File([new Uint8Array(MAX_AI_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' })), 413, 'PAYLOAD_TOO_LARGE'],
  ['oversized body', (form: FormData) => form.set('image', new File([new Uint8Array(MAX_REQUEST_BYTES)], 'large.png', { type: 'image/png' })), 413, 'PAYLOAD_TOO_LARGE'],
  ['oversized metadata', (form: FormData) => form.append('context', JSON.stringify({ subject: 'x'.repeat(MAX_METADATA_BYTES) })), 413, 'PAYLOAD_TOO_LARGE'],
  ['unknown conflict reference', (form: FormData) => form.set('analysis', JSON.stringify({ ...analysis, conflicts: [{ ...analysis.conflicts[0], colorAId: 'invented' }] })), 400, 'INVALID_INPUT'],
  ['duplicate swatch ID', (form: FormData) => form.set('analysis', JSON.stringify({ ...analysis, colors: [...analysis.colors, analysis.colors[0]] })), 400, 'INVALID_INPUT'],
  ['duplicate image', (form: FormData) => form.append('image', sourceImage()), 400, 'INVALID_INPUT'],
] as const)('%s ditolak sebelum provider dipanggil', async (_name, mutate, status, code) => {
  const form = analyzeForm(); mutate(form);
  const response = await POST(request(form));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([[503, 502, 'AI_PROVIDER_ERROR'], [504, 504, 'AI_TIMEOUT'], [429, 429, 'RATE_LIMITED']] as const)
  ('kegagalan provider %s dipetakan aman tanpa hasil palsu atau retry', async (providerStatus, status, code) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: {
      message: 'sk-cos-FAKE-ROUTE-TEST-ONLY Authorization: Bearer private data:image/png;base64,private',
    } }), { status: providerStatus, headers: { 'content-type': 'application/json' } }));
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code, message: expect.any(String) } });
    expect(JSON.stringify(body)).not.toContain('sk-cos-');
    expect(JSON.stringify(body)).not.toContain('Authorization');
    expect(JSON.stringify(body)).not.toContain('base64');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

it('output AI dengan ID asing ditolak sebagai AI_INVALID_RESPONSE', async () => {
  fetchMock.mockImplementation(async () => providerReply({
    ...semantic, categories: [{ ...semantic.categories[0], colorId: 'invented', suggestedPattern: 'diagonal' }],
  }));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: { code: 'AI_INVALID_RESPONSE', message: expect.any(String) } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('narasi Markdown dari capture live sintetis ditolak aman tanpa parsing permisif atau retry', async () => {
  const narrative = readFileSync(new URL('./cosmos-narrative.txt', import.meta.url), 'utf8');
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{
    message: { content: narrative, refusal: null }, finish_reason: 'stop',
  }] }), { headers: { 'content-type': 'application/json' } }));
  const form = analyzeForm();
  form.append('context', JSON.stringify({ subject: 'Matematika', grade: 'SMP' }));
  const response = await POST(request(form));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: {
    code: 'AI_INVALID_RESPONSE', message: 'Hasil layanan AI tidak valid. Silakan coba lagi.',
  } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('gambar valid tetapi di luar scope tetap response semantic unknown dengan warning', async () => {
  const unknown = { visualType: 'unknown', dataType: 'unknown', categories: [], explanation: 'Visual tidak dapat dipetakan dengan aman.', warnings: ['Gambar di luar dukungan visual warna datar.'] };
  fetchMock.mockImplementation(async () => providerReply(unknown));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(unknown);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('AbortSignal request membatalkan transport provider aktif', async () => {
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = POST(request(analyzeForm(), controller.signal));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  controller.abort();
  const response = await pending;
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: { code: 'AI_PROVIDER_ERROR', message: expect.any(String) } });
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
