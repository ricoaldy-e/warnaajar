import { readFile, writeFile } from 'node:fs/promises';
import { it } from 'vitest';
import { z } from 'zod';
import { confirmedMappingSchema } from '../src/modules/ai-analysis/schemas';
import { verificationQuestionsSchema } from '../src/modules/verification/schemas';

// Runner live eksplisit: tidak cocok *.test.ts dan tidak masuk npm test.
it('Phase 4 live endpoint, maksimal sepuluh model call', async () => {
  if (process.env.COSMOS_PREPARE_LIVE_APPROVED !== '1') throw new Error('Live belum diaktifkan.');
  const ledgerPath = 'docs/CosmosIn-Phase-4-live-results.json';
  const usagePath = 'docs/CosmosIn-Phase-4-usage.jsonl';
  const ledger: Record<string, unknown>[] = JSON.parse(await readFile(ledgerPath, 'utf8'));
  if (ledger.length >= 10) throw new Error('Budget Phase 4 habis.');
  const fixture = process.env.PREPARE_FIXTURE ?? 'semantic-two';
  if (!['semantic-two', 'semantic-four', 'prepare-ordinal-map', 'prepare-insufficient'].includes(fixture)) throw new Error('Fixture tidak diizinkan.');
  const metadata: unknown = JSON.parse(await readFile(`scripts/fixtures/${fixture}.json`, 'utf8'));
  let mapping: z.output<typeof confirmedMappingSchema>;
  if (fixture.startsWith('semantic-')) {
    const source = z.object({ expected: z.object({ labels: z.record(z.string(), z.string()) }) }).parse(metadata);
    mapping = confirmedMappingSchema.parse({ dataType: 'categorical', categories: [
      ...Object.entries(source.expected.labels).map(([colorId, label]) => ({ colorId, label, included: true, order: null })),
      { colorId: 'background_72', label: null, included: false, order: null },
      { colorId: 'text_72', label: null, included: false, order: null },
    ] });
  } else mapping = z.object({ mapping: confirmedMappingSchema }).parse(metadata).mapping;
  const image = await readFile(`scripts/fixtures/${fixture}.png`);
  const usageBefore = (await readFile(usagePath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length;
  const entry: Record<string, unknown> = { number: ledger.length + 1, fixture, status: 'started' };
  ledger.push(entry);
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  const start = Date.now();
  try {
    const form = new FormData();
    form.append('action', 'prepare');
    form.append('image', new Blob([image], { type: 'image/png' }), 'fixture.png');
    form.append('mapping', JSON.stringify(mapping));
    const response = await fetch('http://localhost:3104/api/verify', { method: 'POST', body: form, signal: AbortSignal.timeout(55000) });
    const body: unknown = await response.json();
    entry.httpStatus = response.status;
    const parsed = verificationQuestionsSchema.safeParse(body);
    if (parsed.success) { entry.status = 'public_valid'; entry.questions = parsed.data; }
    else {
      entry.status = 'public_error';
      entry.error = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).parse(body).error;
    }
    const lines = (await readFile(usagePath, 'utf8')).trim().split('\n').filter(Boolean);
    entry.providerCalls = lines.length - usageBefore;
    const usage = JSON.parse(lines.at(-1) ?? '{}');
    entry.usage = usage.usage; entry.requestId = usage.requestId; entry.finishReason = usage.finishReason;
  } catch (error: unknown) {
    entry.status = 'transport_error'; entry.errorType = error instanceof Error ? error.name : 'unknown';
  }
  entry.latencyMs = Date.now() - start;
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify(entry));
});
