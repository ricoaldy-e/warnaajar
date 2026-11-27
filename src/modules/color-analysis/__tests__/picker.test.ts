// @vitest-environment node
// Fixture sintetis dengan ground truth yang diketahui, bukan data produksi.
import { describe, expect, it } from 'vitest';
import type { ColorSwatch, SemanticCategory } from '@/types';
import { recommendPatterns, repairImage } from '@/modules/image-repair';
import { MIN_OPAQUE_ALPHA, analyzeColors, cssToSourcePixel, extractColors, pickColor } from '..';

// Node tidak menyediakan ImageData (dipakai repairImage Modul 3); pengganti minimal ini hanya untuk test.
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

type Rgba = readonly [number, number, number, number];
function image(width: number, height: number, pixel: (x: number, y: number) => Rgba): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height, colorSpace: 'srgb' };
}
const rgb = (hex: string): Rgba => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255) as unknown as Rgba;
// Warna unik per piksel: R = x, G = y, B = 100 + x + y. Menangkap x/y tertukar atau salah indeks baris.
const unique = (x: number, y: number): Rgba => [x, y, 100 + x + y, 255];
const hexOf = ([r, g, b]: Rgba) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** 120×80: latar putih, tiga blok kategori 30×30, dan legenda kecil 4×4 #E6AB02 (16 px = 0,17%, di bawah ambang ekstraksi 0,2%). */
const FIXTURE = { background: '#FFFFFF', blocks: ['#E41A1C', '#4DAF4A', '#377EB8'], small: '#E6AB02' } as const;
function chart(): ImageData {
  return image(120, 80, (x, y) => {
    if (y >= 10 && y < 40) {
      const block = Math.floor((x - 10) / 35);
      if (x >= 10 && block < 3 && (x - 10) % 35 < 30) return rgb(FIXTURE.blocks[block]);
    }
    if (x >= 100 && x < 104 && y >= 60 && y < 64) return rgb(FIXTURE.small); // 16 px = 0,17%
    return rgb(FIXTURE.background);
  });
}

describe('pickColor', () => {
  it('klik pada swatch fixture menghasilkan warna yang tepat', () => {
    const source = chart();
    expect(pickColor(source, 25, 25)).toBe(FIXTURE.blocks[0]);
    expect(pickColor(source, 60, 12)).toBe(FIXTURE.blocks[1]);
    expect(pickColor(source, 99, 39)).toBe(FIXTURE.blocks[2]);
    expect(pickColor(source, 101, 61)).toBe(FIXTURE.small);
    expect(pickColor(source, 5, 70)).toBe(FIXTURE.background);
  });

  it('piksel pertama, terakhir, tengah, dan seluruh piksel gambar non-persegi', () => {
    const source = image(7, 3, unique);
    expect(pickColor(source, 0, 0)).toBe(hexOf(unique(0, 0)));
    expect(pickColor(source, 6, 2)).toBe(hexOf(unique(6, 2)));
    expect(pickColor(source, 3, 1)).toBe(hexOf(unique(3, 1)));
    for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) expect(pickColor(source, x, y)).toBe(hexOf(unique(x, y)));
  });

  it('gambar 1×1 dan gambar satu warna', () => {
    expect(pickColor(image(1, 1, () => rgb('#123456')), 0, 0)).toBe('#123456');
    const flat = image(9, 5, () => rgb('#ABCDEF'));
    for (const [x, y] of [[0, 0], [8, 4], [4, 2], [8, 0], [0, 4]]) expect(pickColor(flat, x, y)).toBe('#ABCDEF');
  });

  it('hasil selalu #RRGGBB uppercase', () => {
    const hex = pickColor(image(1, 1, () => [0xab, 0xcd, 0x0e, 255]), 0, 0);
    expect(hex).toBe('#ABCD0E');
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('menolak koordinat di luar batas, negatif, atau bukan bilangan bulat', () => {
    const source = image(7, 3, unique);
    for (const [x, y] of [[-1, 0], [0, -1], [7, 0], [0, 3], [7, 3], [100, 100], [0.5, 0], [0, 1.2], [Number.NaN, 0], [0, Number.POSITIVE_INFINITY]]) {
      expect(() => pickColor(source, x, y), `(${x}, ${y})`).toThrow(RangeError);
    }
  });

  it('piksel transparan (alpha < MIN_OPAQUE_ALPHA) ditolak; alpha ≥ batas mengembalikan RGB apa adanya', () => {
    expect(MIN_OPAQUE_ALPHA).toBe(128);
    const alphas = [0, 1, 127, 128, 200, 255];
    const source = image(alphas.length, 1, (x) => [10, 20, 30, alphas[x]]);
    alphas.forEach((alpha, x) => {
      if (alpha < 128) expect(() => pickColor(source, x, 0)).toThrow(/transparan/);
      else expect(pickColor(source, x, 0)).toBe('#0A141E');
    });
  });

  it('menolak ImageData tidak valid atau non-sRGB', () => {
    const valid = image(2, 2, () => rgb('#000000'));
    const bad = (overrides: Partial<ImageData>): ImageData => ({ ...valid, ...overrides });
    expect(() => pickColor(bad({ data: new Uint8ClampedArray(8) }), 0, 0)).toThrow(RangeError);
    expect(() => pickColor(bad({ width: 0 }), 0, 0)).toThrow(RangeError);
    expect(() => pickColor(bad({ height: 1.5 }), 0, 0)).toThrow(RangeError);
    expect(() => pickColor(bad({ colorSpace: 'display-p3' }), 0, 0)).toThrow(/display-p3/);
  });

  it('tidak mengubah ImageData sumber', () => {
    const source = image(7, 3, unique);
    const before = new Uint8ClampedArray(source.data);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) pickColor(source, x, y);
    expect(source.data).toEqual(before);
    expect([source.width, source.height]).toEqual([7, 3]);
  });

  it('hasil pick sama dengan hex yang diekstrak untuk area warna datar', () => {
    const source = chart();
    const extracted = extractColors(source).map((s) => s.hex);
    for (const hex of FIXTURE.blocks) expect(extracted).toContain(hex);
    expect(extracted).toContain(pickColor(source, 25, 25));
  });
});

