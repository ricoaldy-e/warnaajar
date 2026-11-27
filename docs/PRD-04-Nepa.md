# WarnaAjar — PRD Modul 4: Frontend, UI/UX & System Integration

> **Owner:** Nepa  
> **Versi:** 1.0 · turunan Master PRD v1.0 (27 November 2026)  
> **Tahap:** Seluruh alur pengguna dan integrasi  
> **Prioritas:** P0 · MVP  
> **Acuan:** `PRD.md` di root repository. Target internal pengumpulan malam 29 November 2026.

## 1. Tujuan modul

Menghubungkan modul Icul, Steven, dan Rico dalam satu pengalaman penggunaan yang mudah, aksesibel, tanpa login. Menyediakan flow upload sampai download, state sesi, laporan yang jujur, error state, E2E dan kesiapan deployment.

WarnaAjar membantu pembuat materi menambahkan penanda nonwarna pada visual edukasi berbasis warna datar. Satu gambar per sesi, tanpa login. Output bukan alat diagnosis maupun jaminan aksesibilitas bagi seluruh individu.

## 2. Scope dan ownership

| FR | Ownership |
|---|---|
| FR-01 | UI upload, drag/drop, paste, contoh, preview; decode milik Icul. |
| FR-04 | Interaksi color picker menggunakan helper Icul. |
| FR-05/06 | Tampilan semantic analysis dan form konfirmasi mapping. |
| FR-08 | UI editor pola, re-render/reset lewat engine Rico. |
| FR-09 | UI review pertanyaan/kunci, pemilihan mode uji, orchestration prepare/evaluate. |
| FR-10/11 | Before/after dan ringkasan aksesibilitas. |
| FR-12/13 | UI download, landing, contoh, panduan. |
| Integrasi | State, error/loading, invalidation, Playwright, build/deploy dengan izin. |

**Tech stack:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, Zustand (session tanpa persist), Playwright, Vitest bila relevan, Vercel.

**Area kode:** `src/app/` untuk halaman/layout (bukan route AI), `src/components/`, `src/stores/`, `public/` untuk contoh buatan tim, `tests/` untuk E2E. Konfigurasi deployment/README terkoordinasi. Jangan menulis ulang core engine anggota lain.

## 3. Functional requirements dan acceptance criteria

Bagian berikut mengikuti FR Master PRD secara langsung. Untuk FR-01/04/05/08/09/12, baca acceptance criteria pada Master PRD dan integrasikan fungsi pemilik modul tanpa menulis ulang engine. FR di bawah adalah ownership utama UI; bukan pengurangan scope integrasi.

### FR-06 — User Confirmation

- Tampilkan swatch, nama kategori, pilihan sertakan/kecualikan dari perbaikan, dan urutan jika data ordinal.
- Guru dapat mengoreksi label dan urutan serta menentukan apakah hasil pemetaan benar.
- Warna dekoratif, latar belakang, teks, dan elemen yang tidak membawa kategori harus dapat dikecualikan.
- Perbaikan hanya berjalan menggunakan pemetaan yang dikonfirmasi; jangan menambahkan pola pada semua warna dominan secara buta.

**Acceptance:** perubahan label/urutan disimpan dalam state sesi dan diteruskan ke engine; mapping ambigu tidak boleh diam-diam diperlakukan benar; data ordinal tanpa urutan yang valid belum dapat diproses sebagai ordinal.
### FR-10 — Before/After Comparison

- Perbandingan visual asli dan perbaikan dengan side-by-side atau slider.
- Sediakan mode Normal/Protan/Deutan/Tritan/Grayscale pada kedua gambar dengan mode yang sama.
- Label jelas mengenai versi gambar dan mode simulasi; akses keyboard tersedia.

**Acceptance:** perbandingan memakai versi sumber dan hasil terbaru dengan mode identik; slider atau tombol dapat digunakan dengan keyboard; perbandingan tidak mengganti gambar sumber.
### FR-11 — Accessibility Report (on-screen)

- Ringkas mode CVD yang memiliki potensi konflik, pasangan warna, jumlah kategori dengan pola, kategori/area yang belum ditangani, serta hasil Uji Terbaca jika tersedia.
- Bedakan konflik warna mentah dari konflik yang **telah diberikan penanda tambahan**. Penambahan pola tidak otomatis menghilangkan kemiripan warna/ΔE.
- Jangan menghasilkan satu skor aksesibilitas absolut yang tidak memiliki definisi; jangan menampilkan angka simulasi sebagai hasil nyata. Status perbaikan hanya berdasarkan kondisi yang benar-benar diperiksa sistem.

