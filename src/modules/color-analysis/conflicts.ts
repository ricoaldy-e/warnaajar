// FR-03: deteksi potensi konflik warna dengan ΔE00 (CIEDE2000) pada warna hasil simulasi CVD.
// Hasilnya potensi hambatan berbasis piksel, bukan diagnosis atau ukuran keterbacaan manusia.
import { converter, differenceCiede2000, type Lab65 } from 'culori';
import type { ColorAnalysisResult, ColorConflict, ColorSwatch, SimulatedMode } from '@/types';
import { simulateHex } from './simulate';

/**
 * Mode yang dianalisis, berurutan sesuai urutan hasil. `grayscale` sengaja tidak disertakan:
 * apakah grayscale menghasilkan konflik belum disepakati (CONTRACTS.md §4.1, §9).
 */
export const CONFLICT_MODES: readonly SimulatedMode[] = ['protan', 'deutan', 'tritan'];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
// CIELAB D65: white point asli sRGB, tanpa adaptasi kromatik. Sama dengan ruang internal differenceCiede2000 Culori.
const toLab65 = converter('lab65');
const deltaE00 = differenceCiede2000();

function validateColors(colors: unknown): asserts colors is ColorSwatch[] {
  if (!Array.isArray(colors)) throw new RangeError('colors harus berupa array ColorSwatch.');
  const seen = new Set<string>();
  colors.forEach((color: unknown, index) => {
    if (typeof color !== 'object' || color === null) {
      throw new RangeError(`colors[${index}] bukan ColorSwatch.`);
    }
    const { id, hex } = color as Partial<Record<keyof ColorSwatch, unknown>>;
    if (typeof id !== 'string' || id.trim() === '') throw new RangeError(`colors[${index}].id tidak boleh kosong.`);
    if (seen.has(id)) throw new RangeError(`ID warna duplikat: "${id}".`);
    seen.add(id);
    if (typeof hex !== 'string' || !HEX_PATTERN.test(hex)) {
      throw new RangeError(`colors[${index}].hex tidak valid: "${String(hex)}". Gunakan format #RRGGBB.`);
    }
  });
}

/**
 * Potensi konflik: pasangan swatch unik (i < j) yang ΔE00-nya, setelah keduanya disimulasikan pada mode
 * yang sama, lebih kecil dari `threshold` (`deltaE < threshold`, usulan CONTRACTS.md §3).
 * Urutan hasil: CONFLICT_MODES, lalu indeks swatch A, lalu indeks swatch B. `colorAId` selalu swatch yang lebih awal.
 * Mode normal tidak menghasilkan konflik. `threshold` tidak memiliki default: nilainya keputusan tim (PRD §15).
 * Melempar `RangeError` untuk colors atau threshold yang tidak valid. Input tidak diubah.
 */
export function analyzeColors(colors: ColorSwatch[], threshold: number): ColorAnalysisResult {
  validateColors(colors);
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('threshold harus bilangan finite > 0.');
  }

  const conflicts: ColorConflict[] = [];
  for (const mode of CONFLICT_MODES) {
    // Satu simulasi dan satu konversi Lab per warna per mode, dari hex sumber (bukan hasil simulasi lain).
    const labs = colors.map((color): Lab65 => {
      const lab = toLab65(simulateHex(color.hex, mode));
      if (!lab) throw new RangeError(`Warna "${color.hex}" tidak dapat dikonversi ke CIELAB.`);
      return lab;
    });
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const deltaE = deltaE00(labs[i], labs[j]);
        if (deltaE < threshold) conflicts.push({ colorAId: colors[i].id, colorBId: colors[j].id, mode, deltaE });
      }
    }
  }

  return { colors: colors.map(({ id, hex }) => ({ id, hex })), conflicts, threshold };
}
