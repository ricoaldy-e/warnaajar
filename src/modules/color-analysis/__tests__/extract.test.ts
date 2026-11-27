// @vitest-environment node
// Fixture sintetis dengan ground truth yang diketahui (luas dan warna per area), bukan data produksi.
import { differenceEuclidean } from 'culori';
import { describe, expect, it } from 'vitest';
import type { ColorSwatch } from '@/types';
import { DEFAULT_MAX_COLORS, MERGE_OKLAB_DISTANCE, extractColors } from '..';

type Rgba = readonly [number, number, number, number];

function image(width: number, height: number, pixel: (x: number, y: number) => Rgba): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { data, width, height, colorSpace: 'srgb' };
}

const rgb = (hex: string): Rgba => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255) as unknown as Rgba;
const hexes = (swatches: ColorSwatch[]) => swatches.map((s) => s.hex);
const distance = differenceEuclidean('oklab');

function expectContractFormat(swatches: ColorSwatch[]): void {
  swatches.forEach((s, i) => {
    expect(s.id).toBe(`c${i + 1}`);
    expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
}

// Deterministik (LCG), untuk noise mirip kompresi JPEG.
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// Warna dari grid {0, 128, 255}³ yang saling berjarak OKLab > 0,10 (beberapa pasangan grid,
// mis. #00FFFF/#80FFFF = 0,047, memang mirip). Strip ke-i selebar i + 1 px (luas berbeda dan diketahui).
const GRID = [0, 128, 255]
  .flatMap((r) => [0, 128, 255].flatMap((g) => [0, 128, 255].map((b) => [r, g, b, 255] as const)))
  .filter((c, i, all) => all.slice(0, i).every((p) => distance(toRgb(p), toRgb(c)) > 0.1));
function toRgb([r, g, b]: Rgba) {
  return { mode: 'rgb' as const, r: r / 255, g: g / 255, b: b / 255 };
}
const STRIP_END = GRID.map((_, i) => ((i + 1) * (i + 2)) / 2); // kumulatif lebar
function stripes(): ImageData {
  return image(STRIP_END[STRIP_END.length - 1], 10, (x) => GRID[STRIP_END.findIndex((end) => x < end)]);
}
const gridHex = (i: number) => `#${GRID[i].slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

describe('extractColors', () => {
  it('satu warna dominan menghasilkan tepat satu swatch dengan hex sumber', () => {
    const result = extractColors(image(20, 10, () => rgb('#ABCDEF')));
    expect(result).toEqual([{ id: 'c1', hex: '#ABCDEF' }]);
  });

  it('beberapa warna datar diurutkan dari luas terbesar, hex persis sama', () => {
    // 10×10: putih 50, merah 30, hijau 15, biru 5 piksel.
    const result = extractColors(
      image(10, 10, (x, y) => {
        const i = y * 10 + x;
        return i < 50 ? rgb('#FFFFFF') : i < 80 ? rgb('#CD4949') : i < 95 ? rgb('#45934F') : rgb('#1A237E');
      }),
    );
    expectContractFormat(result);
    expect(hexes(result)).toEqual(['#FFFFFF', '#CD4949', '#45934F', '#1A237E']);
  });

  it('piksel anti-aliasing tipis di perbatasan tidak menjadi swatch', () => {
    // 600×20: merah | 1 kolom campuran | 1 kolom campuran | biru. Tiap kolom campuran 0,17% piksel.
    const result = extractColors(
      image(600, 20, (x) => (x < 299 ? rgb('#FF0000') : x === 299 ? rgb('#AA0055') : x === 300 ? rgb('#5500AA') : rgb('#0000FF'))),
    );
    expect(hexes(result)).toEqual(['#0000FF', '#FF0000']);
  });

  it('warna tersebar (noise ±4 di sekitar 3 pusat) menghasilkan 3 swatch dekat pusatnya', () => {
    const centers = [rgb('#45934F'), rgb('#CD4949'), rgb('#E4C34D')];
    const rand = noise(42);
    const result = extractColors(
      image(90, 30, (x) => {
        const c = centers[Math.floor(x / 30)];
        return [0, 1, 2].map((i) => c[i] + Math.round(rand() * 8 - 4)).concat(255) as unknown as Rgba;
      }),
    );
    expectContractFormat(result);
    expect(result).toHaveLength(3);
    for (const center of centers) {
      const nearest = Math.min(...result.map((s) => distance(s.hex, toRgb(center))));
      expect(nearest).toBeLessThan(0.03);
    }
  });

  it('gradien memakai seluruh rentang warna, swatch saling berbeda dan dibatasi maxColors', () => {
    const result = extractColors(image(64, 64, (x) => [x * 4, x * 4, x * 4, 255]), { maxColors: 6 });
    expectContractFormat(result);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(6);
    const levels = result.map((s) => parseInt(s.hex.slice(1, 3), 16));
    expect(Math.min(...levels)).toBeLessThan(64);
    expect(Math.max(...levels)).toBeGreaterThan(192);
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        expect(distance(result[i].hex, result[j].hex)).toBeGreaterThan(MERGE_OKLAB_DISTANCE);
      }
    }
  });

  it('mengabaikan piksel transparan dan hampir transparan', () => {
    expect(extractColors(image(8, 8, () => [255, 0, 0, 0]))).toEqual([]);
    // Baris: 0–3 merah alpha 0, 4–5 biru alpha 100, 6–7 kuning alpha 200, 8–15 hijau opak.
    const result = extractColors(
      image(10, 16, (_, y) =>
        y < 4 ? [255, 0, 0, 0] : y < 6 ? [0, 0, 255, 100] : y < 8 ? [255, 255, 0, 200] : [0, 128, 0, 255],
      ),
    );
    expect(hexes(result)).toEqual(['#008000', '#FFFF00']);
  });

  it('gambar sangat kecil dan kosong', () => {
    expect(extractColors(image(1, 1, () => rgb('#123456')))).toEqual([{ id: 'c1', hex: '#123456' }]);
    expect(hexes(extractColors(image(2, 1, (x) => (x === 0 ? rgb('#000000') : rgb('#FFFFFF')))))).toEqual([
      '#000000',
      '#FFFFFF',
    ]);
    expect(extractColors(image(0, 0, () => rgb('#000000')))).toEqual([]);
  });

  it('menolak opsi atau ImageData tidak valid', () => {
    const valid = image(2, 2, () => rgb('#000000'));
    for (const maxColors of [0, -1, 2.5, Number.NaN]) {
      expect(() => extractColors(valid, { maxColors })).toThrow(RangeError);
    }
    const broken: ImageData = { data: new Uint8ClampedArray(12), width: 2, height: 2, colorSpace: 'srgb' };
    expect(() => extractColors(broken)).toThrow(RangeError);
  });

  it('konsisten untuk input yang sama', () => {
    const rand = noise(7);
    const make = () => image(50, 50, () => [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256), 255]);
    const a = make();
    const copy: ImageData = { ...a, data: new Uint8ClampedArray(a.data) };
    const first = extractColors(a);
    expect(extractColors(a)).toEqual(first);
    expect(extractColors(copy)).toEqual(first);
  });

  it('tidak mengubah ImageData sumber', () => {
    const source = stripes();
    const before = new Uint8ClampedArray(source.data);
    extractColors(source, { maxColors: 3 });
    expect(source.data).toEqual(before);
    expect([source.width, source.height]).toEqual([STRIP_END[STRIP_END.length - 1], 10]);
  });

  it('jumlah swatch dibatasi maxColors dan memilih warna dengan luas terbesar', () => {
    const source = stripes();
    const allColors = GRID.map((_, i) => gridHex(i));
    // Default: 12 strip terlebar, urut dari yang terlebar.
    const byDefault = extractColors(source);
    expect(byDefault).toHaveLength(DEFAULT_MAX_COLORS);
    expect(hexes(byDefault)).toEqual(allColors.slice(-DEFAULT_MAX_COLORS).reverse());
    expect(hexes(extractColors(source, { maxColors: 7 }))).toEqual(allColors.slice(-7).reverse());
    const five = extractColors(source, { maxColors: 5 });
    expectContractFormat(five);
    expect(five).toHaveLength(5);
    five.forEach((s) => expect(allColors).toContain(s.hex));
    expect(extractColors(source, { maxColors: 100 })).toHaveLength(GRID.length);
  });

  it('menggabungkan warna yang berjarak ≤ MERGE_OKLAB_DISTANCE ke warna yang lebih luas', () => {
    // #00FFFF dan #80FFFF berjarak OKLab ±0,047; dipertahankan yang lebih luas.
    const result = extractColors(image(10, 10, (x) => (x < 7 ? rgb('#80FFFF') : rgb('#00FFFF'))));
    expect(result).toEqual([{ id: 'c1', hex: '#80FFFF' }]);
  });

  it('noise pada warna sangat gelap tidak memecah hitam menjadi beberapa swatch', () => {
    // Teks hitam ber-noise 0–8 per kanal: OKLab ke #000000 hingga ±0,13 dan ΔE00 hingga ±5, tetapi tak terlihat.
    const rand = noise(3);
    const result = extractColors(
      image(100, 40, (x) =>
        x < 60 ? rgb('#FFFFFF') : [Math.floor(rand() * 9), Math.floor(rand() * 9), Math.floor(rand() * 9), 255],
      ),
    );
    expect(result).toHaveLength(2);
    expect(result[0].hex).toBe('#FFFFFF');
    expect(distance(result[1].hex, '#000000')).toBeLessThan(0.2);
  });

  it('regresi audit: kategori kecil tidak tertelan wakil kotak yang didominasi noise warna lain', () => {
    // 1000×600: 6 kolom besar ber-noise ±6 per kanal, kotak #E6AB02 39×39 (0,254%) juga ber-noise ±6.
    // Sebelumnya hilang: noise oranye #D95F02 (biru ter-clip ke 0) menang sebagai mode di kotak campuran.
    const big = ['#FFFFFF', '#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E'];
    const rand = noise(12345);
    const jitter = (hex: string): Rgba =>
      rgb(hex).map((v, i) => (i === 3 ? v : Math.max(0, Math.min(255, v + Math.round((rand() * 2 - 1) * 6))))) as unknown as Rgba;
    const result = extractColors(
      image(1000, 600, (x, y) => (x < 39 && y < 39 ? jitter('#E6AB02') : jitter(big[Math.min(5, Math.floor(x / (1000 / 6)))]))),
    );
    for (const hex of [...big, '#E6AB02']) {
      expect(Math.min(...result.map((s) => distance(s.hex, hex)))).toBeLessThan(0.05);
    }
  });

  it('warna terang yang benar-benar berbeda dari putih tetap terpisah', () => {
    // #FFFFB2 sering dipakai sebagai kategori ordinal terendah (ΔE00 ±21 dari putih).
    const result = extractColors(image(10, 10, (x) => (x < 5 ? rgb('#FFFFFF') : rgb('#FFFFB2'))));
    expect(hexes(result).sort()).toEqual(['#FFFFB2', '#FFFFFF']);
  });
});
