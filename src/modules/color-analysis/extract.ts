// FR-02: ekstraksi warna dominan dengan Median Cut. Murni pada ImageData (tanpa DOM).
import { differenceEuclidean } from 'culori';
import type { ColorSwatch } from '@/types';

// Nilai awal, belum disepakati tim (PRD §15).
export const DEFAULT_MAX_COLORS = 12;
/** Piksel dengan alpha di bawah ini diabaikan (transparan / tepi anti-aliasing tipis). */
export const MIN_OPAQUE_ALPHA = 128;
/** Swatch dengan pangsa piksel opak di bawah ini dibuang (serpihan anti-aliasing, noise JPEG). */
export const MIN_SWATCH_PIXEL_SHARE = 0.002;
/** Jarak OKLab: warna sedekat ini digabung. Sama dengan toleransi masking Modul 3 (tidak dapat dipisahkan di sana). */
export const MERGE_OKLAB_DISTANCE = 0.05;
/** Selisih maksimum per kanal sRGB (0–255) yang juga digabung: toleransi noise/kompresi. OKLab dan ΔE00
 * sangat curam dekat hitam (#000000 vs #000800: OKLab 0,12; ΔE00 4,8), sehingga tanpa aturan ini noise pada
 * teks hitam menjadi beberapa swatch dan konflik palsu di FR-03. Juga batas kekompakan kotak Median Cut. */
export const MERGE_RGB_CHANNEL_DELTA = 12;

// Histogram 5 bit per kanal (32.768 sel): memori tetap, dan noise JPEG terkumpul dalam sedikit sel.
// Sel selebar 8 < MERGE_RGB_CHANNEL_DELTA, jadi kuantisasi tidak menyatukan warna yang tidak akan digabung.
const CELL_SHIFT = 3;
const CELL_COUNT = 1 << 15;
/** Batas keras jumlah kotak; hanya tercapai pada gambar sangat berwarna (foto), bukan diagram datar. */
const MAX_BOXES = 256;

export interface ExtractOptions {
  maxColors?: number;
}

interface Box {
  cells: number[];
  count: number;
  axis: number; // 0 = R, 1 = G, 2 = B
  range: number; // rentang nilai asli (0–255) pada sumbu terpanjang
}

interface Histogram {
  count: Uint32Array;
  // Nilai asli minimum/maksimum per sel dan kanal, agar rentang kotak tepat walau histogram dikuantisasi.
  min: Uint8Array;
  max: Uint8Array;
}

const cellOf = (r: number, g: number, b: number) =>
  ((r >> CELL_SHIFT) << 10) | ((g >> CELL_SHIFT) << 5) | (b >> CELL_SHIFT);
const cellAxis = (cell: number, axis: number) => (cell >> (10 - 5 * axis)) & 31;
const channel = (rgb: number, axis: number) => (rgb >> (16 - 8 * axis)) & 255;

function makeBox(cells: number[], hist: Histogram): Box {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  let count = 0;
  for (const cell of cells) {
    count += hist.count[cell];
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], hist.min[cell * 3 + a]);
      max[a] = Math.max(max[a], hist.max[cell * 3 + a]);
    }
  }
  let axis = 0;
  for (let a = 1; a < 3; a++) if (max[a] - min[a] > max[axis] - min[axis]) axis = a;
  return { cells, count, axis, range: max[axis] - min[axis] };
}

// Potong pada median berbobot jumlah piksel di sumbu terpanjang; kedua sisi selalu tidak kosong.
function splitBox(box: Box, hist: Histogram): [Box, Box] {
  const sorted = [...box.cells].sort((x, y) => cellAxis(x, box.axis) - cellAxis(y, box.axis) || x - y);
  let cumulative = 0;
  let cut = 0;
  for (; cut < sorted.length - 1; cut++) {
    cumulative += hist.count[sorted[cut]];
    if (cumulative >= box.count / 2) break;
  }
  cut = Math.min(cut, sorted.length - 2);
  return [makeBox(sorted.slice(0, cut + 1), hist), makeBox(sorted.slice(cut + 1), hist)];
}

// Kotak kompak (semua piksel saling berselisih ≤ MERGE_RGB_CHANNEL_DELTA per kanal) tidak dibelah:
// potongannya pasti digabung lagi. Anggaran kotak tidak bergantung pada maxColors, sehingga
// noise di sekitar warna besar tidak menghabiskan kesempatan kategori kecil untuk dipisahkan.
function medianCut(cells: number[], hist: Histogram): Box[] {
  const boxes = [makeBox(cells, hist)];
  while (boxes.length < MAX_BOXES) {
    // Prioritas: kotak yang lebar dan banyak pikselnya. Seri: indeks terkecil (deterministik).
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.cells.length < 2 || b.range <= MERGE_RGB_CHANNEL_DELTA) continue;
      if (best < 0 || b.range * b.count > boxes[best].range * boxes[best].count) best = i;
    }
    if (best < 0) break;
    boxes.splice(best, 1, ...splitBox(boxes[best], hist));
  }
  return boxes;
}

const oklabDistance = differenceEuclidean('oklab');
const maxChannelDelta = (a: number, b: number) =>
  Math.max(...[0, 1, 2].map((axis) => Math.abs(channel(a, axis) - channel(b, axis))));
