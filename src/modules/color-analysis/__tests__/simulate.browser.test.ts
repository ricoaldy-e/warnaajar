// @vitest-environment node
// simulateCvd di Chromium asli (Playwright): ImageData nyata, putImageData, dan export PNG
// (jalur yang dipakai Modul 4 untuk preview dan gambar Uji Terbaca). Butuh `npx playwright install chromium`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CvdMode } from '@/types';

const transpile = (file: string) =>
  ts.transpileModule(readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  // Dua modul tanpa import runtime; masing-masing disuntikkan sebagai module script.
  await page.addScriptTag({ type: 'module', content: `${transpile('../decode.ts')}\nglobalThis.__decode = { decodeImage };` });
  await page.addScriptTag({ type: 'module', content: `${transpile('../simulate.ts')}\nglobalThis.__simulate = { simulateCvd };` });
  await page.waitForFunction(() => '__decode' in globalThis && '__simulate' in globalThis);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

interface ModeOutcome {
  isImageData: boolean;
  width: number;
  height: number;
  colorSpace: string;
  alphaKept: boolean;
  canvasRoundTrip: boolean;
  png: { type: string; width: number; height: number; alphaKept: boolean; opaqueRgbKept: boolean };
}

describe('simulateCvd — browser asli', () => {
  it.each(['normal', 'protan', 'deutan', 'tritan', 'grayscale'] satisfies CvdMode[])(
    'mode %s: ImageData nyata, dapat di-putImageData dan diekspor ke PNG tanpa mengubah dimensi/alpha',
    async (mode) => {
      const result: ModeOutcome = await page.evaluate(async (mode) => {
        const { simulateCvd } = (globalThis as unknown as {
          __simulate: { simulateCvd: (s: ImageData, m: string) => ImageData };
        }).__simulate;
        const { decodeImage } = (globalThis as unknown as {
          __decode: { decodeImage: (b: Blob) => Promise<ImageData> };
        }).__decode;
        // 6×5: warna primer/sekunder/netral; baris terakhir alpha 0, 1, 127, 128, 255, 255.
        const width = 6;
        const height = 5;
        const source = new ImageData(width, height);
        const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 0, 255], [255, 255, 0], [0, 0, 0], [255, 255, 255], [128, 128, 128], [205, 73, 73], [69, 147, 79], [228, 195, 77]];
        const alphas = [0, 1, 127, 128, 255, 255];
        for (let i = 0; i < width * height; i++) {
          const y = Math.floor(i / width);
          source.data.set([...colors[i % colors.length], y === height - 1 ? alphas[i % width] : 255], i * 4);
        }
        const out = simulateCvd(source, mode);
        const alphaKept = (a: Uint8ClampedArray) => a.every((v, i) => i % 4 !== 3 || v === source.data[i]);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.putImageData(out, 0, 0);
        // Canvas menyimpan premultiplied: bandingkan RGB hanya pada piksel opak.
        const back = ctx.getImageData(0, 0, width, height).data;
        const canvasRoundTrip = alphaKept(back) && back.every((v, i) => out.data[i - (i % 4) + 3] !== 255 || v === out.data[i]);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('export PNG gagal');
        const decoded = await decodeImage(blob);
        return {
          isImageData: out instanceof ImageData,
          width: out.width,
          height: out.height,
          colorSpace: out.colorSpace,
          alphaKept: alphaKept(out.data),
          canvasRoundTrip,
          png: {
            type: blob.type,
            width: decoded.width,
            height: decoded.height,
            alphaKept: alphaKept(decoded.data),
            opaqueRgbKept: decoded.data.every((v, i) => out.data[i - (i % 4) + 3] !== 255 || v === out.data[i]),
          },
        };
      }, mode);

      expect(result).toEqual({
        isImageData: true,
        width: 6,
        height: 5,
        colorSpace: 'srgb',
        alphaKept: true,
        canvasRoundTrip: true,
        png: { type: 'image/png', width: 6, height: 5, alphaKept: true, opaqueRgbKept: true },
      });
    },
  );
});
