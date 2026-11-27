// Fixture byte gambar untuk test, bukan data produksi. Dibangun di Node agar ground truth tidak bergantung pada encoder browser.
import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG RGBA 8-bit valid (filter 0 per baris). `rgba` berukuran width × height × 4. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array<ArrayBuffer> {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(
    Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]),
  );
}

/** Struktur JPEG minimal (SOI, APP0, SOF0, EOI): header valid, data gambar tidak ada. */
export function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03];
  const components = [0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, ...components, 0xff, 0xd9]);
}

/** 4×3: piksel opak beragam, satu transparan penuh, satu semi-transparan. */
export function sampleRgba(): { width: number; height: number; rgba: Uint8Array<ArrayBuffer> } {
  const width = 4;
  const height = 3;
  const rgba = new Uint8Array(width * height * 4);
  const colors = [
    [0x45, 0x93, 0x4f, 255], [0xcd, 0x49, 0x49, 255], [0xe4, 0xc3, 0x4d, 255], [0, 0, 0, 255],
    [255, 255, 255, 255], [0x1a, 0x23, 0x7e, 255], [10, 20, 30, 255], [200, 100, 50, 255],
    [0, 0, 0, 0], [120, 60, 200, 128], [1, 2, 3, 255], [254, 253, 252, 255],
  ];
  colors.forEach((c, i) => rgba.set(c, i * 4));
  return { width, height, rgba };
}
