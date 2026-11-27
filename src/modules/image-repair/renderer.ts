import { wcagContrast } from 'culori';
import type { ColorSwatch, DataType, PatternConfig, PatternKind, RepairResult, SemanticCategory } from '@/types';
import {
  DEFAULT_MASK_TOLERANCE,
  MASK_EDGE_INSET_PX,
  MAX_PATTERN_SCALE,
  MIN_COLOR_PIXEL_SHARE,
  MIN_MASK_AREA_PX,
  MIN_THICKNESS_SPACING_RATIO,
  MIN_USABLE_MASK_SHARE,
  PATTERN_DOT_RADIUS_PX,
  PATTERN_INK_DARK,
  PATTERN_INK_LIGHT,
  PATTERN_LINE_WIDTH_PX,
  PATTERN_SCALE_REFERENCE_PX,
} from './constants';
import { buildCategoryMask, findOverlappingSwatches } from './masking';
import { validatePatternConfigs } from './patterns';

export function patternScale(width: number, height: number): number {
  const ratio = Math.max(width, height) / PATTERN_SCALE_REFERENCE_PX;
  return Math.min(MAX_PATTERN_SCALE, Math.max(1, Math.sqrt(ratio)));
}

// Dijangkar ke (0,0) agar area dan legenda memakai fase yang sama.
function patternAt(kind: PatternKind, spacingPx: number, scale: number): (x: number, y: number) => boolean {
  const s = Math.round(spacingPx * scale);
  const t = Math.max(1, Math.round(PATTERN_LINE_WIDTH_PX * scale));
  switch (kind) {
    case 'horizontal':
      return (_x, y) => y % s < t;
    case 'diagonal':
      return (x, y) => (x + y) % s < t;
    case 'crosshatch':
      return (x, y) => (x + y) % s < t || (((x - y) % s) + s) % s < t;
    case 'dots': {
      const c = (s - 1) / 2;
      const r2 = Math.min(PATTERN_DOT_RADIUS_PX * scale, s / 3) ** 2;
      return (x, y) => ((x % s) - c) ** 2 + ((y % s) - c) ** 2 <= r2;
    }
  }
}

const bytes = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const DARK = bytes(PATTERN_INK_DARK);
const LIGHT = bytes(PATTERN_INK_LIGHT);
const inkFor = (hex: string): number[] =>
  wcagContrast(hex, PATTERN_INK_DARK) >= wcagContrast(hex, PATTERN_INK_LIGHT) ? DARK : LIGHT;

// Selalu bekerja pada salinan; `source` tidak dimutasi.
export function repairImage(
  source: ImageData,
  swatches: ColorSwatch[],
  categories: SemanticCategory[],
  dataType: DataType,
  configs: PatternConfig[],
  tolerance = DEFAULT_MASK_TOLERANCE,
): RepairResult {
  const { width, height } = source;
  const image = new ImageData(new Uint8ClampedArray(source.data), width, height, {
    colorSpace: source.colorSpace,
  });
  const { errors, warnings } = validatePatternConfigs(configs, categories, swatches, dataType);
  if (errors.length > 0) return { image, appliedColorIds: [], warnings: [...errors, ...warnings] };

  const name = (id: string) => categories.find((c) => c.colorId === id)?.label ?? id;
  const targetIds = configs.map((c) => c.colorId);
  const scale = patternScale(width, height);
  const { mask, areas, pixels, thickness, opaquePixels, backgroundTarget } = buildCategoryMask(
    source,
    swatches,
    targetIds,
    tolerance,
    MASK_EDGE_INSET_PX,
  );

  for (const [a, b] of findOverlappingSwatches(swatches, targetIds, tolerance)) {
    warnings.push(`Warna "${name(a)}" terlalu mirip dengan warna "${name(b)}"; pola bisa salah sasaran. Periksa preview.`);
  }
  if (backgroundTarget >= 0) {
    warnings.push(
      `Warna "${name(targetIds[backgroundTarget])}" memenuhi sebagian besar tepi gambar dan kemungkinan merupakan latar. ` +
        'Jika benar, kecualikan warna ini agar latar tidak ikut berpola.',
    );
  }

  const hexOf = new Map(swatches.map((s) => [s.id, s.hex]));
  const pens = configs.map((c, k) =>
    areas[k] > 0 ? { inside: patternAt(c.kind, c.spacingPx, scale), ink: inkFor(hexOf.get(c.colorId) ?? '') } : null,
  );

  const { data } = image;
  const inked = configs.map(() => 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pen = mask[i] >= 0 ? pens[mask[i]] : null;
      if (!pen || !pen.inside(x, y)) continue;
      data.set(pen.ink, i * 4); // RGB saja; alpha sumber tetap.
      inked[mask[i]]++;
    }
  }

  const minArea = MIN_MASK_AREA_PX * scale * scale;
  configs.forEach(({ colorId, spacingPx }, k) => {
    const label = `"${name(colorId)}"`;
    if (pixels[k] === 0) {
      warnings.push(`Warna ${label} tidak ditemukan pada gambar; pola tidak diterapkan.`);
    } else if (inked[k] === 0) {
      warnings.push(`Warna ${label} hanya ditemukan sebagai garis atau area tipis; pola tidak diterapkan.`);
    } else if (areas[k] < minArea) {
      warnings.push(`Area warna ${label} sangat kecil (${areas[k]} px); pola mungkin tidak terlihat jelas.`);
    } else if (areas[k] < MIN_USABLE_MASK_SHARE * pixels[k] || pixels[k] < MIN_COLOR_PIXEL_SHARE * opaquePixels) {
      warnings.push(
        `Pola warna ${label} tidak merata: sebagian besar areanya terlalu tipis, terpecah, atau bergradasi. Periksa preview.`,
      );
    } else if (thickness[k] < MIN_THICKNESS_SPACING_RATIO * Math.round(spacingPx * scale)) {
      warnings.push(
        `Area warna ${label} lebih sempit daripada jarak polanya sehingga pola tampak terputus-putus. Periksa preview.`,
      );
    }
  });

  return { image, appliedColorIds: targetIds.filter((_, k) => inked[k] > 0), warnings };
}
