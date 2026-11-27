// @vitest-environment node
// Decode nyata di Chromium (Playwright), bukan mock. Butuh `npx playwright install chromium`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePng, sampleRgba } from './image-fixtures';

interface DecodeOutcome {
  width?: number;
  height?: number;
  data?: number[];
  errorName?: string;
  code?: string;
}

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const source = readFileSync(fileURLToPath(new URL('../decode.ts', import.meta.url)), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.addScriptTag({
    type: 'module',
    content: `${js}\nglobalThis.__colorAnalysis = { decodeImage };`,
  });
  await page.waitForFunction(() => '__colorAnalysis' in globalThis);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

// Berjalan di halaman: decode byte dengan MIME tertentu.
function decodeInPage(bytes: Uint8Array, type: string): Promise<DecodeOutcome> {
  return page.evaluate(
    async ({ bytes, type }) => {
      const { decodeImage } = (globalThis as unknown as {
        __colorAnalysis: { decodeImage: (b: Blob) => Promise<ImageData> };
      }).__colorAnalysis;
      try {
        const image = await decodeImage(new Blob([new Uint8Array(bytes)], { type }));
        return { width: image.width, height: image.height, data: Array.from(image.data) };
      } catch (e) {
        const error = e as { name?: string; code?: string };
        return { errorName: error.name, code: error.code };
      }
    },
    { bytes: Array.from(bytes), type },
  );
}

describe('decodeImage — browser asli', () => {
  it('mendecode PNG valid dengan dimensi dan RGBA asli', async () => {
    const { width, height, rgba } = sampleRgba();
    const result = await decodeInPage(encodePng(width, height, rgba), 'image/png');
    expect(result.errorName).toBeUndefined();
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    const data = result.data ?? [];
    expect(data).toHaveLength(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      const alpha = rgba[i + 3];
      expect(data[i + 3]).toBe(alpha);
      if (alpha === 255) {
        expect(data.slice(i, i + 3)).toEqual(Array.from(rgba.subarray(i, i + 3)));
      } else if (alpha > 0) {
        // Canvas menyimpan premultiplied; piksel semi-transparan bisa bergeser sedikit.
        for (let c = 0; c < 3; c++) expect(Math.abs(data[i + c] - rgba[i + c])).toBeLessThanOrEqual(2);
      }
    }
  });

  it('mendecode JPEG valid dengan dimensi asli dan warna mendekati sumber', async () => {
    const result = await page.evaluate(async () => {
      const { decodeImage } = (globalThis as unknown as {
        __colorAnalysis: { decodeImage: (b: Blob) => Promise<ImageData> };
      }).__colorAnalysis;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.fillStyle = '#CD4949';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#45934F';
      ctx.fillRect(32, 0, 32, 32);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
      if (!blob || blob.type !== 'image/jpeg') throw new Error('encoder JPEG tidak tersedia');
      const image = await decodeImage(blob);
      const at = (x: number, y: number) => Array.from(image.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
      return { width: image.width, height: image.height, left: at(16, 16), right: at(48, 16) };
    });
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    const close = (actual: number[], expected: number[]) => {
      expected.forEach((v, i) => expect(Math.abs(actual[i] - v)).toBeLessThanOrEqual(8));
      expect(actual[3]).toBe(255);
    };
    close(result.left, [0xcd, 0x49, 0x49]);
    close(result.right, [0x45, 0x93, 0x4f]);
  });

  it('menolak PNG terpotong walau signature dan header valid', async () => {
    const { width, height, rgba } = sampleRgba();
    const png = encodePng(width, height, rgba);
    const result = await decodeInPage(png.subarray(0, 40), 'image/png');
    expect(result).toEqual({ errorName: 'ImageDecodeError', code: 'DECODE_FAILED' });
  });

  it('tidak mengubah blob sumber dan setiap hasil adalah salinan terpisah', async () => {
    const { width, height, rgba } = sampleRgba();
    const result = await page.evaluate(
      async (bytes) => {
        const { decodeImage } = (globalThis as unknown as {
          __colorAnalysis: { decodeImage: (b: Blob) => Promise<ImageData> };
        }).__colorAnalysis;
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
        const first = await decodeImage(blob);
        first.data[0] = (first.data[0] + 1) % 256;
        const second = await decodeImage(blob);
        const after = Array.from(new Uint8Array(await blob.arrayBuffer()));
        return { after, firstValue: first.data[0], secondValue: second.data[0], size: blob.size, type: blob.type };
      },
      Array.from(encodePng(width, height, rgba)),
    );
    const original = Array.from(encodePng(width, height, rgba));
    expect(result.after).toEqual(original);
    expect(result.size).toBe(original.length);
    expect(result.type).toBe('image/png');
    expect(result.secondValue).toBe(rgba[0]);
    expect(result.firstValue).toBe((rgba[0] + 1) % 256);
  });
});