const toCulori = (rgb: number) => ({
  mode: 'rgb' as const,
  r: channel(rgb, 0) / 255,
  g: channel(rgb, 1) / 255,
  b: channel(rgb, 2) / 255,
});
const toHex = (rgb: number) => `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;

/**
 * Warna dominan gambar sebagai `ColorSwatch[]`, urut dari pangsa piksel terbesar.
 * ID `c1..cN` stabil untuk input yang sama; hex `#RRGGBB` uppercase dari piksel sumber.
 * `maxColors` hanya memotong daftar akhir: menaikkannya menambah swatch di belakang, tidak mengganti yang ada.
 *
 * Perilaku yang perlu diketahui pemakai:
 * - Piksel dengan alpha < MIN_OPAQUE_ALPHA diabaikan; gambar tanpa piksel opak menghasilkan `[]`.
 * - Warna berjarak OKLab ≤ MERGE_OKLAB_DISTANCE atau ≤ MERGE_RGB_CHANNEL_DELTA per kanal digabung ke
 *   warna yang lebih luas, termasuk dua kategori yang memang semirip itu (mis. #FFFFFF dan #F0F0F0).
 * - Warna dengan pangsa < MIN_SWATCH_PIXEL_SHARE dibuang, termasuk garis tipis, titik kecil, atau teks;
 *   bila daftar melebihi maxColors, warna paling sempit (sering latar/teks) ikut terpotong. Tambahkan lewat color picker.
 * - Artefak kompresi JPEG dan anti-aliasing (tepi teks, batas tipis 1 px, perbatasan warna) dapat muncul
 *   sebagai swatch tambahan yang bukan kategori; keluarkan saat konfirmasi.
 * - Warna dominan bukan otomatis kategori; makna ditentukan saat konfirmasi.
 * Hasilnya bantuan analisis, bukan jaminan seluruh warna dalam gambar teridentifikasi. Warna yang tidak muncul
 * dapat diambil manual dengan `pickColor`.
 */
export function extractColors(source: ImageData, options: ExtractOptions = {}): ColorSwatch[] {
  const maxColors = options.maxColors ?? DEFAULT_MAX_COLORS;
  if (!Number.isInteger(maxColors) || maxColors < 1) {
    throw new RangeError('maxColors harus bilangan bulat ≥ 1.');
  }
  const { data, width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 || data.length !== width * height * 4) {
    throw new RangeError('ImageData tidak valid: ukuran data tidak sesuai dimensi.');
  }

  const hist: Histogram = {
    count: new Uint32Array(CELL_COUNT),
    min: new Uint8Array(CELL_COUNT * 3).fill(255),
    max: new Uint8Array(CELL_COUNT * 3),
  };
  let opaque = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < MIN_OPAQUE_ALPHA) continue;
    const cell = cellOf(data[p], data[p + 1], data[p + 2]);
    hist.count[cell]++;
    for (let a = 0; a < 3; a++) {
      const v = data[p + a];
      if (v < hist.min[cell * 3 + a]) hist.min[cell * 3 + a] = v;
      if (v > hist.max[cell * 3 + a]) hist.max[cell * 3 + a] = v;
    }
    opaque++;
  }
  if (opaque === 0) return [];

  const cells: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) if (hist.count[cell] > 0) cells.push(cell);
  const boxes = medianCut(cells, hist);

  // Wakil kotak berbasis massa: sel terpadat, lalu warna asli tersering di sel itu (hex persis pada warna datar).
  const repCellBox = new Int16Array(CELL_COUNT).fill(-1);
  for (let i = 0; i < boxes.length; i++) {
    let best = boxes[i].cells[0];
    for (const cell of boxes[i].cells) {
      if (hist.count[cell] > hist.count[best] || (hist.count[cell] === hist.count[best] && cell < best)) best = cell;
    }
    repCellBox[best] = i;
  }
  const exact = new Map<number, number>();
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < MIN_OPAQUE_ALPHA || repCellBox[cellOf(data[p], data[p + 1], data[p + 2])] < 0) continue;
    const rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    exact.set(rgb, (exact.get(rgb) ?? 0) + 1);
  }
  const repRgb = new Array<number>(boxes.length).fill(-1);
  const repCount = new Array<number>(boxes.length).fill(0);
  for (const [rgb, n] of exact) {
    const box = repCellBox[cellOf(channel(rgb, 0), channel(rgb, 1), channel(rgb, 2))];
    if (n > repCount[box] || (n === repCount[box] && rgb < repRgb[box])) {
      repRgb[box] = rgb;
      repCount[box] = n;
    }
  }

  const candidates = boxes
    .map((box, i) => ({ rgb: repRgb[i], count: box.count }))
    .sort((a, b) => b.count - a.count || a.rgb - b.rgb);

  // Gabungkan ke kandidat lebih besar yang sudah diterima bila terlalu dekat menurut salah satu ukuran.
  const accepted: { rgb: number; count: number; color: ReturnType<typeof toCulori> }[] = [];
  for (const candidate of candidates) {
    const color = toCulori(candidate.rgb);
    const near = accepted.find(
      (a) =>
        oklabDistance(a.color, color) <= MERGE_OKLAB_DISTANCE ||
        maxChannelDelta(a.rgb, candidate.rgb) <= MERGE_RGB_CHANNEL_DELTA,
    );
    if (near) near.count += candidate.count;
    else accepted.push({ ...candidate, color });
  }

  return accepted
    .filter((c) => c.count / opaque >= MIN_SWATCH_PIXEL_SHARE)
    .sort((a, b) => b.count - a.count || a.rgb - b.rgb)
    .slice(0, maxColors)
    .map((c, i) => ({ id: `c${i + 1}`, hex: toHex(c.rgb) }));
}
