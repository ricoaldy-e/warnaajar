// @vitest-environment node
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ColorAnalysisResult, ColorConflict, ColorSwatch, SemanticAnalysis, SemanticCategory } from '@/types';
import {
  analysisContextSchema, colorAnalysisSchema, colorConflictSchema, colorSwatchSchema,
  confirmedMappingSchema, semanticAnalysisSchema, semanticAnalysisSchemaFor, semanticCategorySchema,
} from '../schemas';
import { analysis, mapping, semantic } from './fixtures';

it.each([1, 4])('mapping terkonfirmasi menerima %s included dan banyak excluded', (count) => {
  const categories = Array.from({ length: count + 6 }, (_, index) => ({
    colorId: `limit-${index}`, label: `Kategori ${index}`, included: index < count, order: null,
  }));
  expect(confirmedMappingSchema.parse({ dataType: 'categorical', categories }).categories).toHaveLength(count + 6);
});

it('mapping terkonfirmasi menolak lima kategori included', () => {
  const categories = Array.from({ length: 5 }, (_, index) => ({
    colorId: `limit-${index}`, label: `Kategori ${index}`, included: true, order: null,
  }));
  expect(confirmedMappingSchema.safeParse({ dataType: 'categorical', categories }).success).toBe(false);
});

it('schema menggunakan bentuk shared types existing', () => {
  expectTypeOf<z.output<typeof colorSwatchSchema>>().toEqualTypeOf<ColorSwatch>();
  expectTypeOf<z.output<typeof colorConflictSchema>>().toEqualTypeOf<ColorConflict>();
  expectTypeOf<z.output<typeof colorAnalysisSchema>>().toEqualTypeOf<ColorAnalysisResult>();
  expectTypeOf<z.output<typeof semanticCategorySchema>>().toEqualTypeOf<SemanticCategory>();
  expectTypeOf<z.output<typeof semanticAnalysisSchema>>().toEqualTypeOf<SemanticAnalysis>();
});

describe('analisis warna', () => {
  it('menerima fixture tanpa memutasi atau mengubah hex', () => {
    const value = structuredClone(analysis);
    value.colors[0].hex = '#abcdef';
    expect(colorAnalysisSchema.parse(value)).toEqual(value);
  });
  it.each(['red', '#123', '#GG1122', '#12345678'])('menolak hex %s', (hex) => {
    expect(colorSwatchSchema.safeParse({ id: 'c1', hex }).success).toBe(false);
  });
  it.each([
    { ...analysis, colors: [...analysis.colors, analysis.colors[0]] },
    { ...analysis, colors: [{ id: ' ', hex: '#FFFFFF' }] },
    { ...analysis, threshold: 0 }, { ...analysis, threshold: Infinity },
    { ...analysis, threshold: NaN },
    { ...analysis, conflicts: [{ ...analysis.conflicts[0], deltaE: -1 }] },
    { ...analysis, conflicts: [{ ...analysis.conflicts[0], deltaE: Infinity }] },
    { ...analysis, conflicts: [{ ...analysis.conflicts[0], colorBId: 'unknown' }] },
    { ...analysis, conflicts: [{ ...analysis.conflicts[0], colorBId: 'c1' }] },
    { ...analysis, conflicts: [{ ...analysis.conflicts[0], mode: 'normal' }] },
    { ...analysis, conflicts: [...analysis.conflicts, { ...analysis.conflicts[0], colorAId: 'c2', colorBId: 'c1' }] },
  ])('menolak angka, ID, pasangan, dan enum invalid (%#)', (value) => {
    expect(colorAnalysisSchema.safeParse(value).success).toBe(false);
  });
  it('pasangan yang sama pada mode berbeda valid; aturan threshold belum dikunci', () => {
    expect(colorAnalysisSchema.safeParse({
      ...analysis, conflicts: [...analysis.conflicts, { ...analysis.conflicts[0], mode: 'protan', deltaE: 10 }],
    }).success).toBe(true);
  });
});

