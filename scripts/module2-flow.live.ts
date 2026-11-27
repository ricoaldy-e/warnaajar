import { readFile, writeFile } from 'node:fs/promises';
import { it } from 'vitest';
import { z } from 'zod';
import { colorAnalysisSchema, confirmedMappingSchema, semanticAnalysisSchemaFor, simulatedModeSchema } from '../src/modules/ai-analysis/schemas';
import { verificationQuestionsSchema, verificationResultSchemaFor } from '../src/modules/verification/schemas';

// Runner API berurutan. Review ground truth dilakukan di antara tahap, bukan AI call tambahan.
it('Module 2 full API flow manual dalam budget 16 model calls', async () => {
  if (process.env.COSMOS_MODULE2_FLOW_APPROVED !== '1') throw new Error('Live belum diaktifkan.');
  const ledgerPath = 'docs/Module-2-Phase-6-ledger.json', flowPath = 'docs/Module-2-Phase-6-flow.json';
  const usagePath = 'docs/Module-2-Phase-6-usage.jsonl';
  const ledger: Record<string, unknown>[] = JSON.parse(await readFile(ledgerPath, 'utf8'));
  const flow: Record<string, unknown> = JSON.parse(await readFile(flowPath, 'utf8'));
  const step = z.enum(['analyze', 'prepare', 'evaluate']).parse(process.env.MODULE2_FLOW_STEP);
  const reserved = step === 'evaluate' ? 2 : 1;
  if (ledger.reduce((sum, entry) => sum + Number(entry.reservedModelCalls), 0) + reserved > 16) throw new Error('Budget Phase 6 habis.');
  const mode = step === 'evaluate' ? simulatedModeSchema.parse(process.env.MODULE2_FLOW_MODE) : undefined;
  const form = new FormData();
  const analysis = colorAnalysisSchema.parse(flow.analysis);
  if (step === 'analyze' || step === 'prepare') {
    form.append('image', new Blob([await readFile('scripts/fixtures/phase6/source-normal.png')], { type: 'image/png' }), 'source.png');
  }
  if (step === 'analyze') form.append('analysis', JSON.stringify(analysis));
  if (step === 'prepare') {
    if (flow.mappingReviewed !== true) throw new Error('Mapping belum direview terhadap fixture.');
    form.append('action', 'prepare'); form.append('mapping', JSON.stringify(confirmedMappingSchema.parse(flow.mapping)));
  }
  const questions = step === 'evaluate' ? verificationQuestionsSchema.parse(flow.questions) : undefined;
  if (step === 'evaluate' && mode && questions) {
    if (flow.questionsReviewed !== true) throw new Error('Pertanyaan/kunci belum direview.');
    form.append('action', 'evaluate'); form.append('mode', mode); form.append('questions', JSON.stringify(questions));
    for (const side of ['before', 'after']) form.append(side,
      new Blob([await readFile(`scripts/fixtures/phase6/${mode}-${side}.png`)], { type: 'image/png' }), 'fixture.png');
  }
  const observedBefore = (await readFile(usagePath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length;
  const entry: Record<string, unknown> = { number: ledger.length + 1, step, mode, reservedModelCalls: reserved, status: 'started' };
  ledger.push(entry); await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  const start = Date.now();
  try {
    const response = await fetch(`http://localhost:3106/api/${step === 'analyze' ? 'analyze' : 'verify'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(55000) });
    const body: unknown = await response.json(); entry.httpStatus = response.status;
    if (!response.ok) { entry.status = 'public_error'; entry.error = body; }
    else {
      if (step === 'analyze') flow.semantic = semanticAnalysisSchemaFor(analysis.colors).parse(body);
      if (step === 'prepare') flow.questions = verificationQuestionsSchema.parse(body);
      if (step === 'evaluate' && mode && questions) {
        const result = verificationResultSchemaFor(mode, questions).parse(body);
        const results = z.record(z.string(), z.unknown()).parse(flow.verification ?? {});
        results[mode] = result; flow.verification = results;
        entry.counts = { total: result.items.length,
          beforeCorrect: result.items.filter((item) => item.before.status === 'correct').length,
          afterCorrect: result.items.filter((item) => item.after.status === 'correct').length,
          beforeUncertain: result.items.filter((item) => item.before.status === 'uncertain').length,
          afterUncertain: result.items.filter((item) => item.after.status === 'uncertain').length,
        };
      }
      entry.status = 'public_valid';
    }
  } catch (error: unknown) { entry.status = 'request_or_validation_error'; entry.errorType = error instanceof Error ? error.name : 'unknown'; }
  const lines = (await readFile(usagePath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).slice(observedBefore);
  entry.calls = lines.map((line) => JSON.parse(line)); entry.providerResponses = lines.length;
  entry.latencyMs = Date.now() - start;
  await writeFile(flowPath, JSON.stringify(flow, null, 2));
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  if (entry.status !== 'public_valid') throw new Error(`Flow ${step} gagal; periksa ledger aman.`);
});
