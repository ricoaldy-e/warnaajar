// Data sintetis khusus test, bukan hasil produksi atau hasil eksperimen.
import type { ColorAnalysisResult, SemanticAnalysis, VerificationQuestion, VerificationResult } from '@/types';

export const analysis: ColorAnalysisResult = {
  colors: [{ id: 'c1', hex: '#20815A' }, { id: 'c2', hex: '#D64545' }, { id: 'bg', hex: '#FFFFFF' }],
  conflicts: [{ colorAId: 'c1', colorBId: 'c2', mode: 'deutan', deltaE: 4.2 }],
  threshold: 10,
};
export const semantic: SemanticAnalysis = {
  visualType: 'bar', dataType: 'categorical',
  categories: [
    { colorId: 'c1', label: 'Sawo', included: true, order: null, suggestedPattern: 'diagonal' },
    { colorId: 'c2', label: 'Duku', included: true, order: null },
    { colorId: 'bg', label: 'Latar', included: false, order: null },
  ],
  explanation: 'Kategori bergantung pada warna.', warnings: [],
};
export const mapping = { dataType: 'categorical' as const, categories: semantic.categories };
export const questions: VerificationQuestion[] = [
  { id: 'q1', question: 'Batang mana yang merupakan sawo?', expectedAnswer: 'A' },
  { id: 'q2', question: 'Batang mana yang merupakan duku?', expectedAnswer: 'B' },
];
export const verification: VerificationResult = {
  mode: 'deutan',
  items: questions.map((question) => ({
    question,
    before: { answer: null, status: 'uncertain' },
    after: { answer: question.expectedAnswer, status: 'correct' },
  })),
  warnings: [],
};