describe('semantic dan mapping terkonfirmasi', () => {
  it('menerima semantic yang merujuk swatch aktif', () => {
    expect(semanticAnalysisSchemaFor(analysis.colors).parse(semantic)).toEqual(semantic);
  });
  it('menerima usulan ordinal yang belum pasti, tetapi menolak sebagai mapping konfirmasi', () => {
    const value = { ...semantic, dataType: 'ordinal', categories: [{ ...semantic.categories[0], label: null, order: null }], warnings: ['Legenda ambigu.'] };
    expect(semanticAnalysisSchema.safeParse(value).success).toBe(true);
    expect(confirmedMappingSchema.safeParse({ dataType: value.dataType, categories: value.categories }).success).toBe(false);
  });
  it('menerima unknown untuk hasil usulan AI', () => {
    expect(semanticAnalysisSchema.safeParse({ ...semantic, visualType: 'unknown', dataType: 'unknown', categories: [], warnings: ['Visual tidak didukung.'] }).success).toBe(true);
  });
  it.each([
    { ...semantic, visualType: 'photo' }, { ...semantic, dataType: 'continuous' },
    { ...semantic, categories: [...semantic.categories, semantic.categories[0]] },
    { ...semantic, categories: [{ ...semantic.categories[0], suggestedPattern: 'stars' }] },
    { ...semantic, categories: [{ ...semantic.categories[0], order: 1.5 }] },
    { ...semantic, explanation: '' }, { ...semantic, warnings: 'ambiguous' },
  ])('menolak semantic invalid (%#)', (value) => {
    expect(semanticAnalysisSchema.safeParse(value).success).toBe(false);
  });
  it('menolak colorId asing saat daftar swatch tersedia', () => {
    expect(semanticAnalysisSchemaFor(analysis.colors).safeParse({
      ...semantic, categories: [{ ...semantic.categories[0], colorId: 'invented' }],
    }).success).toBe(false);
  });
  it('menerima categorical dan ordinal dengan integer unik tanpa memaksakan 1..N', () => {
    expect(confirmedMappingSchema.parse(mapping)).toEqual(mapping);
    expect(confirmedMappingSchema.safeParse({ dataType: 'ordinal', categories: [
      { ...semantic.categories[0], order: 10 }, { ...semantic.categories[1], order: 20 }, semantic.categories[2],
    ] }).success).toBe(true);
  });
  it.each([
    { ...mapping, dataType: 'unknown' }, { ...mapping, categories: [] },
    { ...mapping, categories: [semantic.categories[2]] },
    { ...mapping, categories: [{ ...semantic.categories[0], label: null }] },
    { ...mapping, categories: [{ ...semantic.categories[0], label: ' ' }] },
    { ...mapping, categories: [{ ...semantic.categories[0], order: 1 }] },
    { ...mapping, dataType: 'ordinal', categories: semantic.categories },
    { ...mapping, dataType: 'ordinal', categories: [{ ...semantic.categories[0], order: 1 }, { ...semantic.categories[1], order: 1 }] },
    { ...mapping, dataType: 'ordinal', categories: [{ ...semantic.categories[0], order: 1.2 }] },
    { ...mapping, dataType: 'ordinal', categories: [{ ...semantic.categories[0], order: 1 }, { ...semantic.categories[2], order: 2 }] },
    { ...mapping, categories: [semantic.categories[0], semantic.categories[0]] },
  ])('menolak mapping yang belum layak dikonfirmasi (%#)', (value) => {
    expect(confirmedMappingSchema.safeParse(value).success).toBe(false);
  });
  it('context bersifat opsional dan tetap sesuai subject/grade', () => {
    expect(analysisContextSchema.safeParse({ subject: 'Geografi' }).success).toBe(true);
    expect(analysisContextSchema.safeParse({}).success).toBe(true);
    expect(analysisContextSchema.safeParse({ grade: 5 }).success).toBe(false);
    expect(analysisContextSchema.safeParse({ invented: true }).success).toBe(false);
  });
});
