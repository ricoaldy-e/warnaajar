# Modul 3 — Image Repair & Pattern Engine

Owner: Rico. Mencakup FR-07, engine FR-08, dan FR-12. Tipe bersama diimpor dari `@/types`.

## 1. Public API (`@/modules/image-repair`)

| Export | Tanda tangan / isi |
|---|---|
| `recommendPatterns` | `(categories, swatches, dataType)` → `{ configs, warnings }` |
| `resetPatterns` | Sama dengan `recommendPatterns` (hasilnya deterministik) |
| `validatePatternConfigs` | `(configs, categories, swatches, dataType)` → `{ errors, warnings }` |
| `repairImage` | `(source, swatches, categories, dataType, configs, tolerance?)` → `RepairResult` |
| `exportImageDataToPng` | `(image, sourceFilename?)` → `Promise<{ blob, filename }>`; melempar `Error` berbahasa Indonesia |
| `buildExportFilename` | `(sourceFilename?)` → `string` |
| `PATTERN_KINDS` | Daftar jenis pola, untuk dropdown editor |
| `MIN_SPACING_PX`, `MAX_SPACING_PX` | Batas slider jarak |
| `CATEGORICAL_SPACING_PX`, `ORDINAL_PATTERN_KIND`, `DEFAULT_MASK_TOLERANCE` | Nilai default |

### Alur pemakaian

```ts
// Jalankan di event handler atau efek di browser.
// 1. Setelah mapping dikonfirmasi pengguna
const initial = recommendPatterns(categories, swatches, dataType);
let configs = initial.configs; // tampilkan juga initial.warnings

// 2. Setiap pengguna mengubah pola
const { errors, warnings } = validatePatternConfigs(configs, categories, swatches, dataType);

// 3. Render, selalu dari gambar ASLI (bukan hasil render sebelumnya)
const result = repairImage(sourceImageData, swatches, categories, dataType, configs);

// 4. Tombol reset
configs = resetPatterns(categories, swatches, dataType).configs;

// 5. Tombol unduh
const { blob, filename } = await exportImageDataToPng(result.image, file.name);
```

- `errors` tidak kosong: `repairImage` mengembalikan salinan sumber tanpa pola dan `appliedColorIds: []`.
- `result.warnings` **sudah memuat** pesan dari `validatePatternConfigs`. Jangan tampilkan keduanya sekaligus.
- `recommendPatterns` dengan mapping tidak valid mengembalikan `configs: []`; alasannya ada di `warnings`.

## 2. Catatan integrasi wajib (Modul 4)

- **Hanya browser.** `repairImage` butuh `ImageData`, export butuh `HTMLCanvasElement`. Komponen `'use client'` tetap di-prerender di server, jadi panggil dari event handler atau `useEffect`, jangan saat render.
- **Arah ordinal:** `order` lebih besar = tingkat lebih tinggi = arsir lebih rapat (`spacingPx` lebih kecil). Arah terbalik tidak bisa dideteksi modul ini.
- **Export:** berikan `result.image` (mode normal), **bukan** hasil simulasi CVD.
- **Status hasil:** cek `result.appliedColorIds.length > 0` sebelum menandai gambar "berhasil diperbaiki". Isinya berarti pola diterapkan, bukan jaminan terbaca.
- **Unduhan:** tombol, `URL.createObjectURL`, `URL.revokeObjectURL`, dan tampilan error ada di UI.
- **Slider jarak:** pakai bilangan bulat (`step={1}`); renderer membulatkan jarak ke piksel utuh.
- **Invalidasi:** perubahan pola harus membatalkan hasil Uji Terbaca (PRD §8.3).
- **Kinerja:** `repairImage` sinkron. Di Chrome, 4096×3072 butuh sekitar 1,3 detik (repair) + 0,4 detik (export), jadi tampilkan indikator proses dan debounce slider.

### Dependency ke Modul 1 (Icul)

- `ColorSwatch[]` **wajib menyertakan warna latar dan teks dominan** (juga garis batas bila berbeda). Piksel hanya terlindungi oleh swatch lain yang "bersaing"; warna yang tidak terdaftar dan masih dalam toleransi akan ikut berpola.
- Hindari swatch hampir identik (jarak OKLab ≤ 0,10): memicu peringatan dan piksel satu area bisa terbagi.
- `SemanticCategory.colorId` harus sama dengan `ColorSwatch.id`.

## 3. Konstanta default (PRD §15 — belum disepakati tim)

Semua ada di [constants.ts](constants.ts). Nilai di bawah sudah dicek pada uji browser §4; tetap perlu disetujui tim.

