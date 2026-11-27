// @vitest-environment node
import { converter, differenceCiede2000 } from 'culori';
import { describe, expect, it } from 'vitest';
import type { ColorSwatch, SimulatedMode } from '@/types';
import { CONFLICT_MODES, analyzeColors } from '../conflicts';
import { simulateHex } from '../simulate';

const deltaE00 = differenceCiede2000();
const toLab65 = converter('lab65');

/**
 * Data uji CIEDE2000 dari G. Sharma, W. Wu, E. N. Dalal (2005), "The CIEDE2000 color-difference formula:
 * implementation notes, supplementary test data, and mathematical observations", Color Research & Application
 * 30(1):21–30. Berkas: https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
 * Kolom: L1 a1 b1 L2 a2 b2 ΔE00. Pasangan 7–8: akromatik (C = 0); 9–16: hue di sekitar wrap-around 0°/360°
 * dan diskontinuitas rerata hue; 17–20: perbedaan besar; 21–24: ΔE00 = 1.
 */
const SHARMA_2005 = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
] as const;

const swatches = (...hexes: string[]): ColorSwatch[] => hexes.map((hex, i) => ({ id: `c${i + 1}`, hex }));
/** ΔE00 langsung dari definisi, terpisah dari loop analyzeColors. */
const directDeltaE = (a: string, b: string, mode: SimulatedMode) => deltaE00(simulateHex(a, mode), simulateHex(b, mode));
const pairKey = (c: { colorAId: string; colorBId: string; mode: string }) => `${c.mode}:${c.colorAId}:${c.colorBId}`;

describe('differenceCiede2000 (Culori) — data uji Sharma, Wu & Dalal 2005', () => {
  it.each(SHARMA_2005.map((row, i) => [i + 1, row] as const))('pasangan %i', (_, [l1, a1, b1, l2, a2, b2, expected]) => {
    const std = { mode: 'lab65' as const, l: l1, a: a1, b: b1 };
    const smp = { mode: 'lab65' as const, l: l2, a: a2, b: b2 };
    expect(Math.abs(deltaE00(std, smp) - expected)).toBeLessThan(1e-4);
    // Simetris: urutan argumen tidak mengubah hasil.
    expect(deltaE00(smp, std)).toBe(deltaE00(std, smp));
  });

  it('memakai white point D65 yang konsisten: putih → L 100, a 0, b 0', () => {
    expect(toLab65('#FFFFFF')).toEqual({ mode: 'lab65', l: 100, a: 0, b: 0 });
    expect(deltaE00('#000000', '#FFFFFF')).toBeCloseTo(100, 4);
  });
});

