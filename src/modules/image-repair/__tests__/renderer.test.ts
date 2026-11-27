import { describe, expect, it } from 'vitest';
import type { PatternConfig, PatternKind } from '@/types';
import { PATTERN_KINDS } from '../constants';
import { recommendPatterns, validatePatternConfigs } from '../patterns';
import { patternScale, repairImage } from '../renderer';
import { COLORS, RECTS, chartFixture, changedIn, fillRect, pixelAt, solidImage, type Rect } from './fixtures';

const configsFor = (kind: PatternKind, spacingPx = 6): PatternConfig[] => [
  { colorId: 'light', kind, spacingPx },
  { colorId: 'dark', kind: kind === 'dots' ? 'horizontal' : 'dots', spacingPx },
];

describe('repairImage categorical', () => {
  const { image, swatches, categories } = chartFixture();
  const { configs } = recommendPatterns(categories, swatches, 'categorical');
  const result = repairImage(image, swatches, categories, 'categorical', configs);

  it('memberi pola pada area dan legenda kategori yang disertakan', () => {
    expect(result.appliedColorIds).toEqual(['light', 'dark']);
    expect(result.warnings).toEqual([]);
    for (const rect of [RECTS.lightArea, RECTS.lightLegend, RECTS.darkArea, RECTS.darkLegend]) {
      expect(changedIn(image, result.image, rect)).toBeGreaterThan(0);
    }
  });

  it('hanya mengubah piksel warna target yang berjarak ≥ 3 px dari warna lain', () => {
    const src = (x: number, y: number) => pixelAt(image, x, y).join();
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (src(x, y) === pixelAt(result.image, x, y).join()) continue;
        expect([COLORS.light, COLORS.dark].map((h) => pixelAt(solidImage(1, 1, h), 0, 0).join())).toContain(src(x, y));
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = Math.abs(dy) - 2; dx <= 2 - Math.abs(dy); dx++) expect(src(x + dx, y + dy)).toBe(src(x, y));
        }
      }
    }
    expect(changedIn(image, result.image, RECTS.excludedLegend)).toBe(0);
  });

  it('memakai tinta kontras: gelap di warna terang, terang di warna gelap', () => {
    const inks = (rect: Rect, hex: string) => {
      const base = pixelAt(solidImage(1, 1, hex), 0, 0).join();
      const found = new Set<string>();
      for (let y = rect[1]; y < rect[1] + rect[3]; y++) {
        for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
          const out = pixelAt(result.image, x, y).join();
          if (out !== base && pixelAt(image, x, y).join() === base) found.add(out);
        }
      }
      return [...found];
    };
    expect(inks(RECTS.lightArea, COLORS.light)).toEqual(['0,0,0,255']);
    expect(inks(RECTS.darkArea, COLORS.dark)).toEqual(['255,255,255,255']);
  });

  it('legenda memakai pola yang identik dengan area kategorinya', () => {
    const { image: out } = repairImage(image, swatches, categories, 'categorical', [
      { colorId: 'light', kind: 'horizontal', spacingPx: 6 },
      { colorId: 'dark', kind: 'diagonal', spacingPx: 6 },
    ]);
    // Interior rect (tanpa tepi 2 px dan blok teks): setiap piksel mengikuti satu aturan pola.
    const check = ([x0, y0, w]: Rect, inked: (x: number, y: number) => boolean) => {
      for (let y = y0 + 2; y < y0 + 5; y++) {
        for (let x = x0 + 2; x < x0 + w - 2; x++) {
          expect(pixelAt(out, x, y).join() !== pixelAt(image, x, y).join()).toBe(inked(x, y));
        }
      }
    };
    for (const rect of [RECTS.lightArea, RECTS.lightLegend]) check(rect, (_x, y) => y % 6 < 2);
    for (const rect of [RECTS.darkArea, RECTS.darkLegend]) check(rect, (x, y) => (x + y) % 6 < 2);
  });

  it('tidak memutasi sumber dan mempertahankan dimensi serta alpha', () => {
    expect(image.data).toEqual(chartFixture().image.data);
    expect(result.image).not.toBe(image);
    expect([result.image.width, result.image.height]).toEqual([image.width, image.height]);
    for (let p = 3; p < image.data.length; p += 4) expect(result.image.data[p]).toBe(image.data[p]);
  });
});

