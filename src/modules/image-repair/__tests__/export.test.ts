// Canvas di sini mock: jsdom tidak merender piksel maupun meng-encode PNG.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportFilename, exportImageDataToPng } from '../export';
import * as api from '../index';
import { solidImage } from './fixtures';

describe('buildExportFilename', () => {
  it.each([
    ['peta-penduduk.jpg', 'peta-penduduk-warnaajar.png'],
    ['Peta.JPEG', 'Peta-warnaajar.png'],
    ['  data   siswa (final)!.png ', 'data-siswa-final-warnaajar.png'],
    ['C:\\Users\\a\\grafik.png', 'grafik-warnaajar.png'],
    ['../../a<b>:c|d?*.png', 'a-b-c-d-warnaajar.png'],
    ['grafik-1.2', 'grafik-1-2-warnaajar.png'],
    ['diagram_suhu été.png', 'diagram_suhu-été-warnaajar.png'],
    ['peta-warnaajar.png', 'peta-warnaajar.png'],
    ['peta_WarnaAjar-warnaajar.png', 'peta-warnaajar.png'],
    ['petawarnaajar.png', 'petawarnaajar-warnaajar.png'],
    ['warnaajar.png', 'hasil-warnaajar.png'],
    ['', 'hasil-warnaajar.png'],
    ['   ', 'hasil-warnaajar.png'],
    ['.png', 'hasil-warnaajar.png'],
    ['???.jpg', 'hasil-warnaajar.png'],
    [undefined, 'hasil-warnaajar.png'],
  ])('%j → %s', (input, expected) => {
    expect(buildExportFilename(input)).toBe(expected);
  });

  it('membatasi panjang nama', () => {
    expect(buildExportFilename(`${'a'.repeat(500)}.png`)).toBe(`${'a'.repeat(100)}-warnaajar.png`);
  });
});

describe('exportImageDataToPng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockCanvas({ context = true, blob = new Blob(['x'], { type: 'image/png' }) as Blob | null } = {}) {
    const putImageData = vi.fn();
    const seen = { width: 0, height: 0 };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((() => (context ? { putImageData } : null)) as unknown as HTMLCanvasElement['getContext']);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, callback) {
        Object.assign(seen, { width: this.width, height: this.height });
        callback(blob);
      });
    return { putImageData, getContext, toBlob, seen, blob };
  }

  it('menulis ImageData pada dimensi asli dan menghasilkan blob PNG tanpa memutasi sumber', async () => {
    const image = solidImage(7, 3, '#FFD54F');
    const before = new Uint8ClampedArray(image.data);
    const mock = mockCanvas();

    const result = await exportImageDataToPng(image, 'peta.jpg');

    expect(result).toEqual({ blob: mock.blob, filename: 'peta-warnaajar.png' });
    expect(mock.seen).toEqual({ width: 7, height: 3 });
    expect(mock.getContext).toHaveBeenCalledWith('2d', { colorSpace: 'srgb' });
    expect(mock.putImageData).toHaveBeenCalledWith(image, 0, 0);
    expect(mock.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(image.data).toEqual(before);
  });

  it.each([
    [0, 3],
    [3, 0],
  ])('menolak dimensi %ix%i', async (width, height) => {
    mockCanvas();
    const image = { width, height, data: new Uint8ClampedArray(), colorSpace: 'srgb' } as ImageData;
    await expect(exportImageDataToPng(image)).rejects.toThrow('Dimensi gambar tidak valid');
  });

  it('melempar jika context 2D null', async () => {
    mockCanvas({ context: false });
    await expect(exportImageDataToPng(solidImage(2, 2, '#000000'))).rejects.toThrow('canvas 2D');
  });

  it('melempar jika toBlob menghasilkan null', async () => {
    mockCanvas({ blob: null });
    await expect(exportImageDataToPng(solidImage(2, 2, '#000000'))).rejects.toThrow('Gagal membuat file PNG');
  });

  it('melempar jika bukan di browser', async () => {
    const image = solidImage(2, 2, '#000000');
    vi.stubGlobal('document', undefined);
    await expect(exportImageDataToPng(image)).rejects.toThrow('hanya dapat dijalankan di browser');
  });
});

it('barrel hanya mengekspor public API', () => {
  expect(Object.keys(api).sort()).toEqual([
    'CATEGORICAL_SPACING_PX',
    'DEFAULT_MASK_TOLERANCE',
    'MAX_SPACING_PX',
    'MIN_SPACING_PX',
    'ORDINAL_PATTERN_KIND',
    'PATTERN_KINDS',
    'buildExportFilename',
    'exportImageDataToPng',
    'recommendPatterns',
    'repairImage',
    'resetPatterns',
    'validatePatternConfigs',
  ]);
});
