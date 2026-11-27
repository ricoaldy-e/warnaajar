// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { POST as analyze } from '@/app/api/analyze/route';
import { POST as verify } from '@/app/api/verify/route';
import { confirmedMappingSchema, semanticAnalysisSchemaFor } from '@/modules/ai-analysis/schemas';
import { verificationQuestionsSchema, verificationResultSchemaFor } from '../schemas';
import { sourceImage } from '@/modules/ai-analysis/__tests__/analyze-fixtures';
import { analysis, semantic } from '@/modules/ai-analysis/__tests__/fixtures';

vi.mock('server-only', () => ({}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('alur enam HTTP request memakai satu set prepare pada empat mode dan tepat sepuluh model calls', async () => {
  vi.stubEnv('COSMOS_API_KEY', 'sk-cos-FAKE-FLOW-ONLY');
  vi.stubEnv('COSMOS_BASE_URL', 'https://api.cosmosin.io/v1');
  vi.stubEnv('COSMOS_MODEL', 'deepseek-v4.1-flash');
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = z.object({ messages: z.array(z.object({ content: z.unknown() })) }).parse(JSON.parse(String(init?.body)));
    const parts = z.array(z.object({ text: z.string().optional() }).passthrough()).parse(body.messages[1].content);
    const metadata: unknown = JSON.parse(parts[1].text ?? '{}');
    let value: unknown;
    if (z.object({ analysis: z.unknown() }).safeParse(metadata).success) {
      value = { ...semantic, categories: semantic.categories.map((category) => ({ ...category, suggestedPattern: category.suggestedPattern ?? null })) };
    } else if (z.object({ mapping: z.unknown() }).safeParse(metadata).success) {
      value = { status: 'ok', questions: [
        { question: 'Batang mana yang mewakili Sawo?', expectedAnswer: 'C' },
        { question: 'Kategori apa yang diwakili batang B?', expectedAnswer: 'Duku' },
      ] };
    } else {
      const dto = z.strictObject({ questions: z.array(z.strictObject({ id: z.string(), question: z.string() })) }).parse(metadata);
      value = { answers: dto.questions.map(({ id }) => ({ id, answer: id === 'q1' ? 'C' : 'Duku' })) };
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  const form = new FormData(); form.append('image', sourceImage()); form.append('analysis', JSON.stringify(analysis));
  const analysisResponse = await analyze(new Request('https://warnaajar.test/api/analyze', { method: 'POST', body: form }));
  expect(analysisResponse.status).toBe(200);
  const result = semanticAnalysisSchemaFor(analysis.colors).parse(await analysisResponse.json());
  const mapping = confirmedMappingSchema.parse({ dataType: result.dataType, categories: result.categories });
  const prepareForm = new FormData(); prepareForm.append('action', 'prepare'); prepareForm.append('image', sourceImage());
  prepareForm.append('mapping', JSON.stringify(mapping));
  const preparation = await verify(new Request('https://warnaajar.test/api/verify', { method: 'POST', body: prepareForm }));
  expect(preparation.status).toBe(200);
  const questions = verificationQuestionsSchema.parse(await preparation.json());
  for (const mode of ['protan', 'deutan', 'tritan', 'grayscale'] as const) {
    const input = new FormData(); input.append('action', 'evaluate'); input.append('mode', mode);
    input.append('before', sourceImage()); input.append('after', sourceImage()); input.append('questions', JSON.stringify(questions));
    const response = await verify(new Request('https://warnaajar.test/api/verify', { method: 'POST', body: input }));
    expect(response.status).toBe(200);
    const evaluated = verificationResultSchemaFor(mode, questions).parse(await response.json());
    expect(evaluated.items.map((item) => item.question)).toEqual(questions);
    expect(evaluated.items.every((item) => item.before.status === 'correct' && item.after.status === 'correct')).toBe(true);
  }
  expect(fetchMock).toHaveBeenCalledTimes(10);
  for (const [, init] of fetchMock.mock.calls.slice(2)) expect(String(init?.body)).not.toContain('expectedAnswer');
});
