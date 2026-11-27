// @vitest-environment node
// Fixture sintetis untuk test, bukan data produksi.
import { filterDeficiencyDeuter, filterDeficiencyProt, filterDeficiencyTrit, formatHex } from 'culori';
import { describe, expect, it } from 'vitest';
import type { CvdMode } from '@/types';
import { CVD_MODES, MACHADO_MATRICES, SIMULATION_CACHE_CAPACITY, simulateCvd, simulateHex } from '../simulate';

// Node tidak menyediakan ImageData; pengganti minimal ini hanya untuk test.
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

function image(pixels: readonly (readonly number[])[], width = pixels.length): ImageData {
  const data = new Uint8ClampedArray(pixels.flat());
  return { data, width, height: pixels.length / width, colorSpace: 'srgb' };
}
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function expectHexClose(actual: string, expected: string, tolerance = 1): void {
  const a = channels(actual);
  channels(expected).forEach((v, i) => expect(Math.abs(a[i] - v), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance));
}
const toLinear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const SIMULATED: readonly CvdMode[] = ['protan', 'deutan', 'tritan', 'grayscale'];

/**
 * Nilai referensi: matriks Machado et al. (2009) severity 1,0 diterapkan pada RGB linear
 * (IEC 61966-2-1), clamp [0, 1], lalu dikodekan ke sRGB dan dibulatkan. Dihitung dengan skrip
 * terpisah dari implementasi (rumus yang sama dengan colorspace R `linear = TRUE`).
 */
const REFERENCE = {
  '#FF0000': { protan: '#6D5F00', deutan: '#A39000', tritan: '#FF000F', grayscale: '#7F7F7F' },
  '#00FF00': { protan: '#FFE500', deutan: '#EFD63A', tritan: '#00F7D9', grayscale: '#DCDCDC' },
  '#0000FF': { protan: '#0059FF', deutan: '#003DFB', tritan: '#006B96', grayscale: '#4C4C4C' },
  '#00FFFF': { protan: '#EDF2FF', deutan: '#D0DDFF', tritan: '#00FFFE', grayscale: '#E5E5E5' },
  '#FF00FF': { protan: '#007FFF', deutan: '#689BFA', tritan: '#FF4A97', grayscale: '#919191' },
  '#FFFF00': { protan: '#FFF400', deutan: '#FFFA31', tritan: '#FFEED9', grayscale: '#F7F7F7' },
} as const;

describe('matriks Machado', () => {
  it('identik dengan tabel severity 1,0 yang dipakai Culori (sumber yang sama dengan makalah)', () => {
    // Culori menerapkan matriks tanpa clamp, jadi vektor basis menghasilkan kolom matriks.
    const filters = { protan: filterDeficiencyProt(1), deutan: filterDeficiencyDeuter(1), tritan: filterDeficiencyTrit(1) };
    for (const [mode, filter] of Object.entries(filters) as [keyof typeof filters, (typeof filters)['protan']][]) {
      const m = MACHADO_MATRICES[mode];
      [
        { mode: 'rgb' as const, r: 1, g: 0, b: 0 },
        { mode: 'rgb' as const, r: 0, g: 1, b: 0 },
        { mode: 'rgb' as const, r: 0, g: 0, b: 1 },
      ].forEach((basis, col) => {
        const out = filter(basis);
        expect([out.r, out.g, out.b]).toEqual([m[col], m[3 + col], m[6 + col]]);
      });
    }
  });
});

