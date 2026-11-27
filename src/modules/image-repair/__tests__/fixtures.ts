// Fixture sintetis untuk test, bukan data produksi.
import type { ColorSwatch, SemanticCategory } from '@/types';

// jsdom tidak menyediakan ImageData; pengganti minimal ini hanya untuk test.
class TestImageData {
  readonly colorSpace: PredefinedColorSpace;
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
    settings?: ImageDataSettings,
  ) {
    this.colorSpace = settings?.colorSpace ?? 'srgb';
  }
}
globalThis.ImageData ??= TestImageData as unknown as typeof ImageData;

export const COLORS = {
  background: '#FFFFFF',
  text: '#000000',
  light: '#FFD54F',
  dark: '#1A237E',
  excluded: '#2E7D32',
} as const;

export type Rect = readonly [x: number, y: number, w: number, h: number];

export function solidImage(width: number, height: number, hex: string): ImageData {
  const image = new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
  fillRect(image, [0, 0, width, height], hex);
  return image;
}

export function fillRect(image: ImageData, [x0, y0, w, h]: Rect, hex: string, alpha = 255): void {
  const rgba = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(alpha);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) image.data.set(rgba, (y * image.width + x) * 4);
  }
}

export const RECTS = {
  lightArea: [2, 2, 26, 20],
  darkArea: [32, 2, 26, 20],
  lightLegend: [2, 28, 10, 10],
  darkLegend: [22, 28, 10, 10],
  excludedLegend: [42, 28, 10, 10],
} as const satisfies Record<string, Rect>;

/** 60×44: latar putih, dua area kategori + legenda, legenda excluded, garis batas dan blok "teks" hitam. */
export function chartFixture(): {
  image: ImageData;
  swatches: ColorSwatch[];
  categories: SemanticCategory[];
} {
  const image = solidImage(60, 44, COLORS.background);
  fillRect(image, RECTS.lightArea, COLORS.light);
  fillRect(image, RECTS.darkArea, COLORS.dark);
  fillRect(image, RECTS.lightLegend, COLORS.light);
  fillRect(image, RECTS.darkLegend, COLORS.dark);
  fillRect(image, RECTS.excludedLegend, COLORS.excluded);
  fillRect(image, [29, 0, 2, 24], COLORS.text); // garis batas vertikal
  fillRect(image, [0, 24, 60, 1], COLORS.text); // garis batas horizontal
  fillRect(image, [10, 10, 6, 3], COLORS.text); // teks di atas area terang
  fillRect(image, [40, 10, 6, 3], COLORS.text); // teks di atas area gelap
  fillRect(image, [13, 31, 6, 4], COLORS.text); // label legenda
  fillRect(image, [33, 31, 6, 4], COLORS.text);

  const swatches = Object.entries(COLORS).map(([id, hex]) => ({ id, hex }));
  const categories: SemanticCategory[] = [
    { colorId: 'light', label: 'Rendah', included: true, order: 1 },
    { colorId: 'dark', label: 'Tinggi', included: true, order: 2 },
    { colorId: 'excluded', label: 'Dekorasi', included: false, order: null },
  ];
  return { image, swatches, categories };
}

export const pixelAt = (image: ImageData, x: number, y: number): number[] =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

/** Piksel dalam rect yang berbeda antara dua gambar. */
export function changedIn(before: ImageData, after: ImageData, [x0, y0, w, h]: Rect): number {
  let changed = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (pixelAt(before, x, y).join() !== pixelAt(after, x, y).join()) changed++;
    }
  }
  return changed;
}
