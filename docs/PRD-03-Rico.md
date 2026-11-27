# WarnaAjar — PRD Modul 3: Image Repair & Pattern Engine

> **Owner:** Rico  
> **Versi:** 1.0 · turunan Master PRD v1.0 (27 November 2026)  
> **Tahap:** Perbaiki dan Export  
> **Prioritas:** P0 · MVP  
> **Acuan:** `PRD.md` di root repository. Target internal pengumpulan malam 29 November 2026.

## 1. Tujuan modul

Menghasilkan gambar dengan pola pembeda nonwarna melalui masking deterministik, menjaga warna dan informasi asli serta konsistensi legenda. Modul menerima hanya mapping yang telah dikonfirmasi pengguna.

WarnaAjar membantu pembuat materi menambahkan penanda nonwarna pada visual edukasi berbasis warna datar. Satu gambar per sesi, tanpa login. Output bukan alat diagnosis maupun jaminan aksesibilitas bagi seluruh individu.

## 2. Scope dan ownership

| FR | Ownership |
|---|---|
| FR-07 | Color masking, pola kategori/ordinal, perlindungan area non-target. |
| FR-08 | Konfigurasi dan validasi pola, reset/re-render; UI milik Nepa. |
| FR-12 | Fungsi ekspor PNG mode normal; tombol download milik Nepa. |
| FR-11 | `appliedColorIds` dan warnings untuk laporan. |

**Tech stack:** TypeScript, Canvas API (ImageData/CanvasPattern), Vitest. Culori dapat dipakai untuk toleransi jika diperlukan dan sesuai stack. Connected components hanya jika diperlukan.

**Area kode:** `src/modules/image-repair/` dan unit test/fixture terkait. Tidak membuat API route, halaman editor, state global, atau tipe duplikat.

## 3. Functional requirements dan acceptance criteria

Bagian berikut mengikuti FR Master PRD secara langsung. FR-08 dan FR-12 dibagi: Anda menyediakan engine dan helper, Nepa menyediakan kontrol/preview/download. Acceptance UI diperiksa bersama.

### FR-07 — Automatic Image Repair

- Lakukan color masking/thresholding menggunakan warna yang sudah dikonfirmasi. Gunakan connected components jika benar-benar diperlukan untuk mencegah area salah sasaran.
- Data categorical: gunakan pola berbeda, misalnya diagonal, titik, horizontal, atau crosshatch.
- Data ordinal: gunakan satu keluarga arsir dengan kerapatan meningkat sesuai urutan yang dikonfirmasi.
- Pertahankan warna sumber, geometri, posisi, angka, dan teks; tambahkan pola sebagai layer/mask, bukan menggambar ulang seluruh visual.
- Terapkan pola pada kategori dan legenda secara konsisten; lindungi piksel teks, garis batas dan area bukan target. Jika pemisahan tidak aman (misalnya warna teks sama dengan fill), jangan mengklaim hasil sempurna; tampilkan preview/peringatan dan izinkan koreksi pilihan warna atau batalkan.
- Jangan memakai AI image generation. Re-render harus selalu berangkat dari gambar asli sehingga perubahan pola tidak menumpuk.

**Acceptance:** fixture warna datar memiliki pola yang sesuai di area target dan legenda; piksel di luar mask yang disetujui tidak berubah; dimensi sumber tetap; konfigurasi sama menghasilkan output konsisten; area terlalu kecil atau ambigu diberi peringatan.
### FR-08 — Custom Pattern Editor

- Pengguna dapat mengganti jenis pola dan jarak/kerapatan secara sederhana.
- Perubahan diterapkan pada gambar dan legenda; gunakan properti pola yang sama untuk satu kategori.
- Cegah atau beri peringatan pada penanda yang sama untuk kategori yang perlu dibedakan; pada ordinal jaga urutan kerapatan.
- Berikan reset ke rekomendasi awal. Tidak perlu drag-and-drop layer atau drawing editor.

**Acceptance:** mengganti pola memperbarui preview tanpa mengubah gambar asli; legenda mengikuti konfigurasi; reset memulihkan konfigurasi awal; perubahan pola membatalkan hasil Uji Terbaca sebelumnya.
### FR-12 — Export PNG

- Unduh gambar hasil perbaikan mode normal dengan warna asli + pola. Mode simulasi hanya untuk preview/uji, bukan output default.
- Nama file yang mudah dikenali, misalnya `peta-warnaajar.png`.
- Output dari Canvas dengan dimensi sumber yang diterima, tanpa watermark, layout UI, atau panel laporan.
- Pengguna dapat mengunduh hasil meski Uji Terbaca gagal dijalankan, dengan status bahwa hasil belum diverifikasi oleh AI; jangan menandainya lulus.

