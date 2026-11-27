// Aturan konfigurasi pola (FR-07, FR-08). Pure functions; urutan "order" lebih besar = tingkat lebih tinggi.
import type { ColorSwatch, DataType, PatternConfig, PatternKind, SemanticCategory } from '@/types';
import {
  CATEGORICAL_SPACING_PX,
  MAX_SPACING_PX,
  MIN_ORDINAL_STEP_PX,
  MIN_SPACING_PX,
  ORDINAL_DENSEST_SPACING_PX,
  ORDINAL_PATTERN_KIND,
  ORDINAL_SPARSEST_SPACING_PX,
  PATTERN_KINDS,
} from './constants';

const nameOf = (c: SemanticCategory): string => c.label ?? c.colorId;

/** Masalah mapping yang membuat kategori included tidak aman diproses. */
function mappingErrors(
  included: SemanticCategory[],
  swatches: ColorSwatch[],
  dataType: DataType,
): string[] {
  if (dataType === 'unknown') return ['Jenis data belum diketahui. Konfirmasi categorical atau ordinal.'];
  if (included.length === 0) return ['Tidak ada kategori yang disertakan.'];

  const errors: string[] = [];
  const swatchIds = new Set(swatches.map((s) => s.id));
  const seen = new Set<string>();
  for (const c of included) {
    if (!swatchIds.has(c.colorId)) errors.push(`Warna "${c.colorId}" tidak ada pada daftar swatch.`);
    if (seen.has(c.colorId)) errors.push(`Warna "${c.colorId}" dipakai lebih dari satu kategori.`);
    seen.add(c.colorId);
  }

  if (dataType === 'ordinal') {
    const orders = included.map((c) => c.order);
    if (!orders.every((o) => Number.isInteger(o))) {
      errors.push('Data ordinal butuh urutan bilangan bulat pada semua kategori yang disertakan.');
    } else if (new Set(orders).size !== orders.length) {
      errors.push('Urutan ordinal duplikat. Setiap kategori harus punya urutan berbeda.');
    }
  }
  return errors;
}

