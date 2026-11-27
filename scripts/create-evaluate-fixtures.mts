import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { converter, filterDeficiencyProt, filterDeficiencyDeuter, filterDeficiencyTrit } from 'culori';
import type { Rgb } from 'culori';

// Fixture offline khusus QA: bukan implementasi/integrasi Icul atau renderer Rico.
const directory = 'scripts/fixtures/evaluate';
await mkdir(directory, { recursive: true });
const modes = ['protan', 'deutan', 'tritan', 'grayscale'] as const;
const toLinear = converter('lrgb'), toRgb = converter('rgb');
const filters = { protan: filterDeficiencyProt(1), deutan: filterDeficiencyDeuter(1), tritan: filterDeficiencyTrit(1) };
const cache = new Map<string, number[]>();
function simulatePixel(r: number, g: number, b: number, mode: typeof modes[number]) {
  const key = `${mode}:${r},${g},${b}`;
  const cached = cache.get(key); if (cached) return cached;
  const linear = toLinear({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 });
  // Culori's deficiency helper multiplies RGB components by Machado-derived matrices.
  // Pass linear components to that matrix, then encode back to sRGB explicitly.
  const components: Rgb = { mode: 'rgb', r: linear.r, g: linear.g, b: linear.b };
  const y = .2126 * linear.r + .7152 * linear.g + .0722 * linear.b;
  const projected = mode === 'grayscale' ? { r: y, g: y, b: y } : filters[mode](components);
  const rgb = toRgb({ mode: 'lrgb', r: projected.r, g: projected.g, b: projected.b });
  const result = [rgb.r, rgb.g, rgb.b].map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255));
  cache.set(key, result); return result;
}
function patterns(ordinal = false) {
  return `<defs>${[0, 1, 2, 3].map((i) => {
    const spacing = ordinal ? [24, 14, 7, 7][i] : 18;
    const shape = ordinal || i === 2 ? `<path d="M0 0H${spacing}"/>` : i === 1
      ? '<circle cx="8" cy="8" r="3" fill="#172033" stroke="none"/>'
      : i === 3 ? '<path d="M0 0L18 18M18 0L0 18"/>' : '<path d="M0 18L18 0"/>';
    return `<pattern id="p${i}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><g stroke="#172033" stroke-width="3">${shape}</g></pattern>`;
  }).join('')}</defs>`;
}
function barSvg(labels: readonly string[], after: boolean) {
  const colors = ['#20815A', '#D64545', '#3869C5', '#D59B1B'];
  const legendOrder = labels.length === 2 ? [1, 0] : [2, 0, 3, 1];
  const rect = (x: number, y: number, w: number, h: number, i: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors[i]}"/>${after ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#p${i})"/>` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="1200" height="760" fill="white"/>${patterns()}<g font-family="Arial" fill="#172033" font-size="28"><text x="60" y="65" font-size="36">Hasil panen kebun sekolah</text><text x="850" y="125">Legenda</text><path d="M70 120V570H800" fill="none" stroke="#172033"/>${labels.map((_, i) => `${rect(100 + i * 150, 570 - (140 + i * 65), 95, 140 + i * 65, i)}<text x="${130+i*150}" y="615">${String.fromCharCode(65+i)}</text>`).join('')}${legendOrder.map((i, row) => `${rect(850, 170+row*90, 45, 45, i)}<text x="920" y="${203+row*90}">${labels[i]}</text>`).join('')}</g></svg>`;
}
const mapBefore = await readFile('scripts/fixtures/prepare-ordinal-map.svg', 'utf8');
const mapColors = ['#20815A', '#E5BA30', '#D64545'];
const mapAfter = mapBefore.replace('<g font-family=', `${patterns(true)}<g font-family=`)
  .replace(/<(?:rect|path)\b[^>]*fill="(#[0-9A-Fa-f]+)"[^>]*\/>/g, (tag, color: string) => {
    const index = mapColors.indexOf(color);
    return index < 0 ? tag : tag + tag.replace(`fill="${color}"`, `fill="url(#p${index})"`);
  });
const sources = [
  { name: 'two', before: barSvg(['Apel', 'Jeruk'], false), after: barSvg(['Apel', 'Jeruk'], true),
    questions: [
      { id: 'q1', question: 'Batang mana yang mewakili kategori Jeruk?', expectedAnswer: 'B' },
      { id: 'q2', question: 'Kategori apa yang diwakili batang A?', expectedAnswer: 'Apel' },
    ] },
  { name: 'four', before: barSvg(['Apel', 'Jeruk', 'Melon', 'Anggur'], false), after: barSvg(['Apel', 'Jeruk', 'Melon', 'Anggur'], true),
    questions: [
      { id: 'q1', question: 'Batang dengan kode A mewakili kategori buah apa?', expectedAnswer: 'Apel' },
      { id: 'q2', question: 'Kategori buah apa yang diwakili batang dengan kode C?', expectedAnswer: 'Melon' },
      { id: 'q3', question: 'Batang dengan kode D mewakili kategori buah apa?', expectedAnswer: 'Anggur' },
    ] },
  { name: 'ordinal', before: mapBefore, after: mapAfter,
    questions: [
      { id: 'q1', question: 'Apa tingkat risiko banjir pada wilayah Utara?', expectedAnswer: 'Rendah' },
      { id: 'q2', question: 'Wilayah mana yang memiliki tingkat risiko banjir Sedang?', expectedAnswer: 'Tengah' },
      { id: 'q3', question: 'Apa tingkat risiko banjir pada wilayah Selatan?', expectedAnswer: 'Tinggi' },
    ] },
];
for (const source of sources) {
  assert(source.questions.length >= 2 && source.questions.length <= 3);
  await writeFile(`${directory}/${source.name}.json`, JSON.stringify({ questions: source.questions }, null, 2));
  for (const side of ['before', 'after'] as const) {
    await writeFile(`${directory}/${source.name}-${side}.svg`, source[side]);
    const { data, info } = await sharp(Buffer.from(source[side])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    for (const mode of modes) {
      const pixels = Buffer.from(data);
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = simulatePixel(pixels[i], pixels[i+1], pixels[i+2], mode);
        pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b;
      }
      await sharp(pixels, { raw: info }).png().toFile(`${directory}/${source.name}-${mode}-${side}.png`);
    }
  }
}
assert.deepEqual(simulatePixel(255, 255, 255, 'grayscale'), [255, 255, 255]);
assert.deepEqual(simulatePixel(0, 0, 0, 'grayscale'), [0, 0, 0]);
console.log('24 PNG fixture sebelum/sesudah disimulasikan, tanpa request API.');
