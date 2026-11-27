# WarnaAjar — PRD Modul 1: Image Processing & Color Analysis

> **Owner:** Icul  
> **Versi:** 1.0 · turunan Master PRD v1.0 (27 November 2026)  
> **Tahap:** Periksa  
> **Prioritas:** P0 · MVP  
> **Acuan:** `PRD.md` di root repository. Target internal pengumpulan malam 29 November 2026.

## 1. Tujuan modul

Menghasilkan analisis warna dan simulasi CVD yang deterministik dari satu gambar raster. Modul ini menjadi fondasi temuan konflik, koreksi warna, preview before/after, dan input Uji Terbaca. Semua perhitungan dilakukan di browser.

WarnaAjar membantu pembuat materi menambahkan penanda nonwarna pada visual edukasi berbasis warna datar. Satu gambar per sesi, tanpa login. Output bukan alat diagnosis maupun jaminan aksesibilitas bagi seluruh individu.

## 2. Scope dan ownership

| FR | Ownership |
|---|---|
| FR-01 | Decode, validasi file dan sumber gambar; Nepa menangani UI upload. |
| FR-02 | Ekstraksi warna dominan dan transformasi CVD. |
| FR-03 | Deteksi konflik berbasis CIEDE2000. |
| FR-04 | Helper color picker; Nepa menangani interaksi UI. |
| FR-10/11 | Menyediakan fungsi simulasi dan data konflik bagi Nepa. |

**Tech stack:** TypeScript, Canvas API, Culori, Vitest. Tidak membutuhkan Gemini, Zustand, atau server route.

**Area kode:** `src/modules/color-analysis/` dan unit test/fixture terkait. Perubahan shared types hanya melalui kesepakatan tim. Jangan membangun halaman upload atau komponen editor.

## 3. Functional requirements dan acceptance criteria

Bagian berikut mengikuti FR Master PRD secara langsung. FR-01 dan FR-04 dibagi: Anda menyediakan helper, Nepa menyediakan kontrol UI. Acceptance UI merupakan tanggung jawab integrasi bersama.

### FR-01 — Image Input

- File picker, drag-and-drop, paste clipboard, dan contoh gambar lokal.
- Terima PNG/JPEG yang valid dan dapat didekode, bukan hanya berdasarkan ekstensi.
- Satu gambar aktif; penggantian gambar mereset hasil turunan sesi sebelumnya.
- Simpan gambar sumber tanpa modifikasi untuk perbandingan dan perbaikan ulang.
- Batasi ukuran dan resolusi dengan pesan kesalahan yang jelas. Baseline awal yang diusulkan: 5 MB file input dan maksimum 4096 px pada sisi terpanjang untuk PNG output; sepakati batas final lintas modul. Buat salinan yang diperkecil khusus analisis AI jika perlu; jangan diam-diam menurunkan resolusi export.

**Acceptance:** gambar valid dapat dipratinjau; input rusak/format tak didukung ditolak tanpa crash; penggantian input tidak menampilkan hasil dari gambar lama.
### FR-02 — Color Extraction & CVD Simulation

- Gunakan Canvas API untuk membaca piksel (RGBA) dan menghasilkan salinan visual.
- Kelompokkan warna dominan dengan color quantization (Median Cut sebagai baseline). Gunakan sampel/resolusi analisis yang masuk akal; tidak perlu pipeline ML.
- Gunakan model Machado untuk protan, deutan, dan tritan; implementasikan dengan domain warna/konversi yang sesuai referensi model. Grayscale merupakan mode tambahan, bukan simulasi klinis akromatopsia.
- MVP memakai simulasi tingkat maksimum sebagai pendekatan konservatif; jelaskan tingkat persepsi individu dapat berbeda.
- Pengguna dapat berpindah antara Normal / Protan / Deutan / Tritan / Hitam-putih.

**Acceptance:** warna sumber tidak berubah; mode berbeda menghasilkan hasil yang sesuai fixture referensi; dimensi dan alpha dipertahankan pada output simulasi; tidak ada klaim hasil sebagai persepsi aktual setiap individu.
### FR-03 — Color Conflict Detection

