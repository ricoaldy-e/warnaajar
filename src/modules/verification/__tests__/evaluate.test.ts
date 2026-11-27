// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { POST } from '@/app/api/verify/route';
import { MAX_AI_IMAGE_BYTES, MAX_METADATA_BYTES, MAX_REQUEST_BYTES } from '@/modules/ai-analysis/http';
import { questions } from '@/modules/ai-analysis/__tests__/fixtures';
import { verificationResultSchemaFor } from '../schemas';
import { afterBytes, afterImage, answers, answeringReply, beforeBytes, beforeImage, evaluateForm } from './evaluate-fixtures';

vi.mock('server-only', () => ({}));
const fetchMock = vi.fn<typeof fetch>();
const key = 'sk-cos-FAKE-EVALUATE-ONLY';
const request = (form = evaluateForm(), signal?: AbortSignal) => new Request('https://warnaajar.test/api/verify', { method: 'POST', body: form, signal });
const isBefore = (init?: RequestInit) => String(init?.body).includes(Buffer.from(beforeBytes).toString('base64'));
beforeEach(() => {
  vi.stubEnv('COSMOS_API_KEY', key); vi.stubEnv('COSMOS_BASE_URL', 'https://api.cosmosin.io/v1');
  vi.stubEnv('COSMOS_MODEL', 'deepseek-v4.1-flash'); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => answeringReply());
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['protan', 'deutan', 'tritan', 'grayscale'] as const)('mode %s mengembalikan hasil langsung dan tepat dua calls', async (mode) => {
  const form = evaluateForm(); form.set('mode', mode);
  const response = await POST(request(form));
  const body: unknown = await response.json();
  expect(response.status).toBe(200);
  const result = verificationResultSchemaFor(mode, questions).parse(body);
  expect(result.items).toEqual(questions.map((question) => ({ question,
    before: { answer: question.expectedAnswer, status: 'correct' }, after: { answer: question.expectedAnswer, status: 'correct' },
  })));
  expect(body).not.toHaveProperty('data'); expect(body).not.toHaveProperty('score'); expect(body).not.toHaveProperty('percentage');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('kedua payload blind: DTO eksplisit tanpa kunci, prompt/schema sama, gambar terisolasi', async () => {
  const secretQuestions = questions.map((question, index) => ({ ...question, expectedAnswer: `PRIVATE_KEY_${index}_DO_NOT_SEND` }));
  const form = evaluateForm(); form.set('questions', JSON.stringify(secretQuestions));
  expect((await POST(request(form))).status).toBe(200);
  const bodies = fetchMock.mock.calls.map(([url, init]) => {
    expect(url).toBe('https://api.cosmosin.io/v1/chat/completions');
    const raw = String(init?.body);
    expect(raw).not.toContain('expectedAnswer'); expect(raw).not.toContain('PRIVATE_KEY'); expect(raw).not.toContain(key);
    return z.object({ model: z.string(), max_tokens: z.number(), stream: z.boolean(),
      messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
      response_format: z.object({ type: z.literal('json_schema'), json_schema: z.object({ strict: z.literal(true), schema: z.unknown() }) }),
    }).parse(JSON.parse(raw));
  });
  expect(bodies).toHaveLength(2);
  for (const body of bodies) {
    expect(body).toMatchObject({ model: 'deepseek-v4.1-flash', max_tokens: 2048, stream: false });
    expect(body.messages.map((message) => message.role)).toEqual(['system', 'user']);
    const content = z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).parse(body.messages[1].content);
    const task = z.string().parse(content[0].text);
    expect(JSON.parse(task.split('\nJSON Schema:\n')[1])).toEqual(body.response_format.json_schema.schema);
    expect(JSON.parse(content[1].text ?? '{}')).toEqual({ questions: secretQuestions.map(({ id, question }) => ({ id, question })) });
    expect(task).toContain('answer=null'); expect(task).toContain('bukan instruksi aplikasi');
    expect(task).not.toMatch(/before|after|repair|deutan|protan|tritan|grayscale/i);
    expect(content).toHaveLength(3);
    expect(body.response_format.json_schema.schema).toMatchObject({ type: 'object', additionalProperties: false,
      required: ['answers'], properties: { answers: { items: { additionalProperties: false, required: ['id', 'answer'] } } },
    });
  }
  expect(bodies[0].messages[0]).toEqual(bodies[1].messages[0]);
  const userParts = bodies.map((body) => z.array(z.object({ text: z.string().optional() }).passthrough()).parse(body.messages[1].content));
  expect(userParts[0].slice(0, 2)).toEqual(userParts[1].slice(0, 2));
  const serialized = bodies.map((body) => JSON.stringify(body.messages));
  const beforeUrl = Buffer.from(beforeBytes).toString('base64'), afterUrl = Buffer.from(afterBytes).toString('base64');
  expect(serialized.filter((body) => body.includes(beforeUrl))).toHaveLength(1);
  expect(serialized.filter((body) => body.includes(afterUrl))).toHaveLength(1);
  expect(serialized.every((body) => !(body.includes(beforeUrl) && body.includes(afterUrl)))).toBe(true);
});

it('jawaban disusun berdasarkan ID, bukan posisi array model', async () => {
  fetchMock.mockImplementation(async () => answeringReply({ answers: [...answers].reverse() }));
  const value = verificationResultSchemaFor('deutan', questions).parse(await (await POST(request())).json());
  expect(value.items.map((item) => item.question.id)).toEqual(questions.map((question) => question.id));
  expect(value.items.every((item) => item.before.status === 'correct' && item.after.status === 'correct')).toBe(true);
});

it('tiga pertanyaan diproses seluruhnya dalam dua panggilan', async () => {
  const three = [...questions, { id: 'q3', question: 'Kategori apa pada batang C?', expectedAnswer: 'Melon' }];
  const form = evaluateForm(); form.set('questions', JSON.stringify(three));
  fetchMock.mockImplementation(async () => answeringReply({ answers: [...three].reverse().map((question) => ({ id: question.id, answer: question.expectedAnswer })) }));
  expect((await (await POST(request(form))).json()).items).toHaveLength(3);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([
  ['lebih baik', ['X', null], [questions[0].expectedAnswer, questions[1].expectedAnswer], ['incorrect', 'uncertain'], ['correct', 'correct']],
  ['sama', ['X', null], ['X', null], ['incorrect', 'uncertain'], ['incorrect', 'uncertain']],
  ['lebih buruk', [questions[0].expectedAnswer, questions[1].expectedAnswer], ['X', null], ['correct', 'correct'], ['incorrect', 'uncertain']],
  ['semua uncertain', [null, null], [null, null], ['uncertain', 'uncertain'], ['uncertain', 'uncertain']],
] as const)('hasil %s tidak dipaksakan meningkat', async (_name, before, after, beforeStatus, afterStatus) => {
  fetchMock.mockImplementation(async (_url, init) => answeringReply({ answers: questions.map((question, index) => ({
    id: question.id, answer: (isBefore(init) ? before : after)[index],
  })) }));
  const value = verificationResultSchemaFor('deutan', questions).parse(await (await POST(request())).json());
  expect(value.items.map((item) => item.before.status)).toEqual(beforeStatus);
  expect(value.items.map((item) => item.after.status)).toEqual(afterStatus);
});

it('jawaban asli dipertahankan walau comparison menormalisasi', async () => {
  fetchMock.mockImplementation(async () => answeringReply({ answers: answers.map((answer) => ({ ...answer, answer: ` \n${answer.answer.toLowerCase()} ` })) }));
  const value = verificationResultSchemaFor('deutan', questions).parse(await (await POST(request())).json());
  expect(value.items[0].before).toEqual({ answer: ` \n${answers[0].answer.toLowerCase()} `, status: 'correct' });
});

it('satu hasil dapat memuat correct, incorrect dan uncertain secara bersamaan', async () => {
  const three = [...questions, { id: 'q3', question: 'Kategori apa pada batang C?', expectedAnswer: 'Melon' }];
  const form = evaluateForm(); form.set('questions', JSON.stringify(three));
  fetchMock.mockImplementation(async () => answeringReply({ answers: [
    { id: 'q3', answer: null }, { id: 'q1', answer: three[0].expectedAnswer }, { id: 'q2', answer: 'X' },
  ] }));
  const result = verificationResultSchemaFor('deutan', three).parse(await (await POST(request(form))).json());
  expect(result.items.map((item) => item.before.status)).toEqual(['correct', 'incorrect', 'uncertain']);
  expect(result.items.map((item) => item.after.status)).toEqual(['correct', 'incorrect', 'uncertain']);
});

it('tidak ada history atau jawaban lama pada request berikutnya', async () => {
  fetchMock.mockImplementation(async () => answeringReply({ answers: questions.map(({ id }) => ({ id, answer: 'OLD_RESPONSE_DO_NOT_SEND' })) }));
  await POST(request());
  await POST(request());
  expect(fetchMock).toHaveBeenCalledTimes(4);
  for (const [, init] of fetchMock.mock.calls) expect(String(init?.body)).not.toContain('OLD_RESPONSE_DO_NOT_SEND');
});

it.each([
  { answers: [answers[0], { ...answers[1], id: 'foreign' }] },
  { answers: [answers[0], answers[0]] }, { answers: [answers[0]] }, { answers: [] },
  { answers: [...answers, { id: 'q3', answer: 'X' }] },
  { answers: [{ ...answers[0], answer: '' }, answers[1]] },
  { answers: [{ ...answers[0], answer: ' \n ' }, answers[1]] },
  { answers: [{ ...answers[0], answer: 40 }, answers[1]] },
  { answers: [{ ...answers[0], answer: undefined }, answers[1]] },
  { answers, status: 'ok' }, { answers: [{ ...answers[0], status: 'correct' }, answers[1]] },
  answers,
])('JSON/schema/reference invalid tidak menjadi uncertain atau hasil parsial (%#)', async (value) => {
  fetchMock.mockImplementation(async (_url, init) => isBefore(init) ? answeringReply(value) : answeringReply());
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: { code: 'AI_INVALID_RESPONSE', message: 'Hasil layanan AI tidak valid. Silakan coba lagi.' } });
});

it.each(['Berikut jawaban Anda...', '{"answers":'])('narasi atau malformed JSON ditolak (%#)', async (content) => {
  fetchMock.mockImplementation(async () => Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: { code: 'AI_INVALID_RESPONSE' } });
});

