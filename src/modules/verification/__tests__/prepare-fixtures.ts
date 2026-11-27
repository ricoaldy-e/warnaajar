import { mapping } from '@/modules/ai-analysis/__tests__/fixtures';
import { sourceImage } from '@/modules/ai-analysis/__tests__/analyze-fixtures';

// Fixture dan kunci untuk mock, bukan hasil live provider.
export const wireQuestions = [
  { question: 'Batang mana yang mewakili Sawo?', expectedAnswer: 'C' },
  { question: 'Berapa jumlah panen Duku?', expectedAnswer: '4' },
];
export const wirePreparation = { status: 'ok', questions: wireQuestions };
export const publicQuestions = wireQuestions.map((question, index) => ({ id: `q${index + 1}`, ...question }));
export const preparationReply = (value: unknown = wirePreparation) => Response.json({ choices: [{
  message: { content: JSON.stringify(value), refusal: null }, finish_reason: 'stop',
}] });
export function prepareForm() {
  const form = new FormData();
  form.append('action', 'prepare'); form.append('image', sourceImage());
  form.append('mapping', JSON.stringify(mapping));
  return form;
}
