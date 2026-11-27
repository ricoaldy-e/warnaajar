import type { VerifiedAnswer } from '@/types';

export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('id-ID');
}

export function scoreAnswer(answer: string | null, expectedAnswer: string): VerifiedAnswer {
  return {
    answer,
    status: answer === null ? 'uncertain' :
      normalizeAnswer(answer) === normalizeAnswer(expectedAnswer) ? 'correct' : 'incorrect',
  };
}