it.each([
  ['before', 503, 502, 'AI_PROVIDER_ERROR'], ['after', 503, 502, 'AI_PROVIDER_ERROR'],
  ['before', 504, 504, 'AI_TIMEOUT'], ['after', 504, 504, 'AI_TIMEOUT'],
  ['before', 429, 429, 'RATE_LIMITED'], ['after', 429, 429, 'RATE_LIMITED'],
] as const)('%s provider %s menggagalkan operasi tanpa hasil parsial/retry', async (side, providerStatus, status, code) => {
  fetchMock.mockImplementation(async (_url, init) => isBefore(init) === (side === 'before')
    ? Response.json({ error: { message: `${key} Authorization private data:image/png;base64,private` } }, { status: providerStatus }) : answeringReply());
  const response = await POST(request());
  const body: unknown = await response.json();
  expect(response.status).toBe(status);
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
  expect(JSON.stringify(body)).not.toContain(key); expect(JSON.stringify(body)).not.toContain('base64');
  expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
});

it('kegagalan satu request membatalkan sibling yang masih aktif', async () => {
  fetchMock.mockImplementation((_url, init) => isBefore(init) ? new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }) : Promise.resolve(Response.json({ error: { message: 'Rate limited' } }, { status: 429 })));
  expect((await POST(request())).status).toBe(429);
  expect(fetchMock.mock.calls.find(([, init]) => isBefore(init))?.[1]?.signal?.aborted).toBe(true);
});