describe('repairImage perilaku lain', () => {
  it('tidak mengubah piksel transparan meski RGB-nya cocok', () => {
    const { image, swatches, categories } = chartFixture();
    const hole: Rect = [4, 4, 5, 5];
    fillRect(image, hole, COLORS.light, 0);
    const result = repairImage(image, swatches, categories, 'categorical', configsFor('horizontal', 4));
    expect(changedIn(image, result.image, hole)).toBe(0);
  });

  it('toleransi menangkap warna yang sedikit bergeser, tapi tidak pada toleransi 0', () => {
    const { image, swatches, categories } = chartFixture();
    fillRect(image, RECTS.lightArea, '#FDD34D');
    const configs = configsFor('horizontal', 4);
    expect(changedIn(image, repairImage(image, swatches, categories, 'categorical', configs).image, RECTS.lightArea)).toBeGreaterThan(0);
    expect(changedIn(image, repairImage(image, swatches, categories, 'categorical', configs, 0).image, RECTS.lightArea)).toBe(0);
  });

  it('deterministik dan re-render tidak menumpuk', () => {
    const { image, swatches, categories } = chartFixture();
    const run = (kind: PatternKind) => repairImage(image, swatches, categories, 'categorical', configsFor(kind)).image.data;
    const dotsFirst = run('dots');
    expect(run('crosshatch')).not.toEqual(dotsFirst);
    expect(run('dots')).toEqual(dotsFirst);
    expect(image.data).toEqual(chartFixture().image.data);
  });

  it('ordinal: tingkat lebih tinggi lebih rapat', () => {
    const { image, swatches, categories } = chartFixture();
    const { configs } = recommendPatterns(categories, swatches, 'ordinal');
    const { image: out } = repairImage(image, swatches, categories, 'ordinal', configs);
    const area = (r: Rect) => r[2] * r[3];
    const density = (r: Rect) => changedIn(image, out, r) / area(r);
    expect(density(RECTS.darkArea)).toBeGreaterThan(2 * density(RECTS.lightArea));
  });

  it('config tidak valid: salinan utuh tanpa pola dan error masuk warnings', () => {
    const { image, swatches, categories } = chartFixture();
    const result = repairImage(image, swatches, categories, 'categorical', configsFor('diagonal', 0));
    expect(result.image).not.toBe(image);
    expect(result.image.data).toEqual(image.data);
    expect(result.appliedColorIds).toEqual([]);
    expect(result.warnings.join()).toContain('px');
  });

  it('memperingatkan warna tidak ditemukan, hanya garis tipis, dan area terlalu kecil', () => {
    const { image, swatches, categories } = chartFixture();
    fillRect(image, [52, 35, 6, 6], '#E91E63'); // sisa 2×2 setelah tepi dibuang, terkena garis diagonal
    fillRect(image, [33, 40, 16, 3], '#00BCD4');
    swatches.push({ id: 'tiny', hex: '#E91E63' }, { id: 'thin', hex: '#00BCD4' });
    categories.splice(0, 1, { colorId: 'tiny', label: 'Kecil', included: true, order: null });
    categories.push(
      { colorId: 'thin', label: 'Tipis', included: true, order: null },
      { colorId: 'light', label: 'Hilang', included: true, order: null },
    );
    fillRect(image, RECTS.lightArea, COLORS.background);
    fillRect(image, RECTS.lightLegend, COLORS.background);
    const { configs } = recommendPatterns(categories, swatches, 'categorical');
    const result = repairImage(image, swatches, categories, 'categorical', configs);
    expect(result.appliedColorIds).toEqual(['tiny', 'dark']);
    expect(result.warnings.find((w) => w.includes('"Kecil"'))).toContain('sangat kecil');
    expect(result.warnings.find((w) => w.includes('"Tipis"'))).toContain('garis atau area tipis');
    expect(result.warnings.find((w) => w.includes('"Hilang"'))).toContain('tidak ditemukan');
  });

  it('warna tanpa piksel pola tidak disebut "sangat kecil"', () => {
    const { image, swatches, categories } = chartFixture();
    fillRect(image, [52, 37, 6, 6], '#E91E63'); // sisa 2×2 setelah tepi dibuang, jatuh di sela garis diagonal
    swatches.push({ id: 'tiny', hex: '#E91E63' });
    categories.splice(0, 1, { colorId: 'tiny', label: 'Kecil', included: true, order: null });
    const { configs } = recommendPatterns(categories, swatches, 'categorical');
    const result = repairImage(image, swatches, categories, 'categorical', configs);
    expect(result.appliedColorIds).not.toContain('tiny');
    expect(result.warnings.filter((w) => w.includes('"Kecil"'))).toEqual([
      'Warna "Kecil" hanya ditemukan sebagai garis atau area tipis; pola tidak diterapkan.',
    ]);
  });

  it('memperingatkan pola tidak merata: area terpecah atau porsinya sangat kecil', () => {
    const swatches = [
      { id: 'bg', hex: COLORS.background },
      { id: 'light', hex: COLORS.light },
    ];
    const categories = [{ colorId: 'light', label: 'Terpecah', included: true, order: null }];
    const configs: PatternConfig[] = [{ colorId: 'light', kind: 'diagonal', spacingPx: 6 }];
    const uneven = (image: ImageData) =>
      repairImage(image, swatches, categories, 'categorical', configs).warnings.filter((w) => w.includes('tidak merata'));

    const striped = solidImage(80, 40, COLORS.background);
    fillRect(striped, [2, 2, 14, 14], COLORS.light); // satu blok berpola
    for (let i = 0; i < 10; i++) fillRect(striped, [20 + i * 4, 2, 2, 20], COLORS.light); // garis 2 px hilang saat erosi
    expect(uneven(striped)).toHaveLength(1);

    const sparse = solidImage(400, 400, COLORS.background);
    fillRect(sparse, [2, 2, 14, 14], COLORS.light); // 196 px < 0,2% dari 160.000 px
    expect(uneven(sparse)).toHaveLength(1);

    const { image, swatches: fixtureSwatches, categories: fixtureCategories } = chartFixture();
    const { configs: fixtureConfigs } = recommendPatterns(fixtureCategories, fixtureSwatches, 'categorical');
    expect(
      repairImage(image, fixtureSwatches, fixtureCategories, 'categorical', fixtureConfigs).warnings.some((w) =>
        w.includes('tidak merata'),
      ),
    ).toBe(false);
  });

  it('strip 8 px tetap berpola, tetapi diperingatkan jika jauh lebih sempit daripada jarak polanya', () => {
    const image = solidImage(400, 400, COLORS.background);
    fillRect(image, [20, 100, 300, 8], COLORS.light);
    const swatches = [
      { id: 'bg', hex: COLORS.background },
      { id: 'light', hex: COLORS.light },
    ];
    const categories = [{ colorId: 'light', label: 'Garis', included: true, order: null }];
    const run = (spacingPx: number) =>
      repairImage(image, swatches, categories, 'categorical', [{ colorId: 'light', kind: 'diagonal', spacingPx }]);

    const wide = run(20);
    expect(wide.appliedColorIds).toEqual(['light']);
    expect(wide.warnings).toEqual([
      'Area warna "Garis" lebih sempit daripada jarak polanya sehingga pola tampak terputus-putus. Periksa preview.',
    ]);
    expect(run(10).warnings).toEqual([]); // 8 px masih ≥ separuh jarak 10 px
  });

  it('warning ordinal rapat ikut muncul di repairImage', () => {
    const { image, swatches, categories } = chartFixture();
    const configs: PatternConfig[] = [
      { colorId: 'light', kind: 'diagonal', spacingPx: 10 },
      { colorId: 'dark', kind: 'diagonal', spacingPx: 8 },
    ];
    const result = repairImage(image, swatches, categories, 'ordinal', configs);
    expect(result.appliedColorIds).toEqual(['light', 'dark']);
    expect(result.warnings.some((w) => w.includes('sulit dibedakan'))).toBe(true);
  });

  it('titik pola dibatasi agar warna fill tetap dominan', () => {
    const image = solidImage(40, 40, COLORS.light);
    const swatches = [{ id: 'light', hex: COLORS.light }];
    const categories = [{ colorId: 'light', label: null, included: true, order: null }];
    const share = (spacingPx: number, [x0, x1]: [number, number]) => {
      const { image: out } = repairImage(image, swatches, categories, 'categorical', [
        { colorId: 'light', kind: 'dots', spacingPx },
      ]);
      return changedIn(image, out, [x0, x0, x1 - x0, x1 - x0]) / (x1 - x0) ** 2;
    };
    expect(share(10, [10, 30])).toBe(0.12); // jari-jari 2: 12 px per sel 10×10
    expect(share(4, [4, 36])).toBe(0.25); // dibatasi jarak/3: 4 px per sel 4×4
  });

  it('memperingatkan warna yang terlalu mirip dengan swatch lain atau yang memenuhi tepi gambar', () => {
    const { image, swatches, categories } = chartFixture();
    swatches.push({ id: 'near', hex: '#FFD650' });
    categories.push({ colorId: 'background', label: 'Latar', included: true, order: null });
    const configs = [...configsFor('diagonal'), { colorId: 'background', kind: 'crosshatch', spacingPx: 8 } as const];
    const { warnings } = repairImage(image, swatches, categories, 'categorical', configs);
    expect(warnings.some((w) => w.includes('"Rendah" terlalu mirip dengan warna "near"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"Latar" memenuhi sebagian besar tepi gambar'))).toBe(true);
  });
});

