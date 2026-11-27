// @vitest-environment node
import { expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { VerificationItem, VerificationQuestion, VerificationResult, VerifiedAnswer } from '@/types';
import {
  verificationItemSchema, verificationQuestionSchema, verificationQuestionsSchema,
  verificationResultSchema, verificationResultSchemaFor, verifiedAnswerSchema,
} from '../schemas';
import { questions, verification } from '@/modules/ai-analysis/__tests__/fixtures';

it('schema verification sesuai shared types', () => {
  expectTypeOf<z.output<typeof verificationQuestionSchema>>().toEqualTypeOf<VerificationQuestion>();
  expectTypeOf<z.output<typeof verifiedAnswerSchema>>().toEqualTypeOf<VerifiedAnswer>();
  expectTypeOf<z.output<typeof verificationItemSchema>>().toEqualTypeOf<VerificationItem>();
  expectTypeOf<z.output<typeof verificationResultSchema>>().toEqualTypeOf<VerificationResult>();
});

it('menerima set pertanyaan serta hasil aktual dengan uncertain', () => {
  expect(verificationQuestionsSchema.parse(questions)).toEqual(questions);
  expect(verificationResultSchemaFor('deutan', questions).parse(verification)).toEqual(verification);
});

it.each([
  [], [questions[0]], [...questions, ...questions],
  [questions[0], { ...questions[1], id: 'q1' }],
  [questions[0], { ...questions[1], question: questions[0].question.toUpperCase() }],
  [questions[0], { ...questions[1], expectedAnswer: '' }],
  [questions[0], { ...questions[1], question: ' ' }],
])('menolak jumlah, ID, redaksi, atau kunci invalid (%#)', (value) => {
  expect(verificationQuestionsSchema.safeParse(value).success).toBe(false);
});

it.each([
  { answer: null, status: 'correct' }, { answer: null, status: 'incorrect' },
  { answer: 'A', status: 'passed' }, { answer: ' ', status: 'uncertain' },
])('menolak jawaban/status tidak konsisten (%#)', (value) => {
  expect(verifiedAnswerSchema.safeParse(value).success).toBe(false);
});

it.each([
  { ...verification, mode: 'normal' }, { ...verification, items: [] },
  { ...verification, items: [verification.items[0], verification.items[0]] },
  { ...verification, items: [{ ...verification.items[0], after: { answer: null, status: 'correct' } }, verification.items[1]] },
])('menolak hasil invalid (%#)', (value) => {
  expect(verificationResultSchema.safeParse(value).success).toBe(false);
});

it.each([
  { ...verification, mode: 'protan' },
  { ...verification, items: [{ ...verification.items[0], question: { ...questions[0], id: 'invented' } }, verification.items[1]] },
  { ...verification, items: [{ ...verification.items[0], question: { ...questions[0], question: 'Pertanyaan baru?' } }, verification.items[1]] },
  { ...verification, items: [{ ...verification.items[0], question: { ...questions[0], expectedAnswer: 'Kunci baru' } }, verification.items[1]] },
])('menolak perubahan mode, ID, pertanyaan, atau kunci request (%#)', (value) => {
  expect(verificationResultSchemaFor('deutan', questions).safeParse(value).success).toBe(false);
});
