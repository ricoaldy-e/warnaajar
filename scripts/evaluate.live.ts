import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { it } from 'vitest';
import { z } from 'zod';
import { verificationQuestionsSchema, verificationResultSchemaFor } from '../src/modules/verification/schemas';
import { simulatedModeSchema } from '../src/modules/ai-analysis/schemas';

// Audit live eksplisit, terpisah dari npm test dan budget fase sebelumnya.
it('Phase 5 live evaluate dengan maksimal dua puluh model calls', async () => {
  if (process.env.COSMOS_EVALUATE_LIVE_APPROVED !== '1') throw new Error('Live belum diaktifkan.');
  const ledgerPath = 'docs/CosmosIn-Phase-5-live-results.json';
  const usagePath = 'docs/CosmosIn-Phase-5-usage.jsonl';
  const ledger: Record<string, unknown>[] = JSON.parse(await readFile(ledgerPath, 'utf8'));
  if (ledger.length * 2 + 2 > 20) throw new Error('Budget Phase 5 habis.');
  const name = process.env.EVALUATE_FIXTURE ?? 'two';
  if (!['two', 'four', 'ordinal'].includes(name)) throw new Error('Fixture tidak diizinkan.');
  const mode = simulatedModeSchema.parse(process.env.EVALUATE_MODE ?? 'deutan');
  const { questions } = z.object({ questions: verificationQuestionsSchema }).parse(JSON.parse(await readFile(`scripts/fixtures/evaluate/${name}.json`, 'utf8')));
  const before = await readFile(`scripts/fixtures/evaluate/${name}-${mode}-before.png`);
  const after = await readFile(`scripts/fixtures/evaluate/${name}-${mode}-after.png`);
  const usageBefore = (await readFile(usagePath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length;
  const entry: Record<string, unknown> = { number: ledger.length + 1, fixture: name, mode, reservedModelCalls: 2, status: 'started' };
  ledger.push(entry); await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  const start = Date.now();
  try {
    const form = new FormData();
    form.append('action', 'evaluate'); form.append('mode', mode);
    form.append('before', new Blob([before], { type: 'image/png' }), 'fixture.png');
    form.append('after', new Blob([after], { type: 'image/png' }), 'fixture.png');
    form.append('questions', JSON.stringify(questions));
    const response = await fetch('http://localhost:3105/api/verify', { method: 'POST', body: form, signal: AbortSignal.timeout(55000) });
    const body: unknown = await response.json(); entry.httpStatus = response.status;
    const parsed = verificationResultSchemaFor(mode, questions).safeParse(body);
    if (parsed.success) {
      entry.status = 'public_valid'; entry.result = parsed.data;
      const norm = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('id-ID');
      entry.scoringVerified = parsed.data.items.every(({ question, before, after }) => [before, after].every(({ answer, status }) =>
        status === (answer === null ? 'uncertain' : norm(answer) === norm(question.expectedAnswer) ? 'correct' : 'incorrect')));
      entry.counts = {
        beforeCorrect: parsed.data.items.filter((item) => item.before.status === 'correct').length,
        afterCorrect: parsed.data.items.filter((item) => item.after.status === 'correct').length,
        beforeUncertain: parsed.data.items.filter((item) => item.before.status === 'uncertain').length,
        afterUncertain: parsed.data.items.filter((item) => item.after.status === 'uncertain').length,
        total: questions.length,
      };
    } else { entry.status = 'public_error'; entry.error = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).parse(body).error; }
    const lines = (await readFile(usagePath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).slice(usageBefore);
    const calls = lines.map((line) => JSON.parse(line));
    entry.providerResponses = calls.filter((call) => !call.transportError).length; entry.calls = calls;
    const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    const dto = JSON.stringify({ questions: questions.map(({ id, question }) => ({ id, question })) });
    entry.blindAuditPassed = calls.length === 2 && calls.every((call) =>
      call.blindAudit?.hasExpectedAnswer === false && call.blindAudit.imageCount === 1 &&
      JSON.stringify(call.blindAudit.metadataKeys) === '["questions"]' && JSON.stringify(call.blindAudit.questionFields) === '["id","question"]' &&
      call.blindAudit.questionsSha256 === hash(dto)) && calls[0].blindAudit.instructionSha256 === calls[1].blindAudit.instructionSha256 &&
      [hash(before), hash(after)].every((expected) => calls.some((call) => call.blindAudit.imageSha256 === expected));
  } catch (error: unknown) { entry.status = 'transport_error'; entry.errorType = error instanceof Error ? error.name : 'unknown'; }
  entry.latencyMs = Date.now() - start;
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify(entry));
});
