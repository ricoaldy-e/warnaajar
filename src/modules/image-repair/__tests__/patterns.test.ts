import { describe, expect, it } from 'vitest';
import type { ColorSwatch, PatternConfig, PatternKind, SemanticCategory } from '@/types';
import { MAX_SPACING_PX, MIN_SPACING_PX } from '../constants';
import { recommendPatterns, resetPatterns, validatePatternConfigs } from '../patterns';

// Fixture uji, bukan data produksi.
const cat = (colorId: string, extra: Partial<SemanticCategory> = {}): SemanticCategory => ({
  colorId,
  label: colorId,
  included: true,
  order: null,
  ...extra,
});
const swatchesFor = (categories: SemanticCategory[]): ColorSwatch[] =>
  categories.map((c) => ({ id: c.colorId, hex: '#000000' }));
const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
const ordinal = (n: number) => ids(n).map((id, i) => cat(id, { order: i + 1 }));

describe('recommendPatterns categorical', () => {
  it('memberi pola berbeda, menghormati saran, dan mengabaikan excluded', () => {
    const categories = [
      cat('a'),
      cat('b', { suggestedPattern: 'diagonal' }),
      cat('c', { suggestedPattern: 'diagonal' }),
      cat('deco', { included: false, suggestedPattern: 'dots' }),
    ];
    const { configs, warnings } = recommendPatterns(categories, swatchesFor(categories), 'categorical');
    expect(configs.map((c) => [c.colorId, c.kind])).toEqual([
      ['a', 'dots'],
      ['b', 'diagonal'],
      ['c', 'horizontal'],
    ]);
    expect(warnings).toEqual([]);
  });

  it('mengabaikan saran yang tidak valid', () => {
    const categories = [cat('a', { suggestedPattern: 'zigzag' as PatternKind })];
    expect(recommendPatterns(categories, swatchesFor(categories), 'categorical').configs[0].kind).toBe('diagonal');
  });

  it('memperingatkan jika kategori melebihi jumlah pola', () => {
    const categories = ids(5).map((id) => cat(id));
    const { configs, warnings } = recommendPatterns(categories, swatchesFor(categories), 'categorical');
    expect(new Set(configs.map((c) => c.kind)).size).toBe(4);
    expect(configs).toHaveLength(4);
    expect(warnings.join()).toContain('c4');
  });
});

describe('recommendPatterns ordinal', () => {
  it('satu keluarga, makin rapat mengikuti order, bukan urutan input', () => {
    const categories = [cat('high', { order: 3 }), cat('low', { order: 1 }), cat('mid', { order: 2 })];
    const { configs } = recommendPatterns(categories, swatchesFor(categories), 'ordinal');
    expect(configs.map((c) => [c.colorId, c.kind, c.spacingPx])).toEqual([
      ['low', 'diagonal', 24],
      ['mid', 'diagonal', 15],
      ['high', 'diagonal', 6],
    ]);
  });

  it.each([
    ['null', [cat('a', { order: 1 }), cat('b')]],
    ['duplikat', [cat('a', { order: 1 }), cat('b', { order: 1 })]],
    ['pecahan', [cat('a', { order: 1.5 }), cat('b', { order: 2 })]],
    ['NaN', [cat('a', { order: NaN }), cat('b', { order: 2 })]],
  ])('menolak order %s', (_, categories) => {
    const { configs, warnings } = recommendPatterns(categories, swatchesFor(categories), 'ordinal');
    expect(configs).toEqual([]);
    expect(warnings).not.toEqual([]);
  });

  it('tingkat rapat diperingatkan oleh validasi, dan yang melebihi rentang ditolak', () => {
    const many = ordinal(19);
    const dense = recommendPatterns(many, swatchesFor(many), 'ordinal');
    expect(new Set(dense.configs.map((c) => c.spacingPx)).size).toBe(19);
    expect(dense.warnings).toEqual([]);
    const { warnings } = validatePatternConfigs(dense.configs, many, swatchesFor(many), 'ordinal');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('sulit dibedakan');

    const seven = ordinal(7); // selisih tepat 3 px
    const fine = recommendPatterns(seven, swatchesFor(seven), 'ordinal');
    expect(validatePatternConfigs(fine.configs, seven, swatchesFor(seven), 'ordinal').warnings).toEqual([]);

    const tooMany = ordinal(20);
    expect(recommendPatterns(tooMany, swatchesFor(tooMany), 'ordinal').configs).toEqual([]);
  });
});

