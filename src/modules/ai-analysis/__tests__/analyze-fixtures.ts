import { readFileSync } from 'node:fs';
import { analysis, semantic } from './fixtures';

// PNG buatan sendiri dari POC; hanya untuk test, tanpa respons produksi palsu.
export const imageBytes = readFileSync(new URL('../../../../scripts/fixtures/cosmos-chart.png', import.meta.url));
export const sourceImage = () => new File([new Uint8Array(imageBytes)], 'source.png', { type: 'image/png' });
export const wireSemantic = {
  ...semantic,
  categories: semantic.categories.map((category) => ({ ...category, suggestedPattern: category.suggestedPattern ?? null })),
};

export function analyzeForm() {
  const form = new FormData();
  form.append('image', sourceImage());
  form.append('analysis', JSON.stringify(analysis));
  return form;
}

export function providerReply(value: unknown = wireSemantic) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(value), refusal: null }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}
