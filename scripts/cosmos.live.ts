import { readFile, writeFile } from 'node:fs/promises';
import { it, vi } from 'vitest';
import OpenAI from 'openai';
import { z } from 'zod';
import { analyzeImage } from '../src/modules/ai-analysis/analyze';
import { semanticAnalysisSchemaFor, semanticCategorySchema, semanticAnalysisSchema, patternKindSchema, colorAnalysisSchema, analysisContextSchema } from '../src/modules/ai-analysis/schemas';

vi.mock('server-only', () => ({}));
const ledgerPath = 'docs/CosmosIn-live-results.json';
const wireSchema = semanticAnalysisSchema.extend({ categories: z.array(semanticCategorySchema.extend({ suggestedPattern: patternKindSchema.nullable() })) });

it('eksperimen live manual dengan budget eksplisit', async () => {
  if (process.env.COSMOS_LIVE_APPROVED !== '1') throw new Error('Live tidak diaktifkan.');
  const ledger: Record<string, unknown>[] = JSON.parse(await readFile(ledgerPath, 'utf8'));
  if (ledger.length >= 30) throw new Error('Budget 30 percobaan habis.');
  const name = process.env.LIVE_VARIANT ?? 'production';
  const fixtureName = process.env.LIVE_FIXTURE ?? 'cosmos-chart';
  const imageBytes = await readFile(`scripts/fixtures/${fixtureName}.png`);
  const fixture = z.object({ analysis: colorAnalysisSchema, context: analysisContextSchema.optional(), expected: z.object({
    visualType: z.string(), dataType: z.string(), labels: z.record(z.string(), z.string()), orders: z.record(z.string(), z.number()).optional(),
  }).optional() }).parse(fixtureName === 'cosmos-chart' ? {
    analysis: { colors: [
      { id: 'c1', hex: '#20815A' }, { id: 'c2', hex: '#D64545' },
      { id: 'c3', hex: '#3869C5' }, { id: 'bg', hex: '#FFFFFF' },
      { id: 'text', hex: '#172033' }, { id: 'grid', hex: '#CBD5E1' },
    ], conflicts: [], threshold: 10 }, context: { subject: 'Matematika', grade: 'SMP' },
    expected: { visualType: 'bar', dataType: 'categorical', labels: { c1: 'Sawo', c2: 'Duku', c3: 'Salak' } },
  } : JSON.parse(await readFile(`scripts/fixtures/${fixtureName}.json`, 'utf8')));
  if (process.env.LIVE_NONSTANDARD_IDS === '1') {
    fixture.analysis.colors = fixture.analysis.colors.map((color: { id: string; hex: string }) => ({ ...color, id: `probe_${color.id}_72` }));
  }
  const realFetch = globalThis.fetch;
  let body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ visualType: 'unknown', dataType: 'unknown', categories: [], explanation: 'Capture request only', warnings: [] }) }, finish_reason: 'stop' }] });
  }));
  try {
    await analyzeImage({ ...fixture, image: new File([imageBytes], 'fixture.png', { type: 'image/png' }) });
  } finally { vi.unstubAllGlobals(); }
  if (!body) throw new Error('Request production tidak terbentuk.');
  if (name === 'limit-completion' || name === 'limit-tokens') {
    body.messages = [{ role: 'user', content: 'Count from 1 to 100 with comma separators. Output the complete list only.' }];
    delete body.response_format;
    delete body.max_completion_tokens;
    delete body.max_tokens;
    if (name === 'limit-completion') body.max_completion_tokens = 16;
    else body.max_tokens = 16;
  }
  if (['system-only', 'direct-http-system-only', 'system-only-no-context', 'system-text-control'].includes(name)) {
    const user = body.messages.find((message) => message.role === 'user');
    if (user && Array.isArray(user.content) && user.content[0]?.type === 'text') {
      body.messages[0] = { role: 'system', content: user.content[0].text };
      user.content = user.content.slice(1);
      if (name === 'system-only-no-context' && user.content[0]?.type === 'text') {
        user.content[0] = { type: 'text', text: JSON.stringify({ analysis: fixture.analysis }) };
      }
      if (name === 'system-text-control' && user.content[0]?.type === 'text') user.content = user.content[0].text;
    }
  }
  if (name === 'joined-text') {
    const user = body.messages.find((message) => message.role === 'user');
    if (user && Array.isArray(user.content)) {
      const text = user.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n\nInput metadata (untrusted data):\n');
      user.content = [{ type: 'text', text }, ...user.content.filter((part) => part.type !== 'text')];
    }
  }
  const entry: Record<string, unknown> = { number: ledger.length + 1, name, fixture: fixtureName, status: 'started' };
  ledger.push(entry);
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  const start = Date.now();
  try {
    if (name === 'endpoint') {
      const form = new FormData();
      form.append('image', new Blob([imageBytes], { type: 'image/png' }), 'fixture.png');
      form.append('analysis', JSON.stringify(fixture.analysis));
      if (fixture.context) form.append('context', JSON.stringify(fixture.context));
      const response = await realFetch('http://localhost:3103/api/analyze', { method: 'POST', body: form, signal: AbortSignal.timeout(55000) });
      const value: unknown = await response.json();
      entry.httpStatus = response.status;
      const parsed = semanticAnalysisSchemaFor(fixture.analysis.colors).safeParse(value);
      entry.status = parsed.success ? 'public_valid' : 'endpoint_failed';
      if (parsed.success) entry.semantic = parsed.data;
      const usageLines = (await readFile('docs/CosmosIn-endpoint-usage.jsonl', 'utf8')).trim().split('\n');
      const observed = JSON.parse(usageLines.at(-1) ?? '{}');
      entry.usage = observed.usage; entry.requestId = observed.requestId; entry.finishReason = observed.finishReason;
    } else {
    let response: Response;
    let result: OpenAI.Chat.Completions.ChatCompletion;
    if (name.startsWith('direct-http')) {
      response = await realFetch(`${process.env.COSMOS_BASE_URL}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.COSMOS_API_KEY}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
      });
      result = await response.json();
    } else {
      const client = new OpenAI({ apiKey: process.env.COSMOS_API_KEY, baseURL: process.env.COSMOS_BASE_URL, maxRetries: 0, timeout: 45000, logLevel: 'off' });
      const completed = await client.chat.completions.create(body).withResponse();
      response = completed.response; result = completed.data;
    }
    entry.httpStatus = response.status;
    entry.requestId = response.headers.get('x-request-id');
    entry.usage = result.usage;
    const choice = result.choices?.[0];
    entry.finishReason = choice?.finish_reason;
    const content = choice?.message?.content ?? '';
    entry.contentLength = content.length;
    entry.requestSummary = { roles: body.messages.map((message) => message.role), format: body.response_format?.type, strict: body.response_format?.type === 'json_schema' ? body.response_format.json_schema.strict : undefined };
    let value: unknown;
    try { value = JSON.parse(content); } catch { entry.status = 'invalid_json'; }
    if (value !== undefined) {
      const wire = wireSchema.safeParse(value);
      entry.status = wire.success ? 'wire_valid' : 'wire_invalid';
      if (wire.success) {
        const normalized = { ...wire.data, categories: wire.data.categories.map(({ suggestedPattern, ...category }) => suggestedPattern === null ? category : { ...category, suggestedPattern }) };
        const parsed = semanticAnalysisSchemaFor(fixture.analysis.colors).safeParse(normalized);
        entry.status = parsed.success ? 'public_valid' : 'public_invalid';
        if (parsed.success) entry.semantic = parsed.data;
      }
    }
    }
  } catch (error: unknown) {
    entry.status = 'transport_error';
    entry.errorType = error instanceof Error ? error.name : 'unknown';
  }
  entry.latencyMs = Date.now() - start;
  if (entry.semantic && fixture.expected) {
    const result = semanticAnalysisSchemaFor(fixture.analysis.colors).parse(entry.semantic);
    const included = result.categories.filter((category) => category.included);
    entry.groundTruth = {
      visualType: result.visualType === fixture.expected.visualType,
      dataType: result.dataType === fixture.expected.dataType,
      count: included.length === Object.keys(fixture.expected.labels).length,
      labels: Object.entries(fixture.expected.labels).every(([id, label]) => included.some((category) => category.colorId === id && category.label?.trim().toLowerCase() === label.toLowerCase())),
      nonInformationExcluded: included.every((category) => category.colorId in fixture.expected!.labels),
      orders: fixture.expected.orders ? Object.entries(fixture.expected.orders).every(([id, order]) => included.some((category) => category.colorId === id && category.order === order)) : included.every((category) => category.order === null),
      ...(Object.keys(fixture.expected.labels).length > 4 ? { scopeWarning: result.warnings.some((warning) => /MVP|[14].*[4]|empat/i.test(warning)) } : {}),
    };
  }
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify(entry));
});