**Acceptance:** ringkasan menggunakan data sesi terbaru; jika belum diuji tampilkan status belum diuji, bukan 0 atau 100% palsu; jika tidak ada perubahan warna maka metrik ΔE tidak diklaim meningkat hanya karena pola ditambahkan.
### FR-13 — Landing, Examples & Guide

- Beranda menampilkan penjelasan singkat, contoh sebelum/sesudah, dan CTA Coba Sekarang.
- Contoh gambar buatan tim siap digunakan melalui pipeline asli, bukan jalur hasil palsu.
- Panduan singkat CVD, pola sebagai penanda tambahan, jenis visual yang didukung, dan keterbatasan.

**Acceptance:** pengguna dapat memulai alur utama tanpa akun, memilih contoh dan menyelesaikan pipeline yang sama seperti upload sendiri; klaim dan contoh sesuai batasan produk.

## 4. Kontrak integrasi (baseline Master PRD §8)

### Data flow

`sourceImage → colorAnalysis → semanticAnalysis → confirmedMapping → patterns / repairResult → verificationResult`

| Pemasok | Dipakai UI |
|---|---|
| Icul | Decode, picker, `ColorAnalysisResult`, fungsi simulasi untuk sumber dan repair. |
| Steven | `POST /api/analyze`, `/api/verify` prepare/evaluate; `SemanticAnalysis`, `VerificationQuestion[]`, `VerificationResult`. |
| Rico | Rekomendasi/config pola, `RepairResult`, export PNG. |

Gunakan shared types Master PRD §8 tanpa duplikasi. `multipart/form-data` ke route AI dengan salinan gambar sesuai limit, metadata JSON. Jangan menyimpan base64 permanen. Gunakan URL object/Blob/File sesuai kebutuhan dan lepaskan resource lama.

### Invalidation wajib

| Perubahan | State yang dibatalkan |
|---|---|
| Ganti gambar | Seluruh hasil turunan. |
| Koreksi warna | Konflik dihitung ulang; semantic/mapping, repair dan verification tidak lagi valid. |
| Ubah mapping | Repair dan verification; analisis warna tetap jika swatch sama. |
| Ubah pola | Repair lama dan verification; render ulang dari sumber. |
| Mode preview | Tidak mengubah mapping/repair; hasil uji lama tetap berlabel mode aslinya. |

Abaikan/batalkan respons async lama jika sumber atau revisi berubah. Tidak perlu state machine atau event bus; gunakan state sesi minimal. Jangan menampilkan hasil lama sebagai hasil terbaru.

## 5. Urutan implementasi yang disarankan

1. Buat layout/landing dan flow wizard sederhana: Periksa → Pahami → Perbaiki → Uji & Hasil. Buat contoh buatan tim melalui pipeline asli. Tidak perlu satu route per tahap.
2. Integrasikan upload/drag-drop/paste, validasi/decode Icul, preview mode dan daftar konflik/picker. Tangani perubahan input dan loading/error.
3. Berikan pemberitahuan bahwa gambar untuk AI dikirim ke Gemini melalui server sebelum analisis. Panggil analyze, tampilkan mapping/penjelasan/warning; form konfirmasi label, included, dataType/urutan. Jangan melanjutkan otomatis jika mapping invalid.
4. Hubungkan engine Rico. Tampilkan rekomendasi pola, custom pattern, spacing, reset, warning, before/after. Gunakan mode simulasi yang sama untuk kedua sisi dan hasil repair terbaru.
5. Orkestrasi verify: prepare dari gambar asli dan mapping; tampilkan pertanyaan/kunci untuk ditinjau; hasilkan gambar simulasi before dan after dari Icul pada mode yang sama, panggil evaluate. Mode konflik pilihan atau terberat sebagai default sesuai Master PRD. Jangan mengklaim peningkatan jika tidak ada konflik.
6. Buat laporan: konflik warna mentah, kategori dengan penanda, kategori belum ditangani, status Uji Terbaca beserta jawaban/mode/warning. Bedakan status belum diuji/gagal dari angka nol. Jangan menampilkan skor aksesibilitas absolut.
7. Hubungkan download PNG normal dari Rico. Uji Terbaca gagal tidak menghalangi download repair valid; tampilkan belum diverifikasi.
8. Tambahkan panduan dan aksesibilitas UI, uji E2E, smoke dengan Gemini asli, build dan deployment Vercel jika sudah diizinkan. Jangan memulai P1 sebelum P0 stabil.

