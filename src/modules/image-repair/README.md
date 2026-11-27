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
let configs = initial.configs; // kosong jika mapping ditolak; alasannya di initial.warnings

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
- `result.warnings` **sudah memuat** pesan dari `validatePatternConfigs`, termasuk peringatan tingkat ordinal yang terlalu rapat. Jangan tampilkan keduanya sekaligus.
- `recommendPatterns` dengan mapping tidak valid mengembalikan `configs: []`; alasannya ada di `warnings`.

### Aturan blok (v1.1)

- **1–4 kategori `included`**, untuk categorical maupun ordinal. Kategori `excluded` (latar, teks, grid, dekorasi) tidak dihitung. Jika 0 atau lebih dari 4: `recommendPatterns`/`resetPatterns` mengembalikan `configs: []`, `validatePatternConfigs` mengisi `errors`, dan `repairImage` tidak mengubah satu piksel pun. Tidak ada perbaikan sebagian.
- **Categorical: jenis pola harus unik.** Duplikat `kind` masuk `errors`, walau jaraknya berbeda. Untuk 1–3 kategori, guru bebas memilih jenis mana pun dari `PATTERN_KINDS`.
- **Tepat satu konfigurasi per kategori `included`.** Kategori tanpa pola masuk `errors`.
- **Ordinal:** semua tingkat wajib `ORDINAL_PATTERN_KIND` (dropdown jenis pola sebaiknya dikunci di editor) dan jarak harus mengecil seiring `order` setelah dibulatkan; jika tidak, `errors`. Selisih < 3 px dengan arah yang benar hanya `warnings`. Saat slider digeser, state antara bisa tidak valid, jadi tampilkan `errors` tanpa membuang pilihan pengguna.
- UI **tidak boleh** meminta pengguna mengecualikan kategori yang relevan hanya untuk lolos batas.

## 2. Catatan integrasi wajib (Modul 4)

- **Hanya browser.** `repairImage` butuh `ImageData`, export butuh `HTMLCanvasElement`. Komponen `'use client'` tetap di-prerender di server, jadi panggil dari event handler atau `useEffect`, jangan saat render.
- **Arah ordinal:** `order` lebih besar = tingkat lebih tinggi = arsir lebih rapat (`spacingPx` lebih kecil). Arah terbalik tidak bisa dideteksi modul ini.
- **Export:** berikan `result.image` (mode normal), **bukan** hasil simulasi CVD.
- **Status hasil:** `appliedColorIds.length > 0` **tidak cukup** sebagai tanda sukses. Pada uji gambar nyata, gambar bergradasi melaporkan 3/3 diterapkan padahal hanya 0,13% piksel berpola. Aturan untuk UI:
  - Selalu tampilkan seluruh `result.warnings`.
  - Bandingkan `appliedColorIds.length` dengan jumlah kategori `included`. Jika kurang, sebutkan kategori yang belum berpola.
  - Tandai "berhasil diperbaiki" hanya jika semua kategori `included` berpola **dan** `warnings` kosong. Selain itu tampilkan "diperbaiki sebagian, periksa preview". Apa pun statusnya, isinya berarti pola diterapkan, bukan jaminan terbaca.
- **Unduhan:** tombol, `URL.createObjectURL`, `URL.revokeObjectURL`, dan tampilan error ada di UI.
- **Slider jarak:** pakai bilangan bulat (`step={1}`); renderer membulatkan jarak ke piksel utuh.
- **Invalidasi:** perubahan pola harus membatalkan hasil Uji Terbaca (PRD §8.3).
- **Kinerja:** `repairImage` sinkron. Pada gambar nyata di Chrome, 3726×3219 butuh sekitar 1,1 detik (repair) + 0,4 detik (export), jadi tampilkan indikator proses dan debounce slider.
- **Ukuran input:** gambar dengan sisi > 4096 px perlu diperkecil dulu oleh UI (baseline PRD); modul ini tidak melakukan downscale.

### Dependency ke Modul 1 (Icul)

- `ColorSwatch[]` **wajib menyertakan warna latar dan teks dominan** (juga garis batas bila berbeda). Piksel hanya terlindungi oleh swatch lain yang "bersaing"; warna yang tidak terdaftar dan masih dalam toleransi akan ikut berpola.
- Hindari swatch hampir identik (jarak OKLab ≤ 0,10): memicu peringatan dan piksel satu area bisa terbagi.
- `SemanticCategory.colorId` harus sama dengan `ColorSwatch.id`.

