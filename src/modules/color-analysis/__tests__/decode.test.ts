// @vitest-environment node
// Jalur validasi yang menolak input sebelum tahap decode browser. Tanpa mock.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DECODE_LIMITS, ImageDecodeError, decodeImage } from '..';
import { encodePng, jpegHeader, sampleRgba } from './image-fixtures';

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImageDecodeError);
  expect(error).toMatchObject({ code });
}

describe('decodeImage — validasi', () => {
  it('menolak MIME yang tidak didukung', async () => {
    await expectCode(decodeImage(new Blob(['halo'], { type: 'text/plain' })), 'UNSUPPORTED_TYPE');
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]);
    await expectCode(decodeImage(new Blob([gif], { type: 'image/gif' })), 'UNSUPPORTED_TYPE');
    await expectCode(decodeImage(new Blob([gif])), 'UNSUPPORTED_TYPE');
  });

  it('menolak file rusak atau kosong', async () => {
    await expectCode(decodeImage(new Blob([], { type: 'image/png' })), 'DECODE_FAILED');
    const random = new Uint8Array(256).map((_, i) => (i * 37 + 11) & 255);
    await expectCode(decodeImage(new Blob([random], { type: 'image/png' })), 'DECODE_FAILED');
    await expectCode(decodeImage(new Blob([random], { type: 'image/jpeg' })), 'DECODE_FAILED');
    // Signature PNG tanpa IHDR.
    const pngSignatureOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expectCode(decodeImage(new Blob([pngSignatureOnly], { type: 'image/png' })), 'DECODE_FAILED');
    // JPEG tanpa segmen SOF.
    const jpegNoSof = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    await expectCode(decodeImage(new Blob([jpegNoSof], { type: 'image/jpeg' })), 'DECODE_FAILED');
  });

  it('menolak file yang melebihi batas ukuran', async () => {
    const big = new Blob([new Uint8Array(DEFAULT_DECODE_LIMITS.maxBytes + 1)], { type: 'image/png' });
    await expectCode(decodeImage(big), 'FILE_TOO_LARGE');
    const { width, height, rgba } = sampleRgba();
    const png = new Blob([encodePng(width, height, rgba)], { type: 'image/png' });
    await expectCode(decodeImage(png, { maxBytes: 10, maxSidePx: 4096 }), 'FILE_TOO_LARGE');
  });

  it('menolak dimensi yang melebihi batas berdasarkan header', async () => {
    const wide = encodePng(5000, 1, new Uint8Array(5000 * 4));
    await expectCode(decodeImage(new Blob([wide], { type: 'image/png' })), 'DIMENSIONS_TOO_LARGE');
    const tall = jpegHeader(10, 5000);
    await expectCode(decodeImage(new Blob([tall], { type: 'image/jpeg' })), 'DIMENSIONS_TOO_LARGE');
    const { width, height, rgba } = sampleRgba();
    const small = new Blob([encodePng(width, height, rgba)], { type: 'image/png' });
    await expectCode(decodeImage(small, { maxBytes: 1024, maxSidePx: 3 }), 'DIMENSIONS_TOO_LARGE');
  });

  it('tidak mengubah byte blob sumber', async () => {
    const bytes = encodePng(5000, 1, new Uint8Array(5000 * 4));
    const blob = new Blob([bytes], { type: 'image/png' });
    const before = new Uint8Array(await blob.arrayBuffer());
    await decodeImage(blob).catch(() => undefined);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(before);
    expect(blob.size).toBe(bytes.length);
    expect(blob.type).toBe('image/png');
  });
});