describe('batas 1–4 kategori dan jenis pola unik', () => {
  const HEXES = ['#E41A1C', '#377EB8', '#4DAF4A', '#984EA3', '#FF7F00'];
  // Satu blok warna per kategori, dipisah latar putih.
  const bands = (n: number) => {
    const image = solidImage(n * 30 + 2, 34, COLORS.background);
    const hexes = HEXES.slice(0, n);
    hexes.forEach((hex, i) => fillRect(image, [2 + i * 30, 2, 28, 30], hex));
    const swatches = [{ id: 'bg', hex: COLORS.background }, ...hexes.map((hex, i) => ({ id: `c${i}`, hex }))];
    const categories = hexes.map((_, i) => ({ colorId: `c${i}`, label: `K${i}`, included: true, order: i + 1 }));
    return { image, swatches, categories };
  };
  const configsOf = (...kinds: PatternKind[]): PatternConfig[] =>
    kinds.map((kind, i) => ({ colorId: `c${i}`, kind, spacingPx: 8 }));
  const expectBlocked = (
    { image, swatches, categories }: ReturnType<typeof bands>,
    dataType: 'categorical' | 'ordinal',
    configs: PatternConfig[],
    message: string,
  ) => {
    expect(validatePatternConfigs(configs, categories, swatches, dataType).errors.join()).toContain(message);
    const result = repairImage(image, swatches, categories, dataType, configs);
    expect(result.image).not.toBe(image);
    expect(result.image.data).toEqual(image.data);
    expect(result.appliedColorIds).toEqual([]);
    expect(result.warnings.join()).toContain(message);
  };

  it('dua kategori boleh memakai pasangan mana pun dari empat jenis', () => {
    const { image, swatches, categories } = bands(2);
    for (const first of PATTERN_KINDS) {
      for (const second of PATTERN_KINDS.filter((k) => k !== first)) {
        const result = repairImage(image, swatches, categories, 'categorical', configsOf(first, second));
        expect(result.appliedColorIds).toEqual(['c0', 'c1']);
        expect(result.warnings).toEqual([]);
      }
    }
  });

  it('empat kategori dengan jenis unik ter-render', () => {
    const { image, swatches, categories } = bands(4);
    const result = repairImage(image, swatches, categories, 'categorical', configsOf(...PATTERN_KINDS));
    expect(result.appliedColorIds).toEqual(['c0', 'c1', 'c2', 'c3']);
    expect(result.warnings).toEqual([]);
  });

  it.each(['categorical', 'ordinal'] as const)('lima kategori %s ditolak tanpa mengubah piksel', (dataType) => {
    const fixture = bands(5);
    expect(recommendPatterns(fixture.categories, fixture.swatches, dataType).configs).toEqual([]);
    // Konfigurasi buatan tangan pun tidak boleh meloloskan sebagian kategori.
    expectBlocked(fixture, dataType, configsOf(...PATTERN_KINDS), '1–4 kategori');
  });

  it('jenis pola duplikat pada categorical diblok', () => {
    expectBlocked(bands(2), 'categorical', configsOf('dots', 'dots'), 'dipakai bersama');
  });

  it.each(['categorical', 'ordinal'] as const)('kategori %s tanpa pola diblok seluruhnya', (dataType) => {
    expectBlocked(bands(2), dataType, configsOf('diagonal'), 'belum diberi pola');
  });

  it.each([
    ['terbalik', 8, 16],
    ['sama', 8, 8],
    ['sama setelah dibulatkan', 10.4, 10.2],
  ])('kerapatan ordinal %s diblok', (_, low, high) => {
    const configs: PatternConfig[] = [
      { colorId: 'c0', kind: 'diagonal', spacingPx: low },
      { colorId: 'c1', kind: 'diagonal', spacingPx: high },
    ];
    expectBlocked(bands(2), 'ordinal', configs, 'lebih rapat');
  });
});