## 3. Konstanta default (PRD §15 — belum disepakati tim)

Semua ada di [constants.ts](constants.ts). Nilai di bawah sudah dicek pada uji browser §4; tetap perlu disetujui tim.

| Konstanta | Nilai | Arti |
|---|---|---|
| `MAX_INCLUDED_CATEGORIES` | 4 | Batas kategori `included` (tidak diekspor) |
| `MIN_SPACING_PX` / `MAX_SPACING_PX` | 4 / 32 | Batas jarak yang diterima |
| `CATEGORICAL_SPACING_PX` | 10 | Jarak awal categorical |
| `ORDINAL_PATTERN_KIND` | `diagonal` | Keluarga arsir ordinal |
| `ORDINAL_SPARSEST_` / `ORDINAL_DENSEST_SPACING_PX` | 24 / 6 | Tingkat terendah → tertinggi |
| `MIN_ORDINAL_STEP_PX` | 3 | Selisih jarak antartingkat berurutan di bawah ini diperingatkan oleh `validatePatternConfigs` (bisa terjadi lewat slider manual) |
| `DEFAULT_MASK_TOLERANCE` | 0,05 | Jarak Euclidean OKLab; **bukan** ambang ΔE konflik. Tidak diubah: JPEG q50 tetap tertangkap |
| `MASK_EDGE_INSET_PX` | 2 (absolut) | Jarak dari warna lain yang dibiarkan tanpa pola. **Tidak lagi dikali scale:** sebelumnya menjadi 4 px di gambar 3–4K dan mengosongkan kotak legenda |
| `MIN_USABLE_MASK_SHARE` | 0,35 | Warning "tidak merata" jika area berpola < 35% dari piksel yang cocok (area terpecah, tipis, atau bergradasi) |
| `MIN_COLOR_PIXEL_SHARE` | 0,002 | Warning "tidak merata" jika piksel yang cocok < 0,2% dari piksel opak gambar |
| `MIN_THICKNESS_SPACING_RATIO` | 0,5 | Warning "terputus-putus" jika tebal rata-rata area (2 × luas / piksel tepi) < 0,5 × jarak pola efektif |
| `BACKGROUND_BORDER_SHARE` | 0,5 | Target yang menempati > 50% piksel tepi gambar diperingatkan sebagai kemungkinan latar |
| `MIN_MASK_AREA_PX` | 100 × scale² | Di bawah ini diberi peringatan area kecil (hanya jika pola tergambar) |
| `PATTERN_SCALE_REFERENCE_PX` / `MAX_PATTERN_SCALE` | 1000 / 2,5 | `scale = √(sisi terpanjang / 1000)`, minimal 1, maksimal 2,5 (4096 px → 2,02). **Sebelumnya linear hingga 4×.** Mengalikan jarak, tebal garis, jari-jari titik |
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

Tabel di atas memakai konstanta saat itu (scale linear, jarak tepi dikali scale). Hasil terbaru ada di §4a.

### 4a. Uji 11 gambar nyata (27 November 2026, setelah perbaikan scale dan warning)

> **Catatan v1.1:** uji ini dijalankan **sebelum** batas keras 1–4 kategori diterapkan. Gambar dengan lebih dari 4 kategori (pie 8 kategori, diagram garis 8 warna, batang bertumpuk 5 warna, peta dan matriks 5–10 tingkat) kini sengaja diblok oleh engine, jadi baris-baris itu hanya menggambarkan perilaku masking dan pola, bukan hasil yang bisa didapat sekarang. Harness belum dijalankan ulang.

Gambar dari internet (bukan buatan tim); swatch dan urutan dipilih manual dari piksel asli. Latar, teks, dan garis batas disertakan sebagai `included: false`. Harness ada di `.local-test/` (tidak masuk git). Gambar > 4096 px diperkecil dulu oleh harness.

