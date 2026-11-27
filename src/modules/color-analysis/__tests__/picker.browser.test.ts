// @vitest-environment node
// FR-04 di Chromium asli (Playwright): klik mouse nyata pada canvas yang diskalakan CSS. Ground truth = warna yang
// benar-benar dirender browser di bawah kursor (dibaca dari screenshot), bukan rumus konversi itu sendiri.
// Butuh `npx playwright install chromium`.
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cssToSourcePixel, pickColor } from '..';

const SOURCE_WIDTH = 40;
const SOURCE_HEIGHT = 20;
// Warna unik per piksel sumber agar setiap salah petak terdeteksi.
const colorAt = (x: number, y: number) => [x * 6, y * 12, 255 - x * 3 - y * 2] as const;
const hexAt = (x: number, y: number) =>
  `#${colorAt(x, y).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function sourceImage(): ImageData {
  const data = new Uint8ClampedArray(SOURCE_WIDTH * SOURCE_HEIGHT * 4);
  for (let y = 0; y < SOURCE_HEIGHT; y++) {
    for (let x = 0; x < SOURCE_WIDTH; x++) data.set([...colorAt(x, y), 255], (y * SOURCE_WIDTH + x) * 4);
  }
  return { data, width: SOURCE_WIDTH, height: SOURCE_HEIGHT, colorSpace: 'srgb' };
}

interface ClickRecord {
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
}

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/** Tampilkan sumber pada canvas berukuran CSS tertentu, posisi pecahan, lalu klik pusat piksel sumber target. */
async function clickPixels(css: { left: number; top: number; width: number; height: number }, targets: [number, number][]) {
  const source = sourceImage();
  await page.setContent('<body style="margin:0;background:#808080"></body>');
  await page.evaluate(
    ({ data, w, h, css }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      Object.assign(canvas.style, {
        position: 'absolute',
        left: `${css.left}px`,
        top: `${css.top}px`,
        width: `${css.width}px`,
        height: `${css.height}px`,
        imageRendering: 'pixelated',
      });
      canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
      const clicks: ClickRecord[] = [];
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        clicks.push({ offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, displayWidth: rect.width, displayHeight: rect.height });
      });
      document.body.append(canvas);
      (globalThis as unknown as { __clicks: ClickRecord[] }).__clicks = clicks;
    },
    { data: Array.from(source.data), w: SOURCE_WIDTH, h: SOURCE_HEIGHT, css },
  );
  const points = targets.map(([sx, sy]) => ({
    x: css.left + ((sx + 0.5) * css.width) / SOURCE_WIDTH,
    y: css.top + ((sy + 0.5) * css.height) / SOURCE_HEIGHT,
  }));
  for (const p of points) await page.mouse.click(p.x, p.y);
  const clicks = await page.evaluate(() => (globalThis as unknown as { __clicks: ClickRecord[] }).__clicks);

  // Warna yang dirender di bawah kursor: screenshot di-decode di halaman.
  const screenshot = (await page.screenshot({ type: 'png' })).toString('base64');
  const rendered = await page.evaluate(
    async ({ png, points }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(bitmap, 0, 0);
      return points.map(({ x, y }) => {
        const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      });
    },
    { png: screenshot, points },
  );
  return { source, clicks, rendered };
}

const TARGETS: [number, number][] = [
  [0, 0],
  [SOURCE_WIDTH - 1, SOURCE_HEIGHT - 1],
  [SOURCE_WIDTH - 1, 0],
  [0, SOURCE_HEIGHT - 1],
  [20, 10],
  [7, 13],
  [33, 4],
];

describe('cssToSourcePixel + pickColor — klik nyata di Chromium', () => {
  it.each([
    ['skala 10× proporsional', { left: 13.3, top: 7.6, width: 400, height: 200 }],
    ['skala 1×', { left: 50, top: 50, width: SOURCE_WIDTH, height: SOURCE_HEIGHT }],
    ['skala tidak bulat dan tidak proporsional (17,5× × 12,3×)', { left: 21.7, top: 3.2, width: 700, height: 246 }],
  ])('%s: memilih piksel sumber yang dirender di bawah kursor', async (_, css) => {
    const { source, clicks, rendered } = await clickPixels(css, TARGETS);
    expect(clicks).toHaveLength(TARGETS.length);
    clicks.forEach((click, i) => {
      const [sx, sy] = TARGETS[i];
      const { x, y } = cssToSourcePixel(click.offsetX, click.offsetY, click.displayWidth, click.displayHeight, source.width, source.height);
      expect({ x, y }).toEqual({ x: sx, y: sy });
      const picked = pickColor(source, x, y);
      expect(picked).toBe(hexAt(sx, sy));
      expect(picked).toBe(rendered[i]);
    });
  }, 60_000);

  it('klik di luar canvas tidak tercatat, dan titik di luar tampilan ditolak', async () => {
    const css = { left: 100, top: 100, width: 400, height: 200 };
    await clickPixels(css, []);
    await page.mouse.click(50, 50); // di luar canvas (canvas mulai di 100, 100)
    await page.mouse.click(250, 150); // di dalam canvas, sebagai kontrol bahwa listener aktif
    const clicks = await page.evaluate(() => (globalThis as unknown as { __clicks: ClickRecord[] }).__clicks);
    expect(clicks).toHaveLength(1);
    expect(cssToSourcePixel(clicks[0].offsetX, clicks[0].offsetY, clicks[0].displayWidth, clicks[0].displayHeight, SOURCE_WIDTH, SOURCE_HEIGHT)).toEqual({ x: 15, y: 5 });
    expect(() => cssToSourcePixel(-0.5, 10, css.width, css.height, SOURCE_WIDTH, SOURCE_HEIGHT)).toThrow(RangeError);
    expect(() => cssToSourcePixel(css.width, 10, css.width, css.height, SOURCE_WIDTH, SOURCE_HEIGHT)).toThrow(RangeError);
  }, 60_000);
});
