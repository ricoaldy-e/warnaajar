// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  errorResponse, imageField, MAX_AI_IMAGE_BYTES, MAX_METADATA_BYTES, MAX_REQUEST_BYTES,
  Module2Error, parseAnalyzeRequest, parseVerifyRequest, readMultipart,
} from '../http';
import { analysis, mapping, questions } from './fixtures';

vi.mock('server-only', () => ({}));

// Fixture signature: helper ini memeriksa format, bukan melakukan decode gambar.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const file = (bytes = png, type = 'image/png') => new File([new Uint8Array(bytes)], 'fixture.png', { type });
const request = (form: FormData) => new Request('https://warnaajar.test/api', { method: 'POST', body: form });
function analyzeForm() {
  const form = new FormData();
  form.append('image', file()); form.append('analysis', JSON.stringify(analysis));
  return form;
}
function prepareForm() {
  const form = new FormData();
  form.append('action', 'prepare'); form.append('image', file()); form.append('mapping', JSON.stringify(mapping));
  return form;
}
function evaluateForm() {
  const form = new FormData();
  form.append('action', 'evaluate'); form.append('before', file()); form.append('after', file());
  form.append('mode', 'deutan'); form.append('questions', JSON.stringify(questions));
  return form;
}

it('menerima analyze multipart dan context opsional', async () => {
  const form = analyzeForm(); form.append('context', JSON.stringify({ subject: 'Geografi', grade: 'SMP' }));
  const value = await parseAnalyzeRequest(request(form));
  expect(value.analysis).toEqual(analysis);
  expect(value.context).toEqual({ subject: 'Geografi', grade: 'SMP' });
  expect(new Uint8Array(await value.image.arrayBuffer())).toEqual(png);
  expect(await parseAnalyzeRequest(request(analyzeForm()))).not.toHaveProperty('context');
});

it('prepare tidak memerlukan analysis dan mapping tetap dalam wrapper kontrak', async () => {
  expect(await parseVerifyRequest(request(prepareForm()))).toMatchObject({ action: 'prepare', mapping });
});

