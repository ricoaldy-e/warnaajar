// Color masking berbasis swatch terkonfirmasi (FR-07). Pure functions di atas ImageData.
import { converter, differenceEuclidean, type Oklab } from 'culori';
import type { ColorSwatch } from '@/types';
import { BACKGROUND_BORDER_SHARE } from './constants';

const toOklab = converter('oklab');
const distance = differenceEuclidean('oklab');

interface Ref {
  id: string;
  target: number;
  lab: Oklab;
}

/** Swatch dengan hex tidak valid diabaikan (tidak pernah cocok). */
function swatchRefs(swatches: ColorSwatch[], targetIds: string[]): Ref[] {
  return swatches.flatMap((s) => {
    const lab = toOklab(s.hex);
    return lab ? [{ id: s.id, target: targetIds.indexOf(s.id), lab }] : [];
  });
}

/** Indeks target dari swatch terdekat (di antara SEMUA swatch), atau -1 jika terdekatnya bukan target/di luar toleransi. */
function nearestTarget(rgb: number, refs: Ref[], tolerance: number): number {
  const lab = toOklab({ mode: 'rgb', r: (rgb >> 16) / 255, g: ((rgb >> 8) & 255) / 255, b: (rgb & 255) / 255 });
  let best = -1;
  let bestDistance = Infinity;
  for (const ref of refs) {
    const d = distance(lab, ref.lab);
    if (d < bestDistance) [best, bestDistance] = [ref.target, d];
  }
  return bestDistance <= tolerance ? best : -1;
}

export interface CategoryMask {
  /** Per piksel: indeks pada targetIds, atau -1. */
  mask: Int16Array;
  /** Jumlah piksel mask per target. */
  areas: number[];
  /** Jumlah piksel yang cocok per target sebelum tepi dibuang. */
  pixels: number[];
  /** Estimasi tebal rata-rata area cocok per target (px): 2 × luas / piksel tepi. 0 jika tidak ada. */
  thickness: number[];
  /** Jumlah piksel dengan alpha > 0. */
  opaquePixels: number;
  /** Indeks target yang menempati mayoritas piksel tepi gambar (kemungkinan latar), atau -1. */
  backgroundTarget: number;
}

/**
 * Piksel masuk mask jika swatch terdekatnya adalah target dan jaraknya ≤ tolerance.
 * Piksel alpha 0 diabaikan. Tepi selebar `inset` px dibuang (erosi 4-tetangga berulang) agar
 * teks, angka, garis batas, dan piksel anti-aliasing di sekitarnya tidak terkena pola.
 */
export function buildCategoryMask(
  image: ImageData,
  swatches: ColorSwatch[],
  targetIds: string[],
  tolerance: number,
  inset: number,
): CategoryMask {
  const { data, width, height } = image;
  const refs = swatchRefs(swatches, targetIds);
  const raw = new Int16Array(width * height).fill(-1);
  const pixels = targetIds.map(() => 0);
  let opaquePixels = 0;

  // Gambar warna datar punya sedikit warna unik, jadi jarak dihitung sekali per warna.
  const entryOf = new Map<number, number>();
  const entryTarget: number[] = [];
  let lastRgb = -1;
  let entry = -1;
  for (let i = 0; i < raw.length; i++) {
    const p = i * 4;
    if (data[p + 3] === 0) continue;
    opaquePixels++;
    const rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    if (rgb !== lastRgb) {
      lastRgb = rgb;
      entry = entryOf.get(rgb) ?? -1;
      if (entry === -1) {
        entry = entryTarget.length;
        entryOf.set(rgb, entry);
        entryTarget.push(nearestTarget(rgb, refs, tolerance));
      }
    }
    raw[i] = entryTarget[entry];
    if (raw[i] >= 0) pixels[raw[i]]++;
  }

  // Latar hampir selalu menyentuh tepi gambar; kategori luas di tengah (mis. peta) tidak.
  const borderCounts = targetIds.map(() => 0);
  let borderTotal = 0;
  const countBorder = (i: number) => {
    if (data[i * 4 + 3] === 0) return;
    borderTotal++;
    if (raw[i] >= 0) borderCounts[raw[i]]++;
  };
  for (let x = 0; x < width; x++) {
    countBorder(x);
    if (height > 1) countBorder((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    countBorder(y * width);
    if (width > 1) countBorder(y * width + width - 1);
  }
  const backgroundTarget = borderCounts.findIndex((n) => n > BACKGROUND_BORDER_SHARE * borderTotal);

  let mask = raw;
  const interior = targetIds.map(() => 0); // piksel yang selamat dari erosi pertama
  for (let pass = 0; pass < inset; pass++) {
    const prev = mask;
    mask = new Int16Array(raw.length).fill(-1);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const t = prev[i];
        if (t >= 0 && prev[i - 1] === t && prev[i + 1] === t && prev[i - width] === t && prev[i + width] === t) {
          mask[i] = t;
          if (pass === 0) interior[t]++;
        }
      }
    }
  }
  const areas = targetIds.map(() => 0);
  for (const t of mask) if (t >= 0) areas[t]++;
  // Strip selebar w punya ±2 piksel tepi per w piksel, sehingga rumus ini mendekati w.
  const thickness = pixels.map((n, t) => (n === 0 ? 0 : (2 * n) / (n - interior[t])));
  return { mask, areas, pixels, thickness, opaquePixels, backgroundTarget };
}

/** Pasangan [targetId, swatchId lain] yang rentang toleransinya tumpang tindih (jarak ≤ 2× toleransi). */
export function findOverlappingSwatches(
  swatches: ColorSwatch[],
  targetIds: string[],
  tolerance: number,
): [string, string][] {
  const refs = swatchRefs(swatches, targetIds);
  const pairs: [string, string][] = [];
  refs.forEach((a, i) => {
    for (const b of refs.slice(i + 1)) {
      if ((a.target >= 0 || b.target >= 0) && distance(a.lab, b.lab) <= 2 * tolerance) {
        pairs.push(a.target >= 0 ? [a.id, b.id] : [b.id, a.id]);
      }
    }
  });
  return pairs;
}