- Konversi warna hasil simulasi ke ruang warna yang sesuai untuk CIEDE2000 (Lab dengan white point konsisten).
- Hitung ΔE00 untuk pasangan warna unik pada setiap mode CVD. Jangan menghitung pasangan yang sama dua kali.
- Tampilkan pasangan warna sumber, mode CVD terkait, ΔE00, dan status potensi konflik.
- Gunakan satu nilai ambang yang terdokumentasi dan dapat dikonfigurasi secara internal; nilainya harus ditentukan melalui fixture/POC tim. Tidak ada ambang universal yang membuktikan dua warna tidak dapat dibedakan oleh semua orang.
- Temuan tahap ini berbasis piksel; AI dan konfirmasi pengguna menentukan apakah pasangan membawa informasi penting.

**Acceptance:** pasangan identik memiliki ΔE mendekati nol; uji nilai terhadap pasangan Lab referensi CIEDE2000; daftar konflik konsisten untuk input dan konfigurasi yang sama; UI menyebutnya potensi hambatan, bukan diagnosis.
### FR-04 — Manual Color Picker

- Guru dapat mengklik piksel pada gambar asli untuk menambahkan/mengoreksi warna target.
- Tampilkan swatch dan hex; perhitungkan scaling gambar dan koordinat Canvas.
- Jangan menambahkan mask seluruh objek secara otomatis hanya berdasarkan koordinat. Warna terpilih merupakan input segmentasi dengan toleransi yang ditetapkan engine.
- Perubahan daftar warna membatalkan hasil konflik/pemetaan/perbaikan yang bergantung padanya sampai dihitung ulang atau dikonfirmasi kembali.

**Acceptance:** klik swatch fixture menghasilkan warna yang tepat; pilihan dapat digunakan oleh modul analisis dan perbaikan; hasil lama tidak dianggap valid setelah perubahan.

## 4. Kontrak integrasi (baseline Master PRD §8)

| Input | Output | Konsumen |
|---|---|---|
| File/Blob PNG atau JPEG | Sumber gambar yang berhasil didekode; dimensi dan data RGBA | Nepa, Rico |
| `ImageData` sumber | `ColorSwatch[]` dengan ID unik/stabil dalam revisi analisis dan hex | Steven, Rico, Nepa |
| `ImageData`, `CvdMode` | `ImageData` baru; ukuran dan alpha sama | Nepa (preview dan gambar uji) |
| Swatch + konfigurasi ambang yang disepakati | `ColorAnalysisResult` (`colors`, `conflicts`, `threshold`) | Steven, Nepa |
| Koordinat klik pada gambar yang diskalakan | Warna sumber yang dipilih; hasil koreksi untuk daftar swatch | Nepa |

Gunakan `CvdMode`, `SimulatedMode`, `ColorSwatch`, `ColorConflict`, dan `ColorAnalysisResult` persis dari shared types Master PRD §8. Konflik memuat `colorAId`, `colorBId`, `mode`, `deltaE`; jangan mengganti ID dengan label atau hex. Jika daftar warna dikoreksi, Nepa memicu analisis ulang dan invalidasi state. Fungsi simulasi harus dapat menerima gambar asli maupun gambar repair; tidak bergantung pada UI atau state global.

## 5. Urutan implementasi yang disarankan

1. Buat helper decode file dan baca RGBA; pertahankan sumber asli. Validasi MIME, decode, dan limit yang disepakati. Uji input invalid.
2. Implementasikan simulasi Machado dengan konversi ruang warna yang sesuai referensi. Mode normal tidak mengubah sumber; grayscale hanya mode tambahan. Simpan transformasi sebagai fungsi yang bisa dipakai ulang.
3. Implementasikan color quantization (Median Cut baseline). Abaikan piksel transparan dalam ekstraksi; warna dominan bukan otomatis kategori semantik. Jangan menghilangkan pilihan manual untuk kategori kecil.
4. Hitung ΔE00 pada swatch hasil simulasi, per pasangan unik dan mode. Gunakan Culori sesuai versi terpasang; uji dengan nilai referensi. Gunakan ambang internal yang disepakati tim, bukan angka universal.
5. Implementasikan color picker dengan konversi koordinat CSS ke piksel sumber dan validasi batas. Recompute konflik bila swatch berubah.
6. Serahkan fixture, output JSON nyata, dan cara memanggil fungsi ke Steven/Rico/Nepa. Integrasikan preview before/after melalui fungsi yang sama.

