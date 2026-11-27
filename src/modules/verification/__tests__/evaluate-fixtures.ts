import { questions } from '@/modules/ai-analysis/__tests__/fixtures';

// Signature PNG sintetis hanya untuk test transport/parser, bukan live vision.
export const beforeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 17]);
export const afterBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 23]);
export const beforeImage = () => new File([beforeBytes], 'fixture.png', { type: 'image/png' });
export const afterImage = () => new File([afterBytes], 'fixture.png', { type: 'image/png' });
export const answers = questions.map((question) => ({ id: question.id, answer: question.expectedAnswer }));
export const answeringReply = (value: unknown = { answers }) => Response.json({ choices: [{
  message: { content: JSON.stringify(value), refusal: null }, finish_reason: 'stop',
}] });
export function evaluateForm() {
  const form = new FormData();
  form.append('action', 'evaluate'); form.append('before', beforeImage()); form.append('after', afterImage());
  form.append('mode', 'deutan'); form.append('questions', JSON.stringify(questions));
  return form;
}