describe('pickColor — dapat dipakai modul analisis dan perbaikan', () => {
  it('kategori kecil yang terlewat ekstraksi dapat ditambahkan lewat picker, lalu dianalisis dan diperbaiki', () => {
    const source = chart();
    const extracted = extractColors(source);
    // Prasyarat: legenda 16 px (< 0,2%) memang terlewat ekstraksi otomatis.
    expect(extracted.map((s) => s.hex)).not.toContain(FIXTURE.small);

    // UI (Modul 4) menambahkan warna hasil pick ke daftar swatch; ID dipilih UI agar tidak bentrok.
    const swatches: ColorSwatch[] = [...extracted, { id: 'manual-1', hex: pickColor(source, 101, 61) }];

    // Modul analisis: ID manual diterima dan dapat muncul pada konflik.
    const analysis = analyzeColors(swatches, 1000);
    expect(analysis.colors).toContainEqual({ id: 'manual-1', hex: FIXTURE.small });
    expect(analysis.conflicts.some((c) => c.colorAId === 'manual-1' || c.colorBId === 'manual-1')).toBe(true);

    // Modul perbaikan (API publik Modul 3, tidak diubah): warna pick menjadi target mask.
    const target = image(120, 80, (x, y) => (x >= 40 && x < 80 && y >= 20 && y < 60 ? rgb(FIXTURE.small) : rgb(FIXTURE.background)));
    const targetSwatches: ColorSwatch[] = [
      { id: 'bg', hex: pickColor(target, 0, 0) },
      { id: 'manual-1', hex: pickColor(target, 60, 40) },
    ];
    const categories: SemanticCategory[] = [
      { colorId: 'bg', label: 'Latar', included: false, order: null },
      { colorId: 'manual-1', label: 'Kategori kecil', included: true, order: null },
    ];
    const { configs } = recommendPatterns(categories, targetSwatches, 'categorical');
    const result = repairImage(target, targetSwatches, categories, 'categorical', configs);
    expect(result.appliedColorIds).toEqual(['manual-1']);
    // Pola tergambar di dalam area yang dipilih, latar tetap.
    const changed = (x: number, y: number) => {
      const p = (y * 120 + x) * 4;
      return [0, 1, 2].some((c) => result.image.data[p + c] !== target.data[p + c]);
    };
    let inside = 0;
    for (let y = 20; y < 60; y++) for (let x = 40; x < 80; x++) if (changed(x, y)) inside++;
    expect(inside).toBeGreaterThan(0);
    expect(changed(5, 5)).toBe(false);
  });
});

describe('cssToSourcePixel', () => {
  it('memetakan pusat setiap piksel tampilan ke piksel sumber yang tepat pada berbagai skala', () => {
    const [sw, sh] = [7, 3];
    for (const scale of [1, 2, 0.5, 1.5, 2 / 3, 3.7]) {
      const [dw, dh] = [sw * scale, sh * scale];
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          expect(cssToSourcePixel((x + 0.5) * scale, (y + 0.5) * scale, dw, dh, sw, sh), `scale ${scale}`).toEqual({ x, y });
        }
      }
    }
  });

  it('skala sumbu berbeda (tampilan tidak proporsional) dan sudut gambar', () => {
    // Sumber 300×200 ditampilkan 150×400.
    expect(cssToSourcePixel(0, 0, 150, 400, 300, 200)).toEqual({ x: 0, y: 0 });
    expect(cssToSourcePixel(149.99, 399.99, 150, 400, 300, 200)).toEqual({ x: 299, y: 199 });
    expect(cssToSourcePixel(75, 200, 150, 400, 300, 200)).toEqual({ x: 150, y: 100 });
  });

  it('menolak titik di luar tampilan dan ukuran tidak valid', () => {
    for (const [cx, cy] of [[-0.01, 5], [5, -1], [150, 5], [5, 400], [Number.NaN, 0]]) {
      expect(() => cssToSourcePixel(cx, cy, 150, 400, 300, 200)).toThrow(RangeError);
    }
    expect(() => cssToSourcePixel(1, 1, 0, 400, 300, 200)).toThrow(RangeError);
    expect(() => cssToSourcePixel(1, 1, 150, -1, 300, 200)).toThrow(RangeError);
    expect(() => cssToSourcePixel(1, 1, 150, 400, 0, 200)).toThrow(RangeError);
    expect(() => cssToSourcePixel(1, 1, 150, 400, 300, 2.5)).toThrow(RangeError);
  });

  it('dikombinasikan dengan pickColor: klik pada tampilan diskalakan memilih piksel sumber yang tepat', () => {
    const source = image(7, 3, unique);
    // Tampilan 2,5× lebih besar: titik CSS (9, 6) → sumber (3, 2).
    const { x, y } = cssToSourcePixel(9, 6, 17.5, 7.5, source.width, source.height);
    expect(pickColor(source, x, y)).toBe(hexOf(unique(3, 2)));
  });
});