describe('analyzeColors', () => {
  it('pasangan hex identik (ID berbeda) menjadi konflik dengan ΔE00 = 0 di setiap mode', () => {
    const { conflicts } = analyzeColors(swatches('#CD4949', '#CD4949'), 1);
    expect(conflicts).toEqual(CONFLICT_MODES.map((mode) => ({ colorAId: 'c1', colorBId: 'c2', mode, deltaE: 0 })));
  });

  it('pasangan sangat mirip terdeteksi bila ΔE00-nya di bawah threshold', () => {
    const colors = swatches('#CD4949', '#D14941');
    const largest = Math.max(...CONFLICT_MODES.map((mode) => directDeltaE('#CD4949', '#D14941', mode)));
    expect(largest).toBeLessThan(5);
    expect(analyzeColors(colors, 5).conflicts).toHaveLength(3);
  });

  it('pasangan berbeda jauh tidak menjadi konflik pada threshold yang sama', () => {
    expect(analyzeColors(swatches('#000000', '#FFFFFF'), 5).conflicts).toEqual([]);
  });

  it('hanya mode protan, deutan, tritan (tanpa normal dan grayscale), masing-masing dianalisis terpisah', () => {
    // Merah/hijau Set1: deutan 9,8; protan 28,6; tritan 63,1 (dihitung langsung di bawah).
    const [red, green] = ['#E41A1C', '#4DAF4A'];
    expect(directDeltaE(red, green, 'deutan')).toBeLessThan(10);
    expect(directDeltaE(red, green, 'protan')).toBeGreaterThan(10);
    expect(directDeltaE(red, green, 'tritan')).toBeGreaterThan(10);
    const { conflicts } = analyzeColors(swatches(red, green), 10);
    expect(conflicts.map((c) => c.mode)).toEqual(['deutan']);

    // Semua pasangan menjadi konflik pada threshold sangat besar: mode yang muncul hanya CONFLICT_MODES.
    const all = analyzeColors(swatches('#FFFFFF', '#000000', '#808080', '#E41A1C', '#4DAF4A'), 1000).conflicts;
    expect([...new Set(all.map((c) => c.mode))]).toEqual(['protan', 'deutan', 'tritan']);
  });

  it('pasangan unik per mode, tanpa A-B dan B-A sekaligus, ID dari input, deltaE finite ≥ 0, urutan deterministik', () => {
    const hexes = ['#FFFFFF', '#000000', '#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E', '#E6AB02', '#A6761D', '#666666', '#1F78B4', '#FB9A99'];
    const colors = swatches(...hexes);
    const ids = colors.map((c) => c.id);
    const { conflicts } = analyzeColors(colors, 1000);
    const n = colors.length;
    expect(conflicts).toHaveLength(CONFLICT_MODES.length * ((n * (n - 1)) / 2));
    expect(new Set(conflicts.map(pairKey)).size).toBe(conflicts.length);
    const unordered = new Set(conflicts.map((c) => `${c.mode}:${[c.colorAId, c.colorBId].sort().join('|')}`));
    expect(unordered.size).toBe(conflicts.length);
    for (const c of conflicts) {
      expect(ids).toContain(c.colorAId);
      expect(ids).toContain(c.colorBId);
      expect(ids.indexOf(c.colorAId)).toBeLessThan(ids.indexOf(c.colorBId));
      expect(Number.isFinite(c.deltaE)).toBe(true);
      expect(c.deltaE).toBeGreaterThanOrEqual(0);
    }
    // Urutan: mode, lalu indeks A, lalu indeks B.
    const expectedOrder = CONFLICT_MODES.flatMap((mode) =>
      ids.flatMap((a, i) => ids.slice(i + 1).map((b) => `${mode}:${a}:${b}`)),
    );
    expect(conflicts.map(pairKey)).toEqual(expectedOrder);
  });

  it('deltaE identik dengan differenceCiede2000(simulateHex(a), simulateHex(b)), dan non-konflik ≥ threshold', () => {
    const hexes = ['#FFFFFF', '#000000', '#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E', '#E6AB02', '#E41A1C', '#4DAF4A'];
    const colors = swatches(...hexes);
    const threshold = 12;
    const found = new Map(analyzeColors(colors, threshold).conflicts.map((c) => [pairKey(c), c.deltaE]));
    for (const mode of CONFLICT_MODES) {
      for (let i = 0; i < hexes.length; i++) {
        for (let j = i + 1; j < hexes.length; j++) {
          const direct = directDeltaE(hexes[i], hexes[j], mode);
          const key = `${mode}:${colors[i].id}:${colors[j].id}`;
          if (direct < threshold) expect(found.get(key)).toBe(direct);
          else expect(found.has(key)).toBe(false);
        }
      }
    }
  });

  it('threshold tepat pada ΔE00 bukan konflik; sedikit di atasnya menjadi konflik', () => {
    const colors = swatches('#E41A1C', '#4DAF4A');
    const deutan = directDeltaE('#E41A1C', '#4DAF4A', 'deutan');
    expect(analyzeColors(colors, deutan).conflicts.filter((c) => c.mode === 'deutan')).toEqual([]);
    const above = analyzeColors(colors, deutan + 1e-9).conflicts.filter((c) => c.mode === 'deutan');
    expect(above).toEqual([{ colorAId: 'c1', colorBId: 'c2', mode: 'deutan', deltaE: deutan }]);
  });

  it('input kosong atau satu warna menghasilkan struktur valid tanpa konflik', () => {
    expect(analyzeColors([], 10)).toEqual({ colors: [], conflicts: [], threshold: 10 });
    expect(analyzeColors(swatches('#ABCDEF'), 7.5)).toEqual({ colors: [{ id: 'c1', hex: '#ABCDEF' }], conflicts: [], threshold: 7.5 });
  });

  it('menolak colors tidak valid dengan RangeError (bukan TypeError Culori)', () => {
    const bad = (colors: unknown) => () => analyzeColors(colors as ColorSwatch[], 10);
    expect(bad('bukan array')).toThrow(RangeError);
    expect(bad([null])).toThrow(RangeError);
    expect(bad([{ hex: '#FFFFFF' }])).toThrow(RangeError);
    expect(bad([{ id: '', hex: '#FFFFFF' }])).toThrow(/kosong/);
    expect(bad([{ id: '   ', hex: '#FFFFFF' }])).toThrow(/kosong/);
    expect(bad([{ id: 'c1', hex: '#FFFFFF' }, { id: 'c1', hex: '#000000' }])).toThrow(/duplikat/);
    for (const hex of ['#FFF', 'FFFFFF', '#GGGGGG', '#FFFFFF00', '', 'red', 123]) {
      expect(bad([{ id: 'c1', hex }])).toThrow(RangeError);
    }
  });

  it('menolak threshold 0, negatif, NaN, Infinity', () => {
    for (const threshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => analyzeColors(swatches('#FFFFFF', '#000000'), threshold)).toThrow(RangeError);
    }
    expect(() => analyzeColors(swatches('#FFFFFF'), '10' as unknown as number)).toThrow(RangeError);
  });

  it('tidak mengubah input dan output tidak berbagi objek dengan input', () => {
    const colors = swatches('#E41A1C', '#4DAF4A', '#1B9E77');
    colors.forEach((c) => Object.freeze(c));
    Object.freeze(colors);
    const snapshot = JSON.stringify(colors);
    const result = analyzeColors(colors, 15);
    expect(JSON.stringify(colors)).toBe(snapshot);
    expect(result.colors).toEqual(colors);
    expect(result.colors).not.toBe(colors);
    result.colors.forEach((c, i) => expect(c).not.toBe(colors[i]));
  });

  it('deterministik: input dan threshold sama menghasilkan output identik', () => {
    const colors = swatches('#FFFFFF', '#000000', '#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#E41A1C', '#4DAF4A');
    const first = analyzeColors(colors, 15);
    expect(analyzeColors(colors, 15)).toEqual(first);
    expect(analyzeColors(colors.map((c) => ({ ...c })), 15)).toEqual(first);
  });
});