**Acceptance:** file PNG valid dapat dibuka dan digunakan dalam slide; legenda, pola, dan gambar sesuai preview normal; gambar asli tetap tersedia; kegagalan export menampilkan pesan.

## 4. Kontrak integrasi (baseline Master PRD §8)

| Input | Output |
|---|---|
| `ImageData` asli, `ColorSwatch[]`, kategori terkonfirmasi, `DataType` | Konfigurasi rekomendasi `PatternConfig[]` untuk kategori yang disertakan |
| Sumber + mapping + konfigurasi pola | `RepairResult` (`image`, `appliedColorIds`, `warnings`) |
| Hasil repair normal terbaru | PNG valid (Blob/File untuk download oleh UI) |

Gunakan `SemanticCategory`, `PatternConfig`, `PatternKind`, `RepairResult`, `ColorSwatch` dan `DataType` pada Master PRD §8. `PatternConfig.colorId` harus merujuk swatch yang disertakan; `spacingPx` positif sesuai batas disepakati. Untuk ordinal urutan harus valid; semakin tinggi tingkat, semakin rapat arsir. `appliedColorIds` berarti pola benar-benar diterapkan, bukan sertifikat keterbacaan. Tidak ada `ImageData` di JSON API.

## 5. Urutan implementasi yang disarankan

1. Buat fixture warna datar yang memiliki area target, legenda, teks, garis batas dan latar. Implementasikan mask berbasis swatch dengan toleransi yang dapat dikonfigurasi. Hanya kategori included yang diproses.
2. Buat aturan rekomendasi pola kategori yang dapat dibedakan (diagonal, dots, horizontal, crosshatch); jika kategori lebih banyak dari pola yang layak, beri warning dan jangan mengklaim seluruhnya terbedakan.
3. Buat aturan ordinal satu keluarga arsir, jarak konsisten dengan urutan yang dikonfirmasi; jangan menebak urutan dari hue. Validasi konfigurasi pola duplikat atau kerapatan tidak valid, beri warning atau cegah sesuai FR-08.
4. Render pola dengan mask di atas salinan sumber. Konsisten untuk seluruh area kategori termasuk legenda, tetapi lindungi piksel teks, angka dan batas. Jangan memaksakan pemisahan jika warna kategori juga dipakai teks/latar dan tidak dapat dibedakan dengan aman; gunakan warning/preview dan koreksi atau batalkan.
5. Buat re-render dari sumber asli pada setiap perubahan pola, tidak menumpuk hasil sebelumnya. Reset menggunakan rekomendasi awal. Lindungi dimensi, alpha dan piksel di luar mask.
6. Buat export PNG dari hasil normal, tanpa UI/watermark. Uji decode hasil dan dimensi.
7. Serahkan fungsi, fixture, warnings dan cara integrasi ke Nepa. Catat keterbatasan garis tipis, JPEG anti-aliasing, area kecil, legenda ambigu dan visual di luar scope.

## 6. Batasan modul (jangan dikerjakan)

- Tidak melakukan AI semantic analysis, CVD simulation, perhitungan konflik, UI/editor desain umum, atau mengubah shared types sendiri.
- Tidak menggambar ulang grafik, mengubah data, bentuk peta, posisi angka, teks, atau proporsi. Tidak menggunakan AI image generation.
- Tidak mendukung foto, gradien kompleks, batch, PDF/PPT otomatis. Palet alternatif/direct labels hanya P1 jika disetujui. Diagram garis hanya jika pola aman pada garis cukup tebal/terpisah.
- Pola tidak mengubah ΔE warna sumber; jangan melaporkan konflik warna hilang. Report hanya kategori yang mendapat penanda tambahan.

## 7. Testing dan acceptance checklist

| Test | Lulus jika |
|---|---|
| Mask | Kategori included diproses; area excluded/latar yang bukan target tetap. |
| Legenda | Swatch legenda dan area kategori memakai konfigurasi identik. |
| Perlindungan | Piksel di luar mask tidak berubah; teks/batas pada fixture aman tetap utuh. |
| Ambiguitas | Area terlalu kecil/warna tumpang tindih diberi warning atau tidak diproses secara aman. |
| Ordinal | Urutan tinggi lebih rapat; order invalid tidak diproses sebagai ordinal. |
| Editor | Perubahan pola menghasilkan output baru dari sumber; reset konsisten; duplikasi pola diperingatkan. |
| Determinisme | Input/config sama menghasilkan piksel sama; sumber tidak dimutasi. |
| Export | PNG valid dapat didekode; dimensi dan tampilan normal sama dengan preview. |

