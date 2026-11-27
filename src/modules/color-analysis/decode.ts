// FR-01: decode dan validasi gambar sumber. Hanya browser (createImageBitmap + Canvas).
// Sengaja tanpa import agar test browser dapat men-transpile file ini apa adanya.

export interface DecodeLimits {
  maxBytes: number;
  maxSidePx: number;
}

// Baseline usulan PRD §FR-01, belum final (PRD §15). Override lewat parameter `limits`.
export const DEFAULT_DECODE_LIMITS: DecodeLimits = { maxBytes: 5 * 1024 * 1024, maxSidePx: 4096 };

export type ImageDecodeErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'FILE_TOO_LARGE'
  | 'DIMENSIONS_TOO_LARGE'
  | 'DECODE_FAILED';

export class ImageDecodeError extends Error {
  readonly code: ImageDecodeErrorCode;

  constructor(code: ImageDecodeErrorCode, message: string) {
    super(message);
    this.name = 'ImageDecodeError';
    this.code = code;
  }
}

const SUPPORTED_TYPES = ['image/png', 'image/jpeg'];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Size {
  width: number;
  height: number;
}

function corrupt(): ImageDecodeError {
  return new ImageDecodeError('DECODE_FAILED', 'File rusak atau bukan gambar PNG/JPEG yang valid.');
}

function readPngSize(bytes: Uint8Array): Size | null {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  // Chunk pertama wajib IHDR: panjang (4) + "IHDR" (4) + lebar (4) + tinggi (4).
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegSize(bytes: Uint8Array): Size | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++; // byte pengisi
      continue;
    }
    offset += 2;
    // Marker tanpa panjang: TEM dan RST0–RST7. SOI/EOI di sini berarti struktur rusak.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(offset);
    if (length < 2) return null;
    // SOF0–SOF15, kecuali DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 7 > bytes.length) return null;
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function checkSize({ width, height }: Size, limits: DecodeLimits): void {
  if (width < 1 || height < 1) throw corrupt();
  if (Math.max(width, height) > limits.maxSidePx) {
    throw new ImageDecodeError(
      'DIMENSIONS_TOO_LARGE',
      `Dimensi gambar ${width}×${height} px melebihi batas ${limits.maxSidePx} px pada sisi terpanjang.`,
    );
  }
}

function toImageData(bitmap: ImageBitmap): ImageData {
  const { width, height } = bitmap;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) throw new ImageDecodeError('DECODE_FAILED', 'Browser tidak dapat membuat Canvas untuk membaca gambar.');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Validasi lalu decode PNG/JPEG menjadi ImageData RGBA berdimensi asli. Blob sumber tidak diubah.
 * Hanya untuk browser: panggil dari event handler atau efek, bukan saat render/SSR.
 * Melempar `ImageDecodeError` dengan pesan berbahasa Indonesia yang aman ditampilkan.
 */
export async function decodeImage(file: Blob, limits: DecodeLimits = DEFAULT_DECODE_LIMITS): Promise<ImageData> {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    throw new ImageDecodeError('UNSUPPORTED_TYPE', 'Format tidak didukung. Gunakan gambar PNG atau JPEG.');
  }
  if (file.size === 0) throw corrupt();
  if (file.size > limits.maxBytes) {
    const mb = Math.round((limits.maxBytes / (1024 * 1024)) * 10) / 10;
    throw new ImageDecodeError('FILE_TOO_LARGE', `Ukuran file melebihi batas ${mb} MB.`);
  }

  // Salinan byte untuk membaca header; blob sendiri immutable.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const headerSize = readPngSize(bytes) ?? readJpegSize(bytes);
  if (!headerSize) throw corrupt();
  // Dicek sebelum decode agar gambar raksasa tidak dialokasikan ke memori.
  checkSize(headerSize, limits);

  if (typeof createImageBitmap !== 'function') {
    throw new ImageDecodeError('DECODE_FAILED', 'Decode gambar hanya dapat dijalankan di browser.');
  }
  let bitmap: ImageBitmap;
  try {
    // Nilai RGBA apa adanya dari file: tanpa premultiply dan tanpa konversi profil warna.
    bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    throw corrupt();
  }
  try {
    // Orientasi EXIF dapat menukar lebar/tinggi; batas sisi terpanjang tetap berlaku.
    checkSize({ width: bitmap.width, height: bitmap.height }, limits);
    return toImageData(bitmap);
  } finally {
    bitmap.close();
  }
}
