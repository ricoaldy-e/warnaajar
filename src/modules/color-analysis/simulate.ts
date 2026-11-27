// FR-02: simulasi CVD. Murni pada ImageData; tanpa import runtime agar test browser dapat men-transpile file ini.
// Simulasi adalah aproksimasi tingkat maksimum (severity 1,0), bukan persepsi aktual setiap individu.
import type { CvdMode } from '@/types';

export const CVD_MODES: readonly CvdMode[] = ['normal', 'protan', 'deutan', 'tritan', 'grayscale'];

/**
 * Matriks Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of Color
 * Vision Deficiency", IEEE TVCG 15(6), doi:10.1109/TVCG.2009.113, severity 1,0, dari tabel penulis
 * (https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html).
 * Nilainya identik dengan tabel yang dipakai Culori dan paket R colorspace. Urutan row-major: [r', g', b'] = M · [r, g, b].
 * Diterapkan pada RGB LINEAR: makalah mengasumsikan ruang linear (colorspace ≥ 2.1-0, `linear = TRUE`).
 */
export const MACHADO_MATRICES = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
} as const satisfies Record<'protan' | 'deutan' | 'tritan', readonly number[]>;

/** Koefisien luminans relatif sRGB/Rec. 709 pada RGB linear (grayscale = Y yang sama di tiga kanal). */
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

/**
 * Kapasitas cache warna per pemanggilan simulateCvd. 65.536 entri (±5 MB) memuat seluruh warna unik
 * diagram datar maupun JPEG-nya; foto dengan jutaan warna tetap benar, hanya tidak semua warna di-cache.
 * Kebijakan saat penuh: FIFO (entri tertua dihapus). Urutan kunci disimpan di ring buffer tetap, karena
 * `Map.keys().next()` setelah banyak penghapusan melewati slot terhapus dan menjadi O(n) per penggusuran.
 * Cache hanya menyimpan hasil fungsi murni, jadi tidak memengaruhi nilai keluaran.
 */
export const SIMULATION_CACHE_CAPACITY = 65_536;

type TransformMode = Exclude<CvdMode, 'normal'>;

// IEC 61966-2-1: sRGB 8-bit → linear.
const TO_LINEAR = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

// Linear → sRGB 8-bit, dengan clamp ke [0, 1].
function toSrgb8(linear: number): number {
  const l = Math.min(1, Math.max(0, linear));
  const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

/** Inti transformasi tunggal untuk piksel dan hex. Masukan/keluaran: 0xRRGGBB. */
function transformRgb(rgb: number, mode: TransformMode): number {
  const r = TO_LINEAR[(rgb >> 16) & 255];
  const g = TO_LINEAR[(rgb >> 8) & 255];
  const b = TO_LINEAR[rgb & 255];
  if (mode === 'grayscale') {
    const y = toSrgb8(LUMINANCE[0] * r + LUMINANCE[1] * g + LUMINANCE[2] * b);
    return (y << 16) | (y << 8) | y;
  }
  const m = MACHADO_MATRICES[mode];
  return (
    (toSrgb8(m[0] * r + m[1] * g + m[2] * b) << 16) |
    (toSrgb8(m[3] * r + m[4] * g + m[5] * b) << 8) |
    toSrgb8(m[6] * r + m[7] * g + m[8] * b)
  );
}

function assertMode(mode: CvdMode): void {
  if (!CVD_MODES.includes(mode)) {
    throw new RangeError(`Mode simulasi tidak dikenal: "${String(mode)}". Gunakan ${CVD_MODES.join(', ')}.`);
  }
}

/** Simulasi satu warna `#RRGGBB` (huruf besar/kecil diterima); hasil `#RRGGBB` uppercase. */
export function simulateHex(hex: string, mode: CvdMode): string {
  assertMode(mode);
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new RangeError(`Hex tidak valid: "${String(hex)}". Gunakan format #RRGGBB.`);
  }
  const rgb = parseInt(hex.slice(1), 16);
  const out = mode === 'normal' ? rgb : transformRgb(rgb, mode);
  return `#${out.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Salinan `ImageData` baru dengan simulasi `mode`, termasuk `normal` (isi identik, buffer baru).
 * Dimensi dan alpha dipertahankan persis; RGB piksel transparan tetap ditransformasi (tidak premultiplied).
 * Hanya sRGB. Sumber tidak diubah. Jangan menyimulasikan gambar yang sudah disimulasikan.
 */
export function simulateCvd(source: ImageData, mode: CvdMode): ImageData {
  assertMode(mode);
  const { data, width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('ImageData tidak valid: lebar dan tinggi harus bilangan bulat ≥ 1.');
  }
  if (data.length !== width * height * 4) {
    throw new RangeError('ImageData tidak valid: ukuran data tidak sesuai dimensi.');
  }
  const colorSpace = source.colorSpace ?? 'srgb';
  if (colorSpace !== 'srgb') {
    throw new RangeError(`Ruang warna "${colorSpace}" belum didukung; simulasi hanya untuk ImageData sRGB.`);
  }

  const out = new Uint8ClampedArray(data);
  if (mode !== 'normal') {
    const cache = new Map<number, number>();
    const order = new Int32Array(SIMULATION_CACHE_CAPACITY); // kunci 0xRRGGBB menurut urutan masuk
    let oldest = 0;
    let lastIn = -1;
    let lastOut = 0;
    for (let p = 0; p < out.length; p += 4) {
      const rgb = (out[p] << 16) | (out[p + 1] << 8) | out[p + 2];
      if (rgb !== lastIn) {
        let result = cache.get(rgb);
        if (result === undefined) {
          result = transformRgb(rgb, mode);
          if (cache.size === SIMULATION_CACHE_CAPACITY) {
            cache.delete(order[oldest]);
            order[oldest] = rgb;
            oldest = (oldest + 1) % SIMULATION_CACHE_CAPACITY;
          } else {
            order[cache.size] = rgb;
          }
          cache.set(rgb, result);
        }
        lastIn = rgb;
        lastOut = result;
      }
      out[p] = lastOut >> 16;
      out[p + 1] = (lastOut >> 8) & 255;
      out[p + 2] = lastOut & 255;
      // out[p + 3] (alpha) sudah tersalin dari sumber dan tidak disentuh.
    }
  }
  return new ImageData(out, width, height, { colorSpace: 'srgb' });
}
