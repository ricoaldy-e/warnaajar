import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { converter, filterDeficiencyProt, filterDeficiencyDeuter, filterDeficiencyTrit } from 'culori';
import type { ColorAnalysisResult } from '../src/types/index.js';
import type { z } from 'zod';

// Harness QA offline. Source Rico dibaca/bundle tanpa mengubah modul owner.
const folder = 'scripts/fixtures/phase6', flowPath = 'docs/Module-2-Phase-6-flow.json';
await mkdir(folder, { recursive: true });
if (process.argv[2] === 'source') {
  await sharp(await readFile('scripts/fixtures/evaluate/two-before.svg')).png().toFile(`${folder}/source-normal.png`);
  const flow: Record<string, unknown> = JSON.parse(await readFile(flowPath, 'utf8'));
  const fixture: { analysis: ColorAnalysisResult } = JSON.parse(await readFile('scripts/fixtures/semantic-two.json', 'utf8'));
  flow.analysis = fixture.analysis;
  await writeFile(flowPath, JSON.stringify(flow, null, 2));
  console.log('Sumber sintetis/metadata siap; belum ada request model.');
} else if (process.argv[2] === 'repair') {
  const flow: Record<string, unknown> & { analysis: ColorAnalysisResult;
    mapping: z.output<typeof import('../src/modules/ai-analysis/schemas').confirmedMappingSchema> } = JSON.parse(await readFile(flowPath, 'utf8'));
  assert.equal(flow.mappingReviewed, true);
  const built = await build({ configFile: false, envDir: false, logLevel: 'error', build: {
    write: false, minify: true, lib: { entry: fileURLToPath(new URL('../src/modules/image-repair/index.ts', import.meta.url)), name: 'WarnaAjarRepair', formats: ['iife'] },
  } });
  let code: string | undefined;
  for (const output of Array.isArray(built) ? built : [built]) {
    if ('output' in output) for (const chunk of output.output) if (chunk.type === 'chunk') code = chunk.code;
  }
  assert(code);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: code });
    const bytes = await readFile(`${folder}/source-normal.png`);
    const measured = await page.evaluate(async ({ dataUrl, swatches, mapping }) => {
      const engine = (window as unknown as { WarnaAjarRepair: typeof import('../src/modules/image-repair') }).WarnaAjarRepair;
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const source = context.getImageData(0, 0, canvas.width, canvas.height), original = new Uint8ClampedArray(source.data);
      const recommendation = engine.recommendPatterns(mapping.categories, swatches, mapping.dataType);
      const validation = engine.validatePatternConfigs(recommendation.configs, mapping.categories, swatches, mapping.dataType);
      if (validation.errors.length) throw new Error('Repair mapping/config invalid');
      const result = engine.repairImage(source, swatches, mapping.categories, mapping.dataType, recommendation.configs);
      const exported = await engine.exportImageDataToPng(result.image, 'phase6-source.png');
      let totalChanged = 0;
      for (let i = 0; i < original.length; i += 4) if (original[i] !== result.image.data[i] || original[i+1] !== result.image.data[i+1] || original[i+2] !== result.image.data[i+2]) totalChanged++;
      const boxes = [
        { name: 'bar-A-Apel', x: 100, y: 430, w: 95, h: 140 },
        { name: 'bar-B-Jeruk', x: 250, y: 365, w: 95, h: 205 },
        { name: 'legend-Jeruk', x: 850, y: 170, w: 45, h: 45 },
        { name: 'legend-Apel', x: 850, y: 260, w: 45, h: 45 },
      ];
      const regionChanges = boxes.map((box) => {
        let changed = 0;
        for (let y = box.y; y < box.y+box.h; y++) for (let x = box.x; x < box.x+box.w; x++) {
          const i = (y * source.width + x) * 4;
          if (original[i] !== result.image.data[i] || original[i+1] !== result.image.data[i+1] || original[i+2] !== result.image.data[i+2]) changed++;
        }
        return { name: box.name, changed };
      });
      return { png: Array.from(new Uint8Array(await exported.blob.arrayBuffer())), filename: exported.filename,
        width: source.width, height: source.height, configs: recommendation.configs, warnings: result.warnings,
        appliedColorIds: result.appliedColorIds, sourceUnchanged: original.every((value, i) => value === source.data[i]),
        totalChanged, regionChanges, changedOutsideTargets: totalChanged - regionChanges.reduce((sum, region) => sum + region.changed, 0),
      };
    }, { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, swatches: flow.analysis.colors, mapping: flow.mapping });
    assert(measured.sourceUnchanged && measured.appliedColorIds.length === 2 && measured.regionChanges.every((region) => region.changed > 0));
    assert.equal(measured.changedOutsideTargets, 0);
    const { png, ...metrics } = measured;
    await writeFile(`${folder}/repair-normal.png`, Buffer.from(png));
    flow.rico = { engine: 'Actual image-repair source bundled read-only via Vite, executed in Chrome', ...metrics };
    await writeFile(flowPath, JSON.stringify(flow, null, 2));
    console.log(JSON.stringify(metrics));
  } finally { await browser.close(); }
  // Icul masih scaffold: fixture simulasi QA memakai metode linear RGB Phase 5, bukan production.
  const toLinear = converter('lrgb'), toRgb = converter('rgb');
  const filters = { protan: filterDeficiencyProt(1), deutan: filterDeficiencyDeuter(1), tritan: filterDeficiencyTrit(1) };
  const cache = new Map<string, number[]>();
  for (const side of ['before', 'after']) {
    const { data, info } = await sharp(`${folder}/${side === 'before' ? 'source' : 'repair'}-normal.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const mode of ['protan', 'deutan', 'tritan', 'grayscale'] as const) {
      const pixels = Buffer.from(data);
      for (let i = 0; i < data.length; i += 4) {
        const key = `${mode}:${data[i]},${data[i+1]},${data[i+2]}`;
        let channels = cache.get(key);
        if (!channels) {
          const linear = toLinear({ mode: 'rgb', r: data[i]/255, g: data[i+1]/255, b: data[i+2]/255 });
          const y = .2126*linear.r + .7152*linear.g + .0722*linear.b;
          const projected = mode === 'grayscale' ? { r: y, g: y, b: y } : filters[mode]({ mode: 'rgb', r: linear.r, g: linear.g, b: linear.b });
          const rgb = toRgb({ mode: 'lrgb', r: projected.r, g: projected.g, b: projected.b });
          channels = [rgb.r, rgb.g, rgb.b].map((v) => Math.round(Math.max(0, Math.min(1, v))*255)); cache.set(key, channels);
        }
        pixels[i] = channels[0]; pixels[i+1] = channels[1]; pixels[i+2] = channels[2];
      }
      await sharp(pixels, { raw: info }).png().toFile(`${folder}/${mode}-${side}.png`);
    }
  }
  console.log('Delapan PNG simulasi QA siap. Tidak ada request CosmosIn.');
} else throw new Error('Pilih source atau repair.');