## 6. Batasan modul (jangan dikerjakan)

- Tidak membuat dashboard, akun, database, editor umum, LMS, upload PDF otomatis, atau fitur siswa.
- Tidak mengimplementasikan ulang algoritma Icul/Rico atau prompt/route Steven untuk mempercepat demo. Gunakan mock berlabel hanya di dev/test; produksi wajib jalur nyata.
- Jangan mengklaim semua proses lokal karena AI menerima gambar. Jangan mengklaim WCAG compliance menyeluruh tanpa audit; target kontras teks AA (4.5:1 normal; 3:1 besar), keyboard, focus, accessible names dan status nonwarna.
- Jangan deploy atau merge tanpa izin. Jaga public repo bebas key dan data pribadi.

## 7. Testing dan acceptance checklist

| Test | Lulus jika |
|---|---|
| Happy path | Contoh/upload → analisis → konfirmasi → repair → verify → download PNG. |
| Input salah | Format/file rusak ditolak tanpa crash. |
| Revisi | Ganti sumber, koreksi warna/mapping/pola tidak menampilkan hasil turunan lama. |
| Async | Respons lama tidak menimpa sesi yang baru. |
| Error AI | Pesan dan retry, sumber dipertahankan; verify gagal tidak mengunci download valid. |
| Unsupported | Warning jelas, tidak ada status lulus palsu. |
| Aksesibilitas | Keyboard, label, focus, status teks/ikon; mode before/after sama. |
| Deployment | Typecheck/lint/build/E2E lulus; smoke API asli dicatat terpisah dari mock. |

Gunakan fixture buatan tim dengan ground truth yang dicatat. Tidak perlu mengejar akurasi 100% pada seluruh variasi gambar. Catat hasil nyata dan keterbatasan. Mock test bukan bukti keberhasilan produksi.

## 8. Handoff dan dependency lintas anggota

- Koordinasikan detail kontrak, limit gambar, mode uji, dan format payload dengan ketiga pemilik modul sebelum integrasi.
- Gunakan fixture/mock yang mengikuti shared types untuk membangun UI paralel; lepas mock jalur produksi dan catat integrasi sebenarnya.
- Minta Icul fungsi simulasi untuk gambar repair dan picker; minta Steven dua route plus contoh payload; minta Rico fungsi rekomendasi, repair, dan export.
- Semua anggota menyiapkan dokumentasi dan demo untuk modulnya; Nepa bukan pemilik tunggal proposal/video.

## 9. Definition of Done

Alur P0 berjalan dari upload sampai download tanpa akun menggunakan modul asli; state invalidation dan error handling benar, UI aksesibel secara dasar, E2E dan build lulus, smoke AI asli tercatat, deployment dilakukan setelah izin.

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

## 11. Template prompt untuk AI agent Nepa

```text
Baca PRD.md dan docs/PRD-04-Nepa.md secara menyeluruh.
Baca AGENTS.md jika tersedia, shared types, dan kode relevan.
Kamu bekerja hanya sebagai coding agent modul 4 — Frontend, UI/UX & System Integration (owner Nepa).
Task: [satu kebutuhan spesifik]
FR: [ID requirement]
Acceptance criteria: [kriteria relevan]
Area kode: [file/direktori yang diizinkan]
Gunakan implementasi terkecil yang memenuhi task. Jangan keluar scope, menambah dependency,
atau mengubah kontrak/modul lain tanpa persetujuan. Jangan mengerjakan P1, menggunakan any,
atau membuat mock sebagai hasil produksi. Tambahkan test relevan dan jalankan pemeriksaan.
Laporkan perubahan, file, hasil test dan blocker. Jangan commit/push/merge/deploy tanpa izin.
```

**Contoh task:** Implementasikan form konfirmasi kategori FR-06 menggunakan shared types. Jangan membuat endpoint, algoritma warna, pattern engine, atau fitur P1.
