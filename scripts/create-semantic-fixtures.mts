import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Fixture sintetis, bukan hasil Modul 1 atau data pengguna. Sharp sudah terpasang lewat Next.
const palette = ['#20815A', '#D64545', '#3869C5', '#D59B1B', '#8A42A8'];
for (const [name, labels, ordinal] of [
  ['semantic-two', ['Apel', 'Jeruk'], false],
  ['semantic-four', ['Apel', 'Jeruk', 'Melon', 'Anggur'], false],
  ['semantic-five', ['Apel', 'Jeruk', 'Melon', 'Anggur', 'Mangga'], false],
  ['semantic-ordinal', ['Rendah', 'Sedang', 'Tinggi'], true],
] as const) {
  const title = ordinal ? 'Tingkat risiko banjir: Rendah - Sedang - Tinggi' : 'Hasil panen kebun sekolah';
  const bars = labels.map((label, i) => {
    const x = 100 + i * 135, height = 130 + i * 65;
    return `<rect x="${x}" y="${570-height}" width="85" height="${height}" fill="${palette[i]}"/><text x="${x+35}" y="610">${String.fromCharCode(65+i)}</text><rect x="850" y="${170+i*75}" width="35" height="35" fill="${palette[i]}"/><text x="900" y="${196+i*75}">${label}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="1200" height="760" fill="#FFFFFF"/><g font-family="Arial" font-size="28" fill="#172033"><text x="60" y="65" font-size="32">${title.replace('<','&lt;')}</text><text x="850" y="125">Legenda</text><path d="M70 120V570H800" stroke="#172033" fill="none"/>${bars}<text x="100" y="700">Satu visual sintetis untuk pengujian semantic analysis.</text></g></svg>`;
  const analysis = { colors: [
    ...labels.map((_, i) => ({ id: `swatch_${i+1}_72`, hex: palette[i] })),
    { id: 'background_72', hex: '#FFFFFF' }, { id: 'text_72', hex: '#172033' },
  ], conflicts: [], threshold: 10 };
  const expected = { visualType: 'bar', dataType: ordinal ? 'ordinal' : 'categorical',
    labels: Object.fromEntries(labels.map((label, i) => [`swatch_${i+1}_72`, label])),
    ...(ordinal ? { orders: Object.fromEntries(labels.map((_, i) => [`swatch_${i+1}_72`, i+1])) } : {}),
  };
  await writeFile(`scripts/fixtures/${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`scripts/fixtures/${name}.png`);
  await writeFile(`scripts/fixtures/${name}.json`, JSON.stringify({ analysis, context: { subject: 'Matematika', grade: 'SMP' }, expected }, null, 2));
}
console.log('Empat fixture sintetis dibuat tanpa request API.');
