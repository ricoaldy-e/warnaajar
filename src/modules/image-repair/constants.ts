// Nilai awal, belum disepakati tim (PRD.md §15).
import type { PatternKind } from '@/types';

// Urutan ini juga urutan pemakaian pada data categorical.
export const PATTERN_KINDS: readonly PatternKind[] = ['diagonal', 'dots', 'horizontal', 'crosshatch'];

// Batas MVP v1.1 untuk categorical maupun ordinal.
export const MAX_INCLUDED_CATEGORIES = 4;

export const MIN_SPACING_PX = 4;
export const MAX_SPACING_PX = 32;

export const CATEGORICAL_SPACING_PX = 10;

export const ORDINAL_PATTERN_KIND: PatternKind = 'diagonal';
export const ORDINAL_SPARSEST_SPACING_PX = 24;
export const ORDINAL_DENSEST_SPACING_PX = 6;
export const MIN_ORDINAL_STEP_PX = 3;

// Jarak Euclidean OKLab, bukan ambang ΔE konflik Modul 1.
export const DEFAULT_MASK_TOLERANCE = 0.05;
// Sengaja tidak dikali scale: di gambar besar, kotak legenda akan kosong.
export const MASK_EDGE_INSET_PX = 2;
export const MIN_USABLE_MASK_SHARE = 0.35;
// Sengaja < 1: pada gambar nyata, area dengan rasio 0,7 masih terbaca.
export const MIN_THICKNESS_SPACING_RATIO = 0.5;
export const MIN_COLOR_PIXEL_SHARE = 0.002;
export const BACKGROUND_BORDER_SHARE = 0.5;
// Pada skala 1; dikali scale².
export const MIN_MASK_AREA_PX = 100;

// scale = √(sisi terpanjang / referensi); akar kuadrat agar pola tidak melebihi kotak legenda.
export const PATTERN_SCALE_REFERENCE_PX = 1000;
export const MAX_PATTERN_SCALE = 2.5;
export const PATTERN_LINE_WIDTH_PX = 2;
export const PATTERN_DOT_RADIUS_PX = 2;

export const PATTERN_INK_DARK = '#000000';
export const PATTERN_INK_LIGHT = '#FFFFFF';