describe('mapping tidak valid', () => {
  it.each([
    ['unknown', [cat('a')], [cat('a')], 'unknown'],
    ['tanpa included', [cat('a', { included: false })], [cat('a')], 'categorical'],
    ['swatch tidak ada', [cat('a')], [], 'categorical'],
    ['colorId ganda', [cat('a'), cat('a')], [cat('a')], 'categorical'],
  ] as const)('%s', (_, categories, known, dataType) => {
    const result = recommendPatterns([...categories], swatchesFor([...known]), dataType);
    expect(result.configs).toEqual([]);
    expect(result.warnings).not.toEqual([]);
    expect(validatePatternConfigs([], [...categories], swatchesFor([...known]), dataType).errors).not.toEqual([]);
  });
});

describe('validatePatternConfigs', () => {
  const categories = [cat('a', { order: 1 }), cat('b', { order: 2 }), cat('x', { included: false })];
  const swatches = swatchesFor(categories);
  const config = (colorId: string, spacingPx = 10, kind: PatternKind = 'diagonal'): PatternConfig => ({
    colorId,
    kind,
    spacingPx,
  });
  const check = (configs: PatternConfig[], dataType: 'categorical' | 'ordinal' = 'categorical') =>
    validatePatternConfigs(configs, categories, swatches, dataType);

  it('menerima rekomendasi awal tanpa error maupun warning', () => {
    for (const dataType of ['categorical', 'ordinal'] as const) {
      const { configs } = recommendPatterns(categories, swatches, dataType);
      expect(check(configs, dataType)).toEqual({ errors: [], warnings: [] });
    }
  });

  it.each([0, -1, NaN, Infinity, MIN_SPACING_PX - 1, MAX_SPACING_PX + 1])('menolak spacing %s', (spacing) => {
    expect(check([config('a', spacing), config('b', 10, 'dots')]).errors).toHaveLength(1);
  });

  it('menerima spacing tepat di batas', () => {
    expect(check([config('a', MIN_SPACING_PX), config('b', MAX_SPACING_PX, 'dots')]).errors).toEqual([]);
  });

  it('menolak colorId excluded, tak dikenal, atau ganda', () => {
    for (const bad of ['x', 'zzz', 'a']) {
      expect(check([config('a'), config('b', 10, 'dots'), config(bad)]).errors).not.toEqual([]);
    }
  });

  it('memperingatkan pola duplikat dan kategori tanpa pola', () => {
    expect(check([config('a'), config('b', 20)]).warnings).toHaveLength(1);
    expect(check([config('a')]).warnings).toHaveLength(1);
  });

  it('memperingatkan kerapatan ordinal terbalik, sama, atau beda keluarga', () => {
    expect(check([config('a', 8), config('b', 16)], 'ordinal').warnings).toHaveLength(1);
    expect(check([config('a', 8), config('b', 8)], 'ordinal').warnings).toHaveLength(1);
    expect(check([config('a', 10.4), config('b', 10.2)], 'ordinal').warnings).toHaveLength(1);
    expect(check([config('a', 16), config('b', 8, 'dots')], 'ordinal').warnings).toHaveLength(1);
    expect(check([config('a', 10), config('b', 8)], 'ordinal').warnings).toEqual([
      'Selisih jarak arsir kurang dari 3 px sehingga sulit dibedakan: "a" → "b".',
    ]);
  });
});

describe('resetPatterns', () => {
  it('mengembalikan rekomendasi awal setelah konfigurasi diubah', () => {
    const categories = [cat('a'), cat('b')];
    const swatches = swatchesFor(categories);
    const initial = recommendPatterns(categories, swatches, 'categorical');
    const edited = resetPatterns(categories, swatches, 'categorical');
    edited.configs[0].spacingPx = 30;
    expect(resetPatterns(categories, swatches, 'categorical')).toEqual(initial);
  });
});
