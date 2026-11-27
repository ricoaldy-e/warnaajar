import { expect, it } from 'vitest';
import { normalizeAnswer, scoreAnswer } from '../scoring';

it.each([
  ['Apel', 'Apel', 'correct'], ['apel', 'Apel', 'correct'], [' B ', 'B', 'correct'],
  [' 40\n\t kg ', '40 kg', 'correct'], ['Cafe\u0301', 'Café', 'correct'],
  ['40', '40', 'correct'], ['20', '40', 'incorrect'], [null, 'Jeruk', 'uncertain'],
  ['40 g', '40 kg', 'incorrect'], ['-40', '40', 'incorrect'], ['-40', '-40', 'correct'],
  ['4.0', '40', 'incorrect'], ['4,5', '4.5', 'incorrect'], ['>40', '<40', 'incorrect'],
  ['Apel atau Jeruk', 'Apel', 'incorrect'], ['Batang B', 'B', 'incorrect'],
  ['forty', '40', 'incorrect'], ['４０', '40', 'incorrect'],
] as const)('score %s dibandingkan %s = %s', (answer, expected, status) => {
  expect(scoreAnswer(answer, expected)).toEqual({ answer, status });
});

it('normalisasi hanya Unicode NFC, whitespace dan kapitalisasi', () => {
  expect(normalizeAnswer(' \t -4.5  KG >=  2\n')).toBe('-4.5 kg >= 2');
});
