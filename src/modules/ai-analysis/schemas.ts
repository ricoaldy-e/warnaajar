import { z } from 'zod';
import type { ColorAnalysisResult, ColorConflict, ColorSwatch, SemanticAnalysis, SemanticCategory } from '@/types';

const nonempty = z.string().min(1).refine((value) => value.trim().length > 0);
export const simulatedModeSchema = z.enum(['protan', 'deutan', 'tritan', 'grayscale']);
export const visualTypeSchema = z.enum(['bar', 'pie', 'line', 'map', 'table', 'unknown']);
export const dataTypeSchema = z.enum(['categorical', 'ordinal', 'unknown']);
export const patternKindSchema = z.enum(['diagonal', 'dots', 'horizontal', 'crosshatch']);

export const colorSwatchSchema = z.strictObject({
  id: nonempty,
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}) satisfies z.ZodType<ColorSwatch>;

export const colorConflictSchema = z.strictObject({
  colorAId: nonempty,
  colorBId: nonempty,
  mode: simulatedModeSchema,
  deltaE: z.number().finite().nonnegative(),
}).refine((value) => value.colorAId !== value.colorBId, {
  message: 'Konflik harus merujuk dua warna berbeda.',
}) satisfies z.ZodType<ColorConflict>;

export const colorAnalysisSchema = z.strictObject({
  colors: z.array(colorSwatchSchema),
  conflicts: z.array(colorConflictSchema),
  threshold: z.number().finite().positive(),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.colors.forEach((color, index) => {
    if (ids.has(color.id)) ctx.addIssue({ code: 'custom', path: ['colors', index, 'id'], message: 'ID warna duplikat.' });
    ids.add(color.id);
  });
  const pairs = new Set<string>();
  value.conflicts.forEach((conflict, index) => {
    if (!ids.has(conflict.colorAId) || !ids.has(conflict.colorBId)) {
      ctx.addIssue({ code: 'custom', path: ['conflicts', index], message: 'Referensi warna tidak dikenal.' });
    }
    const pair = JSON.stringify([conflict.mode, ...[conflict.colorAId, conflict.colorBId].sort()]);
    if (pairs.has(pair)) ctx.addIssue({ code: 'custom', path: ['conflicts', index], message: 'Pasangan konflik duplikat.' });
    pairs.add(pair);
  });
}) satisfies z.ZodType<ColorAnalysisResult>;

export const semanticCategorySchema = z.strictObject({
  colorId: nonempty,
  label: nonempty.nullable(),
  included: z.boolean(),
  order: z.number().int().nullable(),
  suggestedPattern: patternKindSchema.optional(),
}) satisfies z.ZodType<SemanticCategory>;

const categoriesSchema = z.array(semanticCategorySchema).refine(
  (categories) => new Set(categories.map((category) => category.colorId)).size === categories.length,
  { message: 'Referensi kategori duplikat.', params: { check: 'duplicate_color_id' } },
);

export const semanticAnalysisSchema = z.strictObject({
  visualType: visualTypeSchema,
  dataType: dataTypeSchema,
  categories: categoriesSchema,
  explanation: nonempty,
  warnings: z.array(nonempty),
}) satisfies z.ZodType<SemanticAnalysis>;

export function semanticAnalysisSchemaFor(colors: readonly ColorSwatch[]) {
  const ids = new Set(colors.map((color) => color.id));
  return semanticAnalysisSchema.refine(
    (value) => value.categories.every((category) => ids.has(category.colorId)),
    { message: 'Kategori merujuk ID warna yang tidak dikenal.', path: ['categories'], params: { check: 'color_id_reference' } },
  ).refine(
    (value) => value.dataType !== 'categorical' || value.categories.every((category) => category.order === null),
    { message: 'Urutan categorical harus null.', path: ['categories'], params: { check: 'categorical_order' } },
  ).refine(
    (value) => {
      if (value.dataType !== 'ordinal') return true;
      const known = value.categories.filter((category) => category.order !== null).map((category) => category.order);
      return new Set(known).size === known.length;
    },
    { message: 'Urutan ordinal yang diketahui harus unik.', path: ['categories'], params: { check: 'ordinal_order' } },
  );
}

// Wrapper internal sesuai CONTRACTS §2.1; belum menambah tipe publik di src/types.
export const confirmedMappingSchema = z.strictObject({
  dataType: z.enum(['categorical', 'ordinal']),
  categories: categoriesSchema,
}).superRefine((value, ctx) => {
  const included = value.categories.filter((category) => category.included);
  if (!included.length) ctx.addIssue({ code: 'custom', path: ['categories'], message: 'Minimal satu kategori disertakan.' });
  if (included.length > 4) ctx.addIssue({ code: 'custom', path: ['categories'], message: 'Perbaikan MVP mendukung maksimal empat kategori informasi.' });
  const orders = new Set<number>();
  value.categories.forEach((category, index) => {
    const path = ['categories', index];
    if (category.included && category.label === null) {
      ctx.addIssue({ code: 'custom', path: [...path, 'label'], message: 'Kategori terkonfirmasi memerlukan label.' });
    }
    if (value.dataType === 'categorical' || !category.included) {
      if (category.order !== null) ctx.addIssue({ code: 'custom', path: [...path, 'order'], message: 'Urutan harus null.' });
    } else if (category.order === null || orders.has(category.order)) {
      ctx.addIssue({ code: 'custom', path: [...path, 'order'], message: 'Urutan ordinal harus berupa bilangan bulat unik.' });
    } else {
      orders.add(category.order);
    }
  });
});

export const analysisContextSchema = z.strictObject({
  subject: nonempty.optional(),
  grade: nonempty.optional(),
});
