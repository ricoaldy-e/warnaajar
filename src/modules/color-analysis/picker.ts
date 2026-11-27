// FR-04: helper color picker manual. Interaksi klik dan pembaruan daftar swatch adalah tanggung jawab UI (Modul 4).
// Picker hanya membaca satu piksel gambar ASLI; tidak membuat mask objek.
import { MIN_OPAQUE_ALPHA } from './extract';

/**
 * Konversi titik klik (CSS px, relatif ke pojok kiri atas elemen tampilan) ke indeks piksel sumber.
 * Mengasumsikan gambar ditampilkan utuh dan diskalakan ke kotak `displayWidth × displayHeight`
 * (tanpa crop/letterbox, mis. tanpa `object-fit: cover/contain` yang menyisakan ruang kosong).
 * Hasil dibulatkan ke bawah; titik di luar gambar ditolak dengan `RangeError`.
 */
export function cssToSourcePixel(
  cssX: number,
  cssY: number,
  displayWidth: number,
  displayHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number } {
  if (![cssX, cssY, displayWidth, displayHeight].every(Number.isFinite) || displayWidth <= 0 || displayHeight <= 0) {
    throw new RangeError('Koordinat dan ukuran tampilan harus bilangan finite; ukuran tampilan harus > 0.');
  }
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) {
    throw new RangeError('Ukuran gambar sumber harus bilangan bulat ≥ 1.');
  }
  const x = Math.floor((cssX * sourceWidth) / displayWidth);
  const y = Math.floor((cssY * sourceHeight) / displayHeight);
  if (x < 0 || y < 0 || x >= sourceWidth || y >= sourceHeight) {
    throw new RangeError(`Titik (${cssX}, ${cssY}) berada di luar gambar.`);
  }
  return { x, y };
}

/**
 * Warna `#RRGGBB` (uppercase) dari piksel sumber pada koordinat bilangan bulat (`x`, `y`) gambar asli.
 * Piksel dengan alpha < MIN_OPAQUE_ALPHA dianggap transparan (definisi yang sama dengan extractColors) dan ditolak.
 * Melempar `RangeError` untuk ImageData tidak valid atau non-sRGB, koordinat bukan bilangan bulat,
 * di luar batas, atau piksel transparan. Sumber tidak diubah.
 * Ambil dari gambar asli, bukan dari preview simulasi; konversi klik tampilan lewat cssToSourcePixel.
 */
export function pickColor(source: ImageData, x: number, y: number): string {
  const { data, width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('ImageData tidak valid: lebar dan tinggi harus bilangan bulat ≥ 1.');
  }
  if (data.length !== width * height * 4) {
    throw new RangeError('ImageData tidak valid: ukuran data tidak sesuai dimensi.');
  }
  const colorSpace = source.colorSpace ?? 'srgb';
  if (colorSpace !== 'srgb') {
    throw new RangeError(`Ruang warna "${colorSpace}" belum didukung; picker hanya untuk ImageData sRGB.`);
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new RangeError(`Koordinat piksel harus bilangan bulat: (${x}, ${y}).`);
  }
  if (x < 0 || y < 0 || x >= width || y >= height) {
    throw new RangeError(`Koordinat (${x}, ${y}) di luar gambar ${width}×${height}.`);
  }
  const p = (y * width + x) * 4;
  if (data[p + 3] < MIN_OPAQUE_ALPHA) {
    throw new RangeError(`Piksel (${x}, ${y}) transparan (alpha ${data[p + 3]}); pilih piksel lain.`);
  }
  const rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}