## 6. Batasan modul (jangan dikerjakan)

- Tidak memahami legenda atau makna warna, membuat pertanyaan AI, menentukan pola, atau memodifikasi gambar repair.
- Tidak membuat UI halaman, state global, API route, OCR, ML segmentation, Web Worker tanpa bukti profiling, atau pemrosesan batch.
- Jangan menyebut ΔE sebagai skor aksesibilitas manusia; temuan tahap ini hanya potensi konflik piksel. Warna dekoratif ditangani saat konfirmasi.

## 7. Testing dan acceptance checklist

| Test | Lulus jika |
|---|---|
| Decode valid/invalid | PNG/JPEG valid berhasil; file rusak atau format salah ditolak. |
| Quantization | Fixture warna datar menghasilkan swatch yang diharapkan; alpha transparan tidak dianggap kategori. |
| Transformasi CVD | Fixture referensi tiap mode sesuai toleransi numerik; normal tidak mengubah data, alpha/dimensi tetap. |
| ΔE00 | Pasangan Lab referensi sesuai toleransi; warna identik mendekati nol. |
| Konflik | Pasangan tidak duplikat per mode, ID valid, hasil stabil pada input/config sama. |
| Picker | Klik pada tampilan diskalakan memilih piksel sumber yang tepat; luar batas ditangani. |
| Immutability | Analisis, preview dan simulasi tidak memodifikasi sumber. |

Gunakan fixture buatan tim dengan ground truth yang dicatat. Tidak perlu mengejar akurasi 100% pada seluruh variasi gambar. Catat hasil nyata dan keterbatasan. Mock test bukan bukti keberhasilan produksi.

## 8. Handoff dan dependency lintas anggota

- Steven menerima `ColorAnalysisResult` dan contoh JSON berisi swatch serta konflik dengan ID konsisten.
- Rico menerima sumber asli, swatch dan informasi limit; warna yang perlu dimask berasal dari mapping terkonfirmasi, bukan semua swatch.
- Nepa menerima helper decode/picker, fungsi simulasi reusable, dan cara menampilkan hasil konflik. Nepa bertanggung jawab atas lifecycle object URL dan invalidasi UI.
- Parameter terbuka: ambang ΔE, jumlah swatch maksimum, limit ukuran gambar, toleransi fixture simulasi. Jangan menentukannya sebagai kontrak final sendiri.

## 9. Definition of Done

Decode dan analisis menghasilkan data nyata, semua mode dan picker lolos fixture, hasil konflik dapat dipakai oleh Steven, fungsi simulasi dapat dipakai Nepa untuk before/after dan Uji Terbaca, serta unit test relevan lulus.

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

## 11. Template prompt untuk AI agent Icul

```text
Baca PRD.md dan docs/PRD-01-Icul.md secara menyeluruh.
Baca AGENTS.md jika tersedia, shared types, dan kode relevan.
Kamu bekerja hanya sebagai coding agent modul 1 — Image Processing & Color Analysis (owner Icul).
Task: [satu kebutuhan spesifik]
FR: [ID requirement]
Acceptance criteria: [kriteria relevan]
Area kode: [file/direktori yang diizinkan]
Gunakan implementasi terkecil yang memenuhi task. Jangan keluar scope, menambah dependency,
atau mengubah kontrak/modul lain tanpa persetujuan. Jangan mengerjakan P1, menggunakan any,
atau membuat mock sebagai hasil produksi. Tambahkan test relevan dan jalankan pemeriksaan.
Laporkan perubahan, file, hasil test dan blocker. Jangan commit/push/merge/deploy tanpa izin.
```

**Contoh task:** Implementasikan FR-03 menggunakan swatch dan fungsi simulasi yang sudah ada. Jangan membuat UI, API, atau repair engine.