| Gambar | Ukuran diuji | Repair | Pola | Hasil |
|---|---|---|---|---|
| Matriks risiko 3 tingkat (2 gambar) | 775×508, 462×436 | 34–90 ms | 3/3 | Baik; teks dan garis aman |
| Pie 8 kategori | 800×800 | 40 ms | 4/8 | Baik untuk 4 kategori; sisanya dilaporkan |
| Peta HDI 10 tingkat | 3726×3219 | 1066 ms | 10/10 | Semua kotak legenda berpola (sebelumnya 2 kosong); 10 tingkat diperingatkan sulit dibedakan |
| Peta sensus 5 tingkat | 800×600 | 102 ms | 5/5 | Legenda benar; poligon kecil tanpa pola |
| Batang bertumpuk | 4096×2445 | 538 ms | 4/5 | Segmen besar rapi; segmen tipis berpola tidak merata (diperingatkan) |
| Matriks JPEG 5 tingkat | 555×402 | 106 ms | 5/5 | Teks abu-abu kontras rendah ikut dilintasi pola |
| Pie JPEG | 500×500 | 52 ms | 4/4 | Irisan baik; kotak legenda 13 px hanya berisi serpihan pola |
| Batang gradien, peta raster | 950×670, 3200×1278 | 156–279 ms | penuh | Di luar scope; kini diberi warning "tidak merata" |
| Diagram garis | 2725×4096 | 391 ms | 4/8 | Garis sekitar 8 px tampak putus-putus; keempatnya diperingatkan (rasio tebal/jarak 0,34–0,44) |

Semua PNG bisa di-decode dengan dimensi identik, 0 piksel opak berbeda, dan sumber tidak termutasi.

**Belum diuji:** browser selain Chrome, swatch hasil ekstraksi Modul 1 (bukan pilihan manual), dan alur di UI Modul 4 (E2E).

## 5. Keterbatasan (untuk warning UI dan proposal)

- Hanya gambar warna datar. Foto, gradien, heatmap, dan tekstur tidak didukung.
- **Diagram garis praktis tidak didukung:** garis < ~6 px tidak mendapat pola. Garis ≥ 6 px mendapat pola yang tampak seperti garis putus-putus; warning "terputus-putus" hanya muncul jika lebarnya < 0,5 × jarak pola. Swatch legenda yang tipis juga tidak berpola.
- Tebal area diestimasi **per warna**, bukan per region: strip tipis di samping area besar berwarna sama tidak diperingatkan. Sebaliknya, tepi yang bergerigi (noise JPEG, banyak teks) menurunkan estimasi sehingga warning bisa muncul walau area utamanya lebar (terjadi pada matriks JPEG uji).
- **Kotak legenda mini (< ~20 px)** hanya berisi serpihan pola karena 2 px di setiap sisi dibiarkan kosong dan jarak pola default 10–24 px. Tidak ada warning khusus, karena area dihitung per warna, bukan per kotak. Kotak legenda ≥ 40 px lebih aman.
- **Teks berkontras rendah di atas fill** (mis. abu-abu semi-transparan di sel merah muda) ikut dilintasi pola: inti huruf terlindungi, tetapi tepi huruf yang berjarak ≤ 0,05 dari fill dianggap fill. Menambah swatch tidak membantu karena warna teks berupa campuran.
- Maksimal 4 kategori informasi per gambar; satu visual per gambar. Engine tidak mendeteksi multi-visual, jadi pengecekan itu ada di UI/review guru.
- Gambar sumber dengan tepi semi-transparan (latar transparan) dapat mendapat tinta pola pada piksel semi-transparan; alpha tetap dipertahankan.
- Warna kategori yang sangat terang (mis. `#FFFFB2`) berjarak ≤ 0,10 dari putih dan memicu peringatan "terlalu mirip". Ini wajar: pemisahan tetap memakai swatch terdekat, tetapi piksel anti-aliasing di perbatasannya bisa salah kelompok.
- Tidak ada connected components: peringatan area kecil dihitung per warna, bukan per region.
- Teks atau garis yang sewarna dengan fill tidak bisa dilindungi.
- Deteksi latar memakai piksel tepi: gambar yang di-crop rapat sehingga tepinya didominasi satu kategori akan memicu peringatan latar.
- Piksel semi-transparan bisa bergeser sedikit saat export karena premultiplied alpha canvas. Piksel opak terbukti identik.
- Pola tidak mengubah ΔE warna sumber; jangan melaporkan konflik warna hilang.