describe('simulateHex — fixture referensi', () => {
  it.each(Object.entries(REFERENCE))('%s pada protan, deutan, tritan, grayscale', (hex, expected) => {
    for (const [mode, value] of Object.entries(expected)) expectHexClose(simulateHex(hex, mode as CvdMode), value);
  });

  it('memakai RGB linear, bukan RGB gamma (protan #FF0000)', () => {
    const linear = simulateHex('#FF0000', 'protan');
    expectHexClose(linear, '#6D5F00');
    // Matriks pada RGB gamma (perilaku Culori) memberi #271D00; jauh berbeda dan tidak boleh diterima.
    const gamma = formatHex(filterDeficiencyProt(1)({ mode: 'rgb', r: 1, g: 0, b: 0 })).toUpperCase();
    expect(gamma).toBe('#271D00');
    expect(Math.max(...channels(linear).map((v, i) => Math.abs(v - channels(gamma)[i])))).toBeGreaterThan(40);
  });

  it('warna netral tetap netral di semua mode', () => {
    for (const hex of ['#000000', '#FFFFFF', '#808080', '#404040', '#C0C0C0']) {
      for (const mode of SIMULATED) {
        const out = simulateHex(hex, mode);
        expectHexClose(out, hex);
        const [r, g, b] = channels(out);
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('grayscale: tiga kanal sama dan luminans relatif dipertahankan', () => {
    const samples = ['#FF0000', '#00FF00', '#0000FF', '#CD4949', '#45934F', '#E4C34D', '#1A237E', '#7F7F7F'];
    for (const hex of samples) {
      const out = simulateHex(hex, 'grayscale');
      const [r, g, b] = channels(out);
      expect(r).toBe(g);
      expect(g).toBe(b);
      // Pembulatan 8-bit menggeser luminans < 0,005.
      expect(Math.abs(luminance(out) - luminance(hex))).toBeLessThan(0.005);
    }
    // Urutan kecerahan mengikuti luminans: hijau > merah > biru.
    const level = (hex: string) => channels(simulateHex(hex, 'grayscale'))[0];
    expect(level('#00FF00')).toBeGreaterThan(level('#FF0000'));
    expect(level('#FF0000')).toBeGreaterThan(level('#0000FF'));
  });

  it('normal menormalkan hex ke uppercase tanpa transformasi', () => {
    expect(simulateHex('#abcdef', 'normal')).toBe('#ABCDEF');
    expect(simulateHex('#abcdef', 'protan')).toBe(simulateHex('#ABCDEF', 'protan'));
  });

  it('menolak hex atau mode tidak valid', () => {
    for (const hex of ['#FFF', 'FF0000', '#GG0000', '', '#FF00000', ' #FF0000']) {
      expect(() => simulateHex(hex, 'protan')).toThrow(RangeError);
    }
    for (const mode of ['achromat', '', 'Protan'] as unknown as CvdMode[]) {
      expect(() => simulateHex('#FF0000', mode)).toThrow(RangeError);
    }
  });
});

describe('simulateCvd', () => {
  const ALPHAS = [0, 1, 127, 128, 255];

  it('normal: isi identik, objek dan buffer baru', () => {
    const source = image([[10, 20, 30, 255], [200, 100, 50, 128], [1, 2, 3, 0]]);
    const out = simulateCvd(source, 'normal');
    expect(out).not.toBe(source);
    expect(out.data).not.toBe(source.data);
    expect(out.data.buffer).not.toBe(source.data.buffer);
    expect(Array.from(out.data)).toEqual(Array.from(source.data));
  });

  it('alpha, dimensi, panjang buffer, dan colorSpace dipertahankan di semua mode', () => {
    const pixels = ALPHAS.flatMap((a) => [[255, 0, 0, a], [0, 128, 255, a]]);
    const source = image(pixels, 5);
    for (const mode of CVD_MODES) {
      const out = simulateCvd(source, mode);
      expect([out.width, out.height, out.data.length, out.colorSpace]).toEqual([5, 2, source.data.length, 'srgb']);
      pixels.forEach(([, , , a], i) => expect(out.data[i * 4 + 3]).toBe(a));
    }
  });

  it('setiap piksel identik dengan simulateHex dari warna yang sama', () => {
    for (const hex of [...Object.keys(REFERENCE), '#CD4949', '#45934F', '#808080']) {
      const [r, g, b] = channels(hex);
      const source = image(Array.from({ length: 12 }, () => [r, g, b, 255]), 4);
      for (const mode of CVD_MODES) {
        const expected = channels(simulateHex(hex, mode));
        const out = simulateCvd(source, mode);
        for (let p = 0; p < out.data.length; p += 4) expect(Array.from(out.data.subarray(p, p + 3))).toEqual(expected);
      }
    }
  });

  it('tidak mengubah sumber setelah seluruh mode dijalankan', () => {
    const source = image(Object.keys(REFERENCE).map((hex) => [...channels(hex), 200]), 3);
    const before = new Uint8ClampedArray(source.data);
    for (const mode of CVD_MODES) simulateCvd(source, mode);
    expect(source.data).toEqual(before);
    expect([source.width, source.height]).toEqual([3, 2]);
  });

  it('deterministik, juga setelah cache penuh dan mulai membuang entri', () => {
    // 2 × 100.000 warna unik (> kapasitas cache): putaran kedua memakai warna yang sudah dibuang dari cache.
    const unique = 100_000;
    expect(unique).toBeGreaterThan(SIMULATION_CACHE_CAPACITY);
    const colorOf = (i: number) => ((i % unique) * 167) % 0x1000000;
    const data = new Uint8ClampedArray(unique * 2 * 4);
    for (let i = 0; i < unique * 2; i++) data.set([colorOf(i) >> 16, (colorOf(i) >> 8) & 255, colorOf(i) & 255, 255], i * 4);
    const source: ImageData = { data, width: 500, height: 400, colorSpace: 'srgb' };
    for (const mode of ['protan', 'tritan', 'grayscale'] as const) {
      const first = simulateCvd(source, mode).data;
      const second = simulateCvd(source, mode).data;
      // Jalur tanpa cache (simulateHex), dihitung sekali per warna unik.
      const expected = Array.from({ length: unique }, (_, i) =>
        parseInt(simulateHex(`#${colorOf(i).toString(16).padStart(6, '0')}`, mode).slice(1), 16),
      );
      let mismatches = 0;
      for (let i = 0; i < unique * 2; i++) {
        const p = i * 4;
        const e = expected[i % unique];
        if (first[p] !== e >> 16 || first[p + 1] !== ((e >> 8) & 255) || first[p + 2] !== (e & 255)) mismatches++;
        for (let c = 0; c < 4; c++) if (second[p + c] !== first[p + c]) mismatches++;
      }
      expect(mismatches, `mode ${mode}`).toBe(0);
    }
  });

  it('menolak input tidak valid dengan RangeError', () => {
    const valid = image([[0, 0, 0, 255]]);
    expect(() => simulateCvd(valid, 'achromat' as unknown as CvdMode)).toThrow(RangeError);
    const bad = (overrides: Partial<ImageData>): ImageData => ({ ...valid, ...overrides });
    expect(() => simulateCvd(bad({ data: new Uint8ClampedArray(8) }), 'protan')).toThrow(RangeError);
    for (const width of [0, -1, 1.5, Number.NaN]) {
      expect(() => simulateCvd(bad({ width }), 'protan')).toThrow(RangeError);
    }
    expect(() => simulateCvd(bad({ height: 0, data: new Uint8ClampedArray(0) }), 'protan')).toThrow(RangeError);
    expect(() => simulateCvd(bad({ colorSpace: 'display-p3' }), 'protan')).toThrow(/display-p3/);
    expect(() => simulateCvd(bad({ colorSpace: 'display-p3' }), 'normal')).toThrow(RangeError);
  });
});