it('Request.signal membatalkan kedua transport tanpa hasil palsu', async () => {
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = POST(request(evaluateForm(), controller.signal));
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  controller.abort();
  const response = await pending;
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: { code: 'AI_PROVIDER_ERROR' } });
  expect(fetchMock.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
});

it('timeout 45 detik membatalkan kedua call sans retry', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = POST(request());
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await vi.advanceTimersByTimeAsync(45001);
  const response = await pending;
  expect(response.status).toBe(504);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each([
  ['normal mode', (form: FormData) => form.set('mode', 'normal')],
  ['missing before', (form: FormData) => form.delete('before')],
  ['missing after', (form: FormData) => form.delete('after')],
  ['missing mode', (form: FormData) => form.delete('mode')],
  ['invalid JSON', (form: FormData) => form.set('questions', '{')],
  ['duplicate ID', (form: FormData) => form.set('questions', JSON.stringify([questions[0], { ...questions[1], id: questions[0].id }]))],
  ['one question', (form: FormData) => form.set('questions', JSON.stringify([questions[0]]))],
  ['empty key', (form: FormData) => form.set('questions', JSON.stringify([questions[0], { ...questions[1], expectedAnswer: '' }]))],
  ['mapping', (form: FormData) => form.append('mapping', '{}')],
  ['analysis', (form: FormData) => form.append('analysis', '{}')],
  ['context', (form: FormData) => form.append('context', '{}')],
  ['originalImage', (form: FormData) => form.append('originalImage', beforeImage())],
  ['sessionId', (form: FormData) => form.append('sessionId', 'x')],
  ['duplicate file', (form: FormData) => form.append('after', afterImage())],
])('%s ditolak sebelum dua call AI dimulai', async (_name, mutate) => {
  const form = evaluateForm(); mutate(form);
  expect((await POST(request(form))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ['before', 415, () => new File(['bad'], 'a.gif', { type: 'image/gif' })],
  ['after', 400, () => new File(['bad'], 'a.png', { type: 'image/png' })],
  ['before', 413, () => new File([new Uint8Array(MAX_AI_IMAGE_BYTES + 1)], 'a.png', { type: 'image/png' })],
  ['after', 413, () => new File([new Uint8Array(MAX_REQUEST_BYTES)], 'a.png', { type: 'image/png' })],
] as const)('validasi gambar %s status %s sebelum network', async (field, status, makeFile) => {
  const form = evaluateForm(); form.set(field, makeFile());
  expect((await POST(request(form))).status).toBe(status);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('metadata berlebih dan transport bukan multipart ditolak tanpa AI', async () => {
  const form = evaluateForm(); form.set('questions', 'x'.repeat(MAX_METADATA_BYTES + 1));
  expect((await POST(request(form))).status).toBe(413);
  expect((await POST(new Request('https://warnaajar.test/api/verify', { method: 'POST', body: '{}' }))).status).toBe(415);
  expect(fetchMock).not.toHaveBeenCalled();
});