/** Hanya dipanggil setelah mappingErrors memastikan semua order valid. */
const byOrder = (categories: SemanticCategory[]): SemanticCategory[] =>
  [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Rekomendasi awal untuk kategori included. Mapping tidak valid menghasilkan configs kosong.
 * Hasil mengikuti urutan input (ordinal: urutan tingkat).
 */
export function recommendPatterns(
  categories: SemanticCategory[],
  swatches: ColorSwatch[],
  dataType: DataType,
): { configs: PatternConfig[]; warnings: string[] } {
  const included = categories.filter((c) => c.included);
  const errors = mappingErrors(included, swatches, dataType);
  if (errors.length > 0) return { configs: [], warnings: errors };

  const warnings: string[] = [];

  if (dataType === 'ordinal') {
    const range = ORDINAL_SPARSEST_SPACING_PX - ORDINAL_DENSEST_SPACING_PX;
    const steps = included.length - 1;
    if (steps > range) {
      return {
        configs: [],
        warnings: [`Terlalu banyak tingkat (${included.length}); maksimum ${range + 1} tingkat.`],
      };
    }
    const step = steps === 0 ? 0 : range / steps;
    if (steps > 0 && step < MIN_ORDINAL_STEP_PX) {
      warnings.push(`${included.length} tingkat membuat selisih kerapatan kecil dan mungkin sulit dibedakan.`);
    }
    const configs = byOrder(included).map((c, rank) => ({
      colorId: c.colorId,
      kind: ORDINAL_PATTERN_KIND,
      spacingPx: Math.round(ORDINAL_SPARSEST_SPACING_PX - rank * step),
    }));
    return { configs, warnings };
  }

  // Saran valid diklaim lebih dulu agar tidak direbut pola cadangan kategori sebelumnya.
  const assigned = new Map<string, PatternKind>();
  const unused = new Set(PATTERN_KINDS);
  for (const c of included) {
    if (c.suggestedPattern && unused.delete(c.suggestedPattern)) assigned.set(c.colorId, c.suggestedPattern);
  }
  for (const c of included) {
    const [next] = unused;
    if (!assigned.has(c.colorId) && next) {
      unused.delete(next);
      assigned.set(c.colorId, next);
    }
  }

  const configs: PatternConfig[] = [];
  const skipped: string[] = [];
  for (const c of included) {
    const kind = assigned.get(c.colorId);
    if (kind) configs.push({ colorId: c.colorId, kind, spacingPx: CATEGORICAL_SPACING_PX });
    else skipped.push(nameOf(c));
  }
  if (skipped.length > 0) {
    warnings.push(
      `Hanya tersedia ${PATTERN_KINDS.length} pola untuk ${included.length} kategori. ` +
        `Belum diberi pola: ${skipped.join(', ')}. Tidak semua kategori terbedakan.`,
    );
  }
  return { configs, warnings };
}

/** Reset editor: rekomendasi bersifat deterministik, jadi cukup dihitung ulang dari mapping. */
export const resetPatterns = recommendPatterns;

/** errors = jangan dirender; warnings = boleh dirender tetapi tampilkan ke pengguna. */
export function validatePatternConfigs(
  configs: PatternConfig[],
  categories: SemanticCategory[],
  swatches: ColorSwatch[],
  dataType: DataType,
): { errors: string[]; warnings: string[] } {
  const included = categories.filter((c) => c.included);
  const errors = mappingErrors(included, swatches, dataType);
  if (errors.length > 0) return { errors, warnings: [] };

  const warnings: string[] = [];
  const includedIds = new Set(included.map((c) => c.colorId));
  const byColor = new Map<string, PatternConfig>();
  for (const config of configs) {
    const { colorId, kind, spacingPx } = config;
    if (!includedIds.has(colorId)) errors.push(`Pola merujuk warna "${colorId}" yang tidak disertakan.`);
    if (byColor.has(colorId)) errors.push(`Warna "${colorId}" memiliki lebih dari satu pola.`);
    if (!PATTERN_KINDS.includes(kind)) errors.push(`Jenis pola "${kind}" tidak dikenal.`);
    // Dibalik agar NaN ikut ditolak.
    if (!(spacingPx >= MIN_SPACING_PX && spacingPx <= MAX_SPACING_PX)) {
      errors.push(`Jarak pola warna "${colorId}" harus ${MIN_SPACING_PX}–${MAX_SPACING_PX} px.`);
    }
    byColor.set(colorId, config);
  }

  for (const c of included) {
    if (!byColor.has(c.colorId)) warnings.push(`Kategori "${nameOf(c)}" belum diberi pola.`);
  }

  if (dataType === 'categorical') {
    for (const kind of PATTERN_KINDS) {
      const names = included.filter((c) => byColor.get(c.colorId)?.kind === kind).map(nameOf);
      if (names.length > 1) warnings.push(`Pola "${kind}" dipakai bersama: ${names.join(', ')}.`);
    }
  } else {
    const ranked = byOrder(included).flatMap((c) => {
      const config = byColor.get(c.colorId);
      return config ? [{ name: nameOf(c), ...config }] : [];
    });
    if (new Set(ranked.map((r) => r.kind)).size > 1) {
      warnings.push('Data ordinal harus memakai satu keluarga pola yang sama.');
    }
    for (let i = 1; i < ranked.length; i++) {
      // Dibandingkan setelah dibulatkan karena renderer membulatkan jarak ke piksel utuh.
      if (!(Math.round(ranked[i].spacingPx) < Math.round(ranked[i - 1].spacingPx))) {
        warnings.push(`Arsir "${ranked[i].name}" harus lebih rapat daripada "${ranked[i - 1].name}".`);
      }
    }
  }

  return { errors, warnings };
}
