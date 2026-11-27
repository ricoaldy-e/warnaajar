import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicite, terpisah dari npm test; tidak ada request live pada suite otomatis.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: { environment: 'node', include: ['scripts/cosmos.live.ts'], testTimeout: 60000 },
});
