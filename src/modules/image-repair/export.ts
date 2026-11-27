// Export PNG mode normal (FR-12). Hanya client; unduhan/object URL diurus UI.
const SUFFIX = 'warnaajar';
const MAX_BASE_LENGTH = 100;

export function buildExportFilename(sourceFilename = ''): string {
  const base = sourceFilename
    .trim()
    .replace(/^.*[\\/]/, '')
    // Ekstensi harus diawali huruf agar "grafik-1.2" tidak terpotong.
    .replace(/\.[a-z][a-z0-9]{1,4}$/i, '')
    .replace(/[^\p{L}\p{M}\p{N}_]+/gu, '-')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/(?:(?:^|[-_]+)warnaajar)+$/i, '');
  return `${base || 'hasil'}-${SUFFIX}.png`;
}

/** Gambar ditulis apa adanya pada dimensi aslinya: tanpa watermark, UI, atau simulasi. */
export async function exportImageDataToPng(
  image: ImageData,
  sourceFilename?: string,
): Promise<{ blob: Blob; filename: string }> {
  if (typeof document === 'undefined') {
    throw new Error('Export PNG hanya dapat dijalankan di browser.');
  }
  const { width, height } = image;
  if (!(width > 0 && height > 0)) {
    throw new Error(`Dimensi gambar tidak valid (${width}×${height}).`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { colorSpace: image.colorSpace });
  if (!context) {
    throw new Error('Browser tidak dapat menyiapkan canvas 2D untuk export PNG.');
  }
  context.putImageData(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Gagal membuat file PNG. Gambar mungkin terlalu besar untuk browser ini.');
  }
  return { blob, filename: buildExportFilename(sourceFilename) };
}
