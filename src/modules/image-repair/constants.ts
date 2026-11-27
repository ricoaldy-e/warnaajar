// shortcut: nilai awal POC, belum disepakati tim (PRD.md §15). Kunci setelah renderer diuji pada fixture.
import type { PatternKind } from '@/types';

/** Urutan ini juga urutan pemakaian pola pada data categorical. */
export const PATTERN_KINDS: readonly PatternKind[] = ['diagonal', 'dots', 'horizontal', 'crosshatch'];

/** Batas spacingPx yang diterima editor (inklusif). */
export const MIN_SPACING_PX = 4;
export const MAX_SPACING_PX = 32;

export const CATEGORICAL_SPACING_PX = 10;

/** Satu keluarga arsir untuk data ordinal. */
export const ORDINAL_PATTERN_KIND: PatternKind = 'diagonal';
/** Tingkat terendah memakai jarak paling renggang, tingkat tertinggi paling rapat. */
export const ORDINAL_SPARSEST_SPACING_PX = 24;
export const ORDINAL_DENSEST_SPACING_PX = 6;
/** Selisih jarak antartingkat di bawah nilai ini diberi peringatan sulit dibedakan. */
export const MIN_ORDINAL_STEP_PX = 3;

/**
 * Toleransi masking: jarak Euclidean OKLab (culori differenceEuclidean('oklab'), L 0–1).
 * Bukan ambang ΔE konflik Modul 1. Swatch yang berjarak ≤ 2× nilai ini dianggap tumpang tindih.
 */
export const DEFAULT_MASK_TOLERANCE = 0.05;
/**
 * Jarak (px absolut, TIDAK dikali scale) dari warna lain yang dibiarkan tanpa pola: menjaga teks,
 * angka, dan garis batas tetap terbaca serta tepi anti-aliasing tidak ikut berpola.
 * Konsekuensi: garis berwarna setebal < ~6 px tidak mendapat pola.
 */
export const MASK_EDGE_INSET_PX = 2;
/** Pola dianggap tidak merata jika area setelah tepi dibuang < porsi ini dari piksel yang cocok. */
export const MIN_USABLE_MASK_SHARE = 0.35;
/**
 * Pola diperingatkan terputus-putus jika tebal rata-rata area < porsi ini dari jarak pola efektif.
 * Bukan 1: area yang masih terbaca pada uji gambar nyata punya rasio serendah 0,7.
 */
export const MIN_THICKNESS_SPACING_RATIO = 0.5;
/** Pola dianggap tidak merata jika piksel yang cocok < porsi ini dari piksel opak gambar. */
export const MIN_COLOR_PIXEL_SHARE = 0.002;
/** Target yang menempati lebih dari porsi ini dari piksel tepi gambar (opak) dianggap kemungkinan latar. */
export const BACKGROUND_BORDER_SHARE = 0.5;
/** Area mask minimum per warna (px, setelah tepi dibuang) pada skala 1; dikali scale². */
export const MIN_MASK_AREA_PX = 100;

/**
 * Pola tidak diskalakan sampai sisi terpanjang ini; di atasnya scale = √(sisi / 1000).
 * Akar kuadrat (bukan linear) agar pola di gambar 3–4K tidak lebih besar dari kotak legenda.
 */
export const PATTERN_SCALE_REFERENCE_PX = 1000;
export const MAX_PATTERN_SCALE = 2.5;
/** Ketebalan garis dan jari-jari titik pada skala 1 (jari-jari dibatasi ≤ jarak/3 agar fill tetap terlihat). */
export const PATTERN_LINE_WIDTH_PX = 2;
export const PATTERN_DOT_RADIUS_PX = 2;

/** Tinta pola dipilih yang kontrasnya (WCAG) lebih tinggi terhadap warna swatch. */
export const PATTERN_INK_DARK = '#000000';
export const PATTERN_INK_LIGHT = '#FFFFFF';
