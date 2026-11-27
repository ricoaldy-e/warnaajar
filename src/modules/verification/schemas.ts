import { z } from 'zod';
import type { SimulatedMode, VerificationItem, VerificationQuestion, VerificationResult, VerifiedAnswer } from '@/types';
import { simulatedModeSchema } from '@/modules/ai-analysis/schemas';

const nonempty = z.string().min(1).refine((value) => value.trim().length > 0);
export const verificationQuestionSchema = z.strictObject({
  id: nonempty,
  question: nonempty,
  expectedAnswer: nonempty,
}) satisfies z.ZodType<VerificationQuestion>;

export const verificationQuestionsSchema = z.array(verificationQuestionSchema).min(2).max(3)
  .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length, {
    message: 'ID pertanyaan duplikat.',
  }).refine((questions) => new Set(questions.map((item) =>
    item.question.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID'))).size === questions.length, {
    message: 'Pertanyaan duplikat.',
  });

// Object root untuk SDK strict; ID publik dibuat server, bukan model.
export const preparationWireSchema = z.strictObject({
  status: z.enum(['ok', 'insufficient_evidence']),
  questions: z.array(verificationQuestionSchema.omit({ id: true })),
}).refine((value) => value.status === 'insufficient_evidence'
  ? value.questions.length === 0
  : verificationQuestionsSchema.safeParse(value.questions.map((question, index) => ({
    ...question, id: `q${index + 1}`,
  }))).success, { path: ['questions'], message: 'Status dan daftar pertanyaan tidak konsisten.' });

export function answeringWireSchemaFor(questions: readonly Pick<VerificationQuestion, 'id'>[]) {
  const ids = new Set(questions.map((question) => question.id));
  return z.strictObject({
    answers: z.array(z.strictObject({ id: nonempty, answer: nonempty.nullable() })),
  }).refine((value) => value.answers.length === ids.size &&
    new Set(value.answers.map((answer) => answer.id)).size === ids.size &&
    value.answers.every((answer) => ids.has(answer.id)), {
    path: ['answers'], message: 'ID jawaban harus unik dan lengkap sesuai pertanyaan.',
  });
}

export const verifiedAnswerSchema = z.strictObject({
  answer: nonempty.nullable(),
  status: z.enum(['correct', 'incorrect', 'uncertain']),
}).refine((value) => value.answer !== null || value.status === 'uncertain', {
  message: 'Jawaban kosong hanya dapat berstatus uncertain.',
}) satisfies z.ZodType<VerifiedAnswer>;

export const verificationItemSchema = z.strictObject({
  question: verificationQuestionSchema,
  before: verifiedAnswerSchema,
  after: verifiedAnswerSchema,
}) satisfies z.ZodType<VerificationItem>;

export const verificationResultSchema = z.strictObject({
  mode: simulatedModeSchema,
  items: z.array(verificationItemSchema).min(2).max(3),
  warnings: z.array(nonempty),
}).refine((value) => verificationQuestionsSchema.safeParse(value.items.map((item) => item.question)).success, {
  message: 'Set pertanyaan hasil tidak valid.', path: ['items'],
}) satisfies z.ZodType<VerificationResult>;

export function verificationResultSchemaFor(mode: SimulatedMode, questions: readonly VerificationQuestion[]) {
  return verificationResultSchema.refine((result) => {
    if (result.mode !== mode || result.items.length !== questions.length) return false;
    return result.items.every((item) => questions.some((question) =>
      item.question.id === question.id && item.question.question === question.question &&
      item.question.expectedAnswer === question.expectedAnswer));
  }, { message: 'Mode, pertanyaan, dan kunci harus sama dengan request.' });
}