describe('deteksi latar dari piksel tepi', () => {
  const swatches = [
    { id: 'bg', hex: COLORS.background },
    { id: 'big', hex: COLORS.light },
  ];
  const categories = [{ colorId: 'big', label: 'Luas', included: true, order: null }];
  const configs: PatternConfig[] = [{ colorId: 'big', kind: 'diagonal', spacingPx: 6 }];
  const backgroundWarning = (image: ImageData) =>
    repairImage(image, swatches, categories, 'categorical', configs).warnings.some((w) => w.includes('tepi gambar'));

  it('kategori peta yang lebih luas dari latar tidak dianggap latar', () => {
    const image = solidImage(40, 40, COLORS.background);
    fillRect(image, [2, 2, 36, 36], COLORS.light); // 81% kanvas, tetapi tepi tetap putih
    expect(backgroundWarning(image)).toBe(false);
  });

  it('kategori yang memenuhi tepi gambar dianggap kemungkinan latar', () => {
    const image = solidImage(40, 40, COLORS.light);
    fillRect(image, [10, 10, 20, 20], COLORS.background); // putih justru di tengah
    expect(backgroundWarning(image)).toBe(true);
  });

  it('piksel tepi transparan tidak dihitung', () => {
    const image = solidImage(40, 40, COLORS.light);
    for (const rect of [[0, 0, 40, 1], [0, 39, 40, 1], [0, 0, 1, 40], [39, 0, 1, 40]] as const) {
      fillRect(image, rect, COLORS.light, 0);
    }
    fillRect(image, [0, 0, 40, 1], COLORS.background); // satu-satunya tepi opak: putih
    expect(backgroundWarning(image)).toBe(false);
  });
});

