// @vitest-environment node
// Regresi audit: diagram di-encode sebagai JPEG/PNG oleh Chromium asli (Playwright), di-decode dengan
// decodeImage modul ini, lalu diekstraksi di Node. Fixture sintetis buatan test, bukan data produksi.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { differenceEuclidean } from 'culori';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ColorSwatch } from '@/types';
import { extractColors } from '..';

const distance = differenceEuclidean('oklab');
const WIDTH = 1000;
const HEIGHT = 600;
const SMALL = '#E6AB02';
const CATEGORIES = ['#FFFFFF', '#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E', '#A6761D', '#666666', '#1F78B4', '#FB9A99'];

interface ChartOptions {
  /** Kualitas JPEG 0–1, atau null untuk PNG. */
  quality: number | null;
  categories: number;
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
  await page.addScriptTag({ type: 'module', content: `${js}\nglobalThis.__colorAnalysis = { decodeImage };` });
  await page.waitForFunction(() => '__colorAnalysis' in globalThis);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * Kasus audit: kolom kategori selebar sama, kotak legenda SMALL 39×39 px (±0,25% gambar),
 * dan label hitam pendek "K0", "K1", ... di setiap kolom.
 */
async function renderChart({ quality, categories }: ChartOptions): Promise<ImageData> {
  const base64 = await page.evaluate(
    async ({ quality, colors, small, width, height }) => {
      const { decodeImage } = (globalThis as unknown as {
        __colorAnalysis: { decodeImage: (b: Blob) => Promise<ImageData> };
      }).__colorAnalysis;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      colors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect((i * width) / colors.length, 0, width / colors.length, height);
      });
      ctx.fillStyle = small;
      ctx.fillRect(40, 40, 39, 39);
      ctx.fillStyle = '#000000';
      ctx.font = '28px sans-serif';
      colors.forEach((_, i) => ctx.fillText(`K${i}`, (i * width) / colors.length + 10, height - 40));
      const type = quality === null ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality ?? undefined));
      if (!blob || blob.type !== type) throw new Error(`encoder ${type} tidak tersedia`);
      const { data } = await decodeImage(blob);
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    { quality, colors: CATEGORIES.slice(0, categories), small: SMALL, width: WIDTH, height: HEIGHT },
  );
  return { data: new Uint8ClampedArray(Buffer.from(base64, 'base64')), width: WIDTH, height: HEIGHT, colorSpace: 'srgb' };
}

/** Pangsa piksel opak yang berjarak OKLab < 0,05 dari `hex` (ground truth dari piksel, bukan dari algoritma). */
function pixelShareNear(image: ImageData, hex: string): number {
  const target = distance(hex, hex); // memastikan hex valid untuk culori
  expect(target).toBe(0);
  let near = 0;
  for (let p = 0; p < image.data.length; p += 4) {
    const color = { mode: 'rgb' as const, r: image.data[p] / 255, g: image.data[p + 1] / 255, b: image.data[p + 2] / 255 };
    if (distance(color, hex) < 0.05) near++;
  }
  return near / (image.width * image.height);
}

function missing(swatches: ColorSwatch[], expected: string[]): string[] {
  return expected.filter((hex) => !swatches.some((s) => distance(s.hex, hex) < 0.05));
}

describe('extractColors — regresi JPEG asli (Chromium)', () => {
  it('kasus audit: legenda 0,251% pada JPEG q75 tetap terdeteksi dengan maxColors default', async () => {
    const image = await renderChart({ quality: 0.75, categories: 6 });
    // Prasyarat fixture: kategori kecil memang di atas ambang 0,2%.
    expect(pixelShareNear(image, SMALL)).toBeGreaterThan(0.002);
    const result = extractColors(image);
    expect(missing(result, [...CATEGORIES.slice(0, 6), SMALL])).toEqual([]);
  }, 60_000);

  it.each([0.95, 0.75, 0.5])('semua kategori tetap ada pada JPEG kualitas %s (6 dan 10 kategori)', async (quality) => {
    for (const categories of [6, 10]) {
      const image = await renderChart({ quality, categories });
      expect(missing(extractColors(image), [...CATEGORIES.slice(0, categories), SMALL])).toEqual([]);
    }
  }, 60_000);

  it('hasil konsisten untuk input yang sama', async () => {
    const image = await renderChart({ quality: 0.75, categories: 10 });
    const again = await renderChart({ quality: 0.75, categories: 10 });
    const first = extractColors(image);
    expect(extractColors(image)).toEqual(first);
    expect(extractColors(again)).toEqual(first);
  }, 60_000);

  it('menaikkan maxColors hanya menambah swatch, tidak menghilangkan yang sudah ditemukan', async () => {
    const image = await renderChart({ quality: 0.75, categories: 6 });
    const results = [12, 16, 24, 32].map((maxColors) => extractColors(image, { maxColors }));
    for (let i = 1; i < results.length; i++) {
      expect(results[i].slice(0, results[i - 1].length)).toEqual(results[i - 1]);
    }
    for (const result of results) expect(missing(result, [SMALL])).toEqual([]);
  }, 60_000);

  it('PNG warna solid tetap menghasilkan hex persis', async () => {
    const image = await renderChart({ quality: null, categories: 6 });
    const result = extractColors(image).map((s) => s.hex);
    for (const hex of [...CATEGORIES.slice(0, 6), SMALL]) expect(result).toContain(hex);
  }, 60_000);
});