it('prepare dengan lima included ditolak oleh parser sebelum network', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    const form = prepareForm();
    form.set('mapping', JSON.stringify({ dataType: 'categorical', categories: Array.from({ length: 5 }, (_, index) => ({
      colorId: `category-${index}`, label: `Kategori ${index}`, included: true, order: null,
    })) }));
    await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

it('evaluate memakai before/after dan satu mode sesuai kontrak', async () => {
  expect(await parseVerifyRequest(request(evaluateForm()))).toMatchObject({ action: 'evaluate', mode: 'deutan', questions });
});

it.each(['image', 'analysis'])('menolak field analyze hilang: %s', async (name) => {
  const form = analyzeForm(); form.delete(name);
  await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it.each(['action', 'image', 'mapping'])('menolak field prepare hilang: %s', async (name) => {
  const form = prepareForm(); form.delete(name);
  await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it.each(['action', 'before', 'after', 'mode', 'questions'])('menolak field evaluate hilang: %s', async (name) => {
  const form = evaluateForm(); form.delete(name);
  await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it.each([
  (form: FormData) => form.append('image', file()),
  (form: FormData) => form.append('analysis', '{}'),
  (form: FormData) => form.append('otherImage', file()),
  (form: FormData) => form.set('analysis', file()),
  (form: FormData) => form.set('image', 'data:image/png;base64,invalid'),
  (form: FormData) => form.set('analysis', '{'),
  (form: FormData) => form.set('analysis', JSON.stringify({ ...analysis, colors: [analysis.colors[0]] })),
  (form: FormData) => form.append('context', JSON.stringify({ grade: 5 })),
])('menolak jumlah file, duplikasi, metadata, dan referensi invalid (%#)', async (mutate) => {
  const form = analyzeForm(); mutate(form);
  await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it('menolak penambahan field prepare yang belum disepakati', async () => {
  const form = prepareForm(); form.append('analysis', JSON.stringify(analysis));
  await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it.each([
  (form: FormData) => form.set('action', 'other'),
  (form: FormData) => form.append('action', 'prepare'),
  (form: FormData) => form.set('mode', 'normal'),
  (form: FormData) => form.set('questions', '[]'),
  (form: FormData) => form.set('questions', '{'),
  (form: FormData) => { form.delete('before'); form.append('beforeImage', file()); },
])('menolak evaluate invalid (%#)', async (mutate) => {
  const form = evaluateForm(); mutate(form);
  await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it('menolak mapping ordinal tanpa urutan', async () => {
  const form = prepareForm(); form.set('mapping', JSON.stringify({ ...mapping, dataType: 'ordinal' }));
  await expect(parseVerifyRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

describe('format gambar', () => {
  it('menerima JPEG berdasarkan MIME dan signature', async () => {
    const form = analyzeForm(); form.set('image', file(new Uint8Array([255, 216, 255, 224]), 'image/jpeg'));
    expect((await parseAnalyzeRequest(request(form))).image.type).toBe('image/jpeg');
  });
  it.each(['image/gif', 'image/svg+xml', 'application/octet-stream'])('menolak MIME %s', async (mime) => {
    const form = analyzeForm(); form.set('image', file(png, mime));
    await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
  it.each([
    file(new Uint8Array([1, 2, 3])), file(new Uint8Array([255, 216, 255])),
    file(png, 'image/jpeg'), file(new Uint8Array()),
  ])('menolak signature salah, tidak cocok MIME, atau file kosong (%#)', async (invalidFile) => {
    const form = analyzeForm(); form.set('image', invalidFile);
    await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('menerima batas tepat 1.5 MiB dan menolak satu byte lebih', async () => {
    for (const extra of [0, 1]) {
      const bytes = new Uint8Array(MAX_AI_IMAGE_BYTES + extra); bytes.set(png);
      const form = new FormData(); form.append('image', file(bytes));
      if (extra) await expect(imageField(form, 'image')).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      else expect((await imageField(form, 'image')).size).toBe(MAX_AI_IMAGE_BYTES);
    }
  });
});

describe('body multipart dan batas aktual', () => {
  it('menolak format transport bukan multipart', async () => {
    await expect(readMultipart(new Request('https://warnaajar.test', { method: 'POST', body: '{}' })))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
  it.each(['multipart/form-data', 'multipart/form-data; boundary=missing'])('menolak multipart rusak: %s', async (contentType) => {
    const req = new Request('https://warnaajar.test', { method: 'POST', body: 'not multipart', headers: { 'content-type': contentType } });
    await expect(readMultipart(req)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('menolak body yang tidak ada', async () => {
    await expect(readMultipart(new Request('https://warnaajar.test', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' } })))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('Content-Length dapat menolak request sebelum body dibaca', async () => {
    const req = request(analyzeForm()); req.headers.set('content-length', String(MAX_REQUEST_BYTES + 1));
    await expect(readMultipart(req)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(req.bodyUsed).toBe(false);
  });
  it.each(['-1', 'NaN'])('menolak Content-Length invalid %s', async (length) => {
    const req = request(analyzeForm()); req.headers.set('content-length', length);
    await expect(readMultipart(req)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it.each([undefined, '1'])('membatasi stream aktual tanpa mempercayai Content-Length %s', async (length) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES));
        controller.enqueue(new Uint8Array(1));
      }, cancel,
    });
    const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=x' });
    if (length) headers.set('content-length', length);
    const init = { method: 'POST', body, headers, duplex: 'half' };
    await expect(readMultipart(new Request('https://warnaajar.test', init))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('stream error tidak membocorkan penyebab internal', async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('sensitive-data')); } });
    const init = { method: 'POST', body, headers: { 'content-type': 'multipart/form-data; boundary=x' }, duplex: 'half' };
    const error: unknown = await readMultipart(new Request('https://warnaajar.test', init)).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await errorResponse(error).text()).not.toContain('sensitive-data');
  });
  it('batas total berlaku pada multipart nyata', async () => {
    const form = analyzeForm(); form.append('padding', file(new Uint8Array(MAX_REQUEST_BYTES)));
    await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
  it('menolak metadata JSON >64 KiB', async () => {
    const form = analyzeForm(); form.append('context', JSON.stringify({ subject: 'x'.repeat(MAX_METADATA_BYTES) }));
    await expect(parseAnalyzeRequest(request(form))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
  it('menghitung jumlah byte UTF-8 semua metadata, bukan jumlah karakter atau per field', async () => {
    const form = new FormData(); form.append('a', 'é'.repeat(MAX_METADATA_BYTES / 4)); form.append('b', 'x'.repeat(MAX_METADATA_BYTES / 2 + 1));
    await expect(readMultipart(request(form))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
  it('metadata tepat 64 KiB diterima oleh pembaca transport', async () => {
    const form = new FormData(); form.append('a', 'x'.repeat(MAX_METADATA_BYTES));
    expect((await readMultipart(request(form))).get('a')).toHaveLength(MAX_METADATA_BYTES);
  });
  it('dua gambar 1.5 MiB tetap di bawah batas request 3.5 MiB', async () => {
    const bytes = new Uint8Array(MAX_AI_IMAGE_BYTES); bytes.set(png);
    const form = evaluateForm(); form.set('before', file(bytes)); form.set('after', file(bytes));
    expect((await parseVerifyRequest(request(form))).action).toBe('evaluate');
  });
});

it.each([
  ['INVALID_INPUT', 400], ['PAYLOAD_TOO_LARGE', 413], ['UNSUPPORTED_MEDIA_TYPE', 415],
  ['INSUFFICIENT_EVIDENCE', 422], ['RATE_LIMITED', 429], ['AI_PROVIDER_ERROR', 502],
  ['AI_INVALID_RESPONSE', 502], ['AI_TIMEOUT', 504], ['INTERNAL_ERROR', 500],
] as const)('error %s mengikuti kode dan HTTP kontrak', async (code, status) => {
  const response = errorResponse(new Module2Error(code));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
});

it('error tidak dikenal tidak meneruskan message, stack, atau secret', async () => {
  const error = new Error('sk-cos-FAKE Authorization: Bearer secret data:image/png;base64,private');
  const response = errorResponse(error);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Permintaan belum dapat diproses.' } });
});
