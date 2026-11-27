import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Gambar sintetis khusus acceptance prepare. Tidak ada data pribadi atau request API.
const ordinal = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
<rect width="1000" height="700" fill="white"/>
<g font-family="Arial" fill="#172033" font-size="30">
<text x="60" y="65" font-size="36">Peta tingkat risiko banjir</text>
<text x="60" y="110">Peta skematis tiga wilayah</text>
<path d="M150 160 L580 180 L600 310 L120 310 Z" fill="#20815A" stroke="#172033" stroke-width="3"/>
<path d="M120 310 L600 310 L570 450 L140 450 Z" fill="#E5BA30" stroke="#172033" stroke-width="3"/>
<path d="M140 450 L570 450 L540 600 L170 580 Z" fill="#D64545" stroke="#172033" stroke-width="3"/>
<text x="280" y="250">Utara</text><text x="280" y="390">Tengah</text><text x="280" y="530">Selatan</text>
<text x="700" y="180">Legenda risiko</text>
<rect x="700" y="220" width="40" height="40" fill="#20815A"/><text x="760" y="251">Rendah</text>
<rect x="700" y="310" width="40" height="40" fill="#E5BA30"/><text x="760" y="341">Sedang</text>
<rect x="700" y="400" width="40" height="40" fill="#D64545"/><text x="760" y="431">Tinggi</text>
</g></svg>`;
const insufficient = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700">
<rect width="1000" height="700" fill="white"/><text x="150" y="350" font-family="Arial" font-size="46" fill="#172033">Data tidak tersedia</text></svg>`;
for (const [name, svg] of [['prepare-ordinal-map', ordinal], ['prepare-insufficient', insufficient]]) {
  await writeFile(`scripts/fixtures/${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`scripts/fixtures/${name}.png`);
}
await writeFile('scripts/fixtures/prepare-ordinal-map.json', JSON.stringify({
  mapping: { dataType: 'ordinal', categories: [
    { colorId: 'risk_low', label: 'Rendah', included: true, order: 1 },
    { colorId: 'risk_medium', label: 'Sedang', included: true, order: 2 },
    { colorId: 'risk_high', label: 'Tinggi', included: true, order: 3 },
    { colorId: 'background', label: null, included: false, order: null },
    { colorId: 'text', label: null, included: false, order: null },
  ] },
  groundTruth: { Utara: 'Rendah', Tengah: 'Sedang', Selatan: 'Tinggi' },
}, null, 2));
await writeFile('scripts/fixtures/prepare-insufficient.json', JSON.stringify({
  mapping: { dataType: 'categorical', categories: [
    { colorId: 'c1', label: 'Apel', included: true, order: null },
    { colorId: 'c2', label: 'Jeruk', included: true, order: null },
  ] }, groundTruth: { expectedStatus: 422, reason: 'Hanya teks Data tidak tersedia; tidak ada kategori/legenda/angka.' },
}, null, 2));
console.log('Fixture prepare dibuat tanpa request API.');