describe('skala pola', () => {
  it('scale 1 sampai 1000 px, lalu naik akar kuadrat, dibatasi 2,5', () => {
    expect(patternScale(500, 800)).toBe(1);
    expect(patternScale(1000, 10)).toBe(1);
    expect(patternScale(4000, 10)).toBe(2);
    expect(patternScale(4096, 4096)).toBeCloseTo(2.024, 3);
    expect(patternScale(8040, 4800)).toBe(2.5);
  });

  it('gambar 4000 px: jarak dan tebal pola ×2, tetapi tepi yang dilindungi tetap 2 px', () => {
    const image = solidImage(4000, 40, COLORS.light);
    const swatches = [{ id: 'light', hex: COLORS.light }];
    const categories = [{ colorId: 'light', label: null, included: true, order: null }];
    const configs: PatternConfig[] = [{ colorId: 'light', kind: 'horizontal', spacingPx: 10 }];
    const { image: out } = repairImage(image, swatches, categories, 'categorical', configs);
    // Baris 0–1 = tepi 2 px yang dilindungi; mulai baris 2 pola berlaku (jarak 20, tebal 4).
    for (let y = 0; y < 40; y++) {
      expect(pixelAt(out, 100, y)[0] === 0).toBe(y >= 2 && y < 38 && y % 20 < 4);
    }
    expect(repairImage(image, swatches, categories, 'categorical', configs).image.data).toEqual(out.data);
  });
});