Gunakan fixture buatan tim dengan ground truth yang dicatat. Tidak perlu mengejar akurasi 100% pada seluruh variasi gambar. Catat hasil nyata dan keterbatasan. Mock test bukan bukti keberhasilan produksi.

## 8. Handoff dan dependency lintas anggota

- Icul menyediakan sumber asli dan swatch. Toleransi masking bukan ambang ΔE konflik; parameter ini perlu dikunci tersendiri.
- Nepa menyediakan mapping hasil konfirmasi, pola yang diubah pengguna dan pemicu re-render/reset; jangan membaca langsung state global jika argumen sudah cukup.
- Nepa menampilkan warnings dan `appliedColorIds`, memanggil export, serta membuat versi simulasi dari output untuk dikirim ke Steven.
- Sepakati batas `spacingPx`, toleransi masking, penanganan mask tumpang tindih, dan kondisi visual yang belum aman. Jika dukungan diagram garis belum lolos fixture, laporkan.

## 9. Definition of Done

Repair deterministik bekerja pada fixture visual datar, pola kategori dan ordinal konsisten termasuk legenda, gambar asli tidak berubah, warning jujur, editor dapat terhubung dan PNG normal valid.

Checklist serah terima:

- [ ] Kode hanya menyentuh ownership yang disepakati.
- [ ] Kontrak dan contoh input/output dapat digunakan anggota terkait.
- [ ] Acceptance criteria P0 modul dipenuhi atau blocker dilaporkan.
- [ ] Test relevan ditambahkan dan hasil typecheck/lint/test dicatat.
- [ ] Tidak ada mock produksi, API key, atau klaim hasil yang tidak dibuktikan.
- [ ] README/handoff singkat tentang cara penggunaan modul dan keterbatasan tersedia.

## 10. Aturan wajib AI coding agent

- Baca `PRD.md` (Master PRD) dan PRD modul ini sebelum coding. Baca `AGENTS.md` jika tersedia, shared types, dan kode relevan. PRD modul ini memperinci ownership, bukan mengganti Master PRD.
- Kerjakan hanya task yang diberikan; jangan mengimplementasikan seluruh dokumen sekaligus. Pilih perubahan terkecil yang memenuhi acceptance criteria. Gunakan TypeScript strict, tanpa `any`.
- Jangan menambah dependency, abstraksi generik, layer arsitektur, framework, atau fitur baru tanpa kebutuhan yang jelas dan persetujuan jika di luar stack. Jangan refactor kode yang tidak terkait.
- Jangan mengubah shared types, API contract, state lintas modul, struktur repo, atau kode anggota lain secara sepihak. Koordinasikan perubahan yang berdampak pada integrasi. Gunakan kontrak §8 Master PRD sebagai baseline; nama fungsi lokal tidak dikunci selama interface bersama tetap konsisten.
- P0 dahulu; P1 hanya setelah seluruh P0 stabil dan tim menyetujui. Tidak ada login, database, histori permanen, cloud storage, backend terpisah, RAG, chatbot, AI image generation, atau fitur diagnosis.
- Mock hanya untuk development/test dan ditandai jelas. Jangan gunakan hasil palsu pada produksi, menyembunyikan kegagalan, mengklaim aksesibilitas klinis, atau mengklaim peningkatan hasil belajar.
- Tambahkan test yang relevan, jalankan typecheck/lint/test sesuai perubahan, dan laporkan hasil nyata. Build/E2E saat integrasi. Jangan commit, push, merge, atau deploy tanpa izin eksplisit.
- Jika parameter belum ditetapkan, lakukan POC lokal dengan fixture dan tandai asumsi; jangan mengunci parameter lintas modul secara sepihak.

## 11. Template prompt untuk AI agent Rico

```text
Baca PRD.md dan docs/PRD-03-Rico.md secara menyeluruh.
Baca AGENTS.md jika tersedia, shared types, dan kode relevan.
Kamu bekerja hanya sebagai coding agent modul 3 — Image Repair & Pattern Engine (owner Rico).
Task: [satu kebutuhan spesifik]
FR: [ID requirement]
Acceptance criteria: [kriteria relevan]
Area kode: [file/direktori yang diizinkan]
Gunakan implementasi terkecil yang memenuhi task. Jangan keluar scope, menambah dependency,
atau mengubah kontrak/modul lain tanpa persetujuan. Jangan mengerjakan P1, menggunakan any,
atau membuat mock sebagai hasil produksi. Tambahkan test relevan dan jalankan pemeriksaan.
Laporkan perubahan, file, hasil test dan blocker. Jangan commit/push/merge/deploy tanpa izin.
```

**Contoh task:** Implementasikan FR-07 untuk kategori warna datar dari mapping terkonfirmasi. Jangan menambahkan UI, endpoint, palet alternatif, atau rekonstruksi gambar.