| Konstanta | Nilai | Arti |
|---|---|---|
| `MIN_SPACING_PX` / `MAX_SPACING_PX` | 4 / 32 | Batas jarak yang diterima |
| `CATEGORICAL_SPACING_PX` | 10 | Jarak awal categorical |
| `ORDINAL_PATTERN_KIND` | `diagonal` | Keluarga arsir ordinal |
| `ORDINAL_SPARSEST_` / `ORDINAL_DENSEST_SPACING_PX` | 24 / 6 | Tingkat terendah → tertinggi |
| `MIN_ORDINAL_STEP_PX` | 3 | Selisih di bawah ini diberi peringatan (≥ 8 tingkat; ≥ 20 tingkat ditolak) |
| `DEFAULT_MASK_TOLERANCE` | 0,05 | Jarak Euclidean OKLab; **bukan** ambang ΔE konflik. Tidak diubah: JPEG q50 tetap tertangkap |
| `MASK_EDGE_INSET_PX` | 2 × scale | Jarak dari warna lain yang dibiarkan tanpa pola. **Dinaikkan dari 1** setelah uji visual: dengan 1 px, angka putih di atas batang tertempel garis pola |
| `BACKGROUND_BORDER_SHARE` | 0,5 | Target yang menempati > 50% piksel tepi gambar diperingatkan sebagai kemungkinan latar |
| `MIN_MASK_AREA_PX` | 100 × scale² | Di bawah ini diberi peringatan area kecil |
| `PATTERN_SCALE_REFERENCE_PX` / `MAX_PATTERN_SCALE` | 1000 / 4 | `scale = clamp(sisi terpanjang / 1000, 1, 4)`; mengalikan jarak, tebal garis, jari-jari titik, jarak tepi |
| `PATTERN_LINE_WIDTH_PX` | 2 | Tebal garis pada scale 1 |
| `PATTERN_DOT_RADIUS_PX` | 2 (maks. jarak/3) | **Dinaikkan dari 1,5:** titik 2×2 px (4% area) terlalu samar; kini 12% pada jarak 10 |
| `PATTERN_INK_DARK` / `PATTERN_INK_LIGHT` | `#000000` / `#FFFFFF` | Dipilih yang kontrasnya lebih tinggi |

## 4. Hasil uji browser nyata (27 November 2026)

Chrome 158 headless via Playwright (`channel: 'chrome'`, profil sementara tanpa extension). Modul di-bundle, lalu `repairImage` → `exportImageDataToPng` → `createImageBitmap` dijalankan pada gambar yang digambar Canvas: teks dan garis ber-anti-aliasing, JPEG di-encode oleh browser. Skrip uji tidak disimpan di repo.

| Skenario | Ukuran | Repair | Export | Pola diterapkan | Catatan |
|---|---|---|---|---|---|
| (a) Batang, 4 kategori | 800×500 | 86 ms | 315 ms* | 4/4 | Tanpa warning |
| (b) Peta ordinal 4 tingkat | 1200×900 | 89 ms | 43 ms | 4/4 | Kategori "Rendah" lebih luas dari latar, tetapi **tidak** dianggap latar |
| (c) Batang JPEG q75 / q50 | 800×500 | 57 / 39 ms | 14 / 12 ms | 4/4 | Cakupan pola turun ≤ 1,4 poin dibanding versi bersih |
| (c) Peta JPEG q75 | 1200×900 | 167 ms | 42 ms | 4/4 | Sama seperti (b) |
| (d) Garis 2 / 4 / 8 px | 800×500 | 25 ms | 14 ms | 1/3 | Hanya garis 8 px yang berpola (garis putus pendek); 2 dan 4 px diberi warning "garis atau area tipis" |
| Peta besar | 4096×3072 | 1263 ms | 396 ms | 4/4 | — |

\* Export pertama mencakup inisialisasi encoder PNG di browser.

**Semua skenario:**
- PNG berawalan signature `89 50 4E 47 0D 0A 1A 0A`, dimensinya identik setelah di-decode, dan **0 piksel opak berbeda** dari `result.image` (total 15,7 juta piksel).
- Sumber tidak termutasi.
- **0 piksel** berpola pada teks, angka, garis batas, atau gridline, dan **0 piksel** berpola di luar area kategori. Diukur terhadap layer ground truth yang digambar terpisah.

**Pengecekan visual:** pola terbaca, legenda memakai pola yang sama dengan area, dan angka di atas batang tetap terbaca setelah jarak tepi dinaikkan.

**Belum diuji:** gambar buatan tim/nyata (bukan sintetis), browser selain Chrome, dan alur di UI Modul 4 (E2E).

## 5. Keterbatasan (untuk warning UI dan proposal)

- Hanya gambar warna datar. Foto, gradien, heatmap, dan tekstur tidak didukung.
- **Diagram garis praktis tidak didukung:** garis < ~6 px (dikali scale) tidak mendapat pola, garis 8 px hanya mendapat garis putus pendek. Swatch legenda yang tipis juga tidak berpola.
- Pada ordinal, tingkat terendah (jarak 24 × scale) hanya menampilkan 1–2 garis di kotak legenda kecil; kotak legenda ≥ 40 px lebih aman.
- Warna kategori yang sangat terang (mis. `#FFFFB2`) berjarak ≤ 0,10 dari putih dan memicu peringatan "terlalu mirip". Ini wajar: pemisahan tetap memakai swatch terdekat, tetapi piksel anti-aliasing di perbatasannya bisa salah kelompok.
- Tidak ada connected components: peringatan area kecil dihitung per warna, bukan per region.
- Teks atau garis yang sewarna dengan fill tidak bisa dilindungi.
- Deteksi latar memakai piksel tepi: gambar yang di-crop rapat sehingga tepinya didominasi satu kategori akan memicu peringatan latar.
- Hanya 4 pola: kategori categorical ke-5 dan seterusnya tidak diberi pola (disebut di `warnings`).
- Piksel semi-transparan bisa bergeser sedikit saat export karena premultiplied alpha canvas. Piksel opak terbukti identik.
- Pola tidak mengubah ΔE warna sumber; jangan melaporkan konflik warna hilang.
