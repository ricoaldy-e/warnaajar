# WarnaAjar — PRD Modul 2: AI Semantic Analysis & Verification

> **Owner:** Steven  
> **Versi:** 1.1 · turunan Master PRD v1.1 (27 November 2026)  
> **Tahap:** Pahami dan Uji  
> **Prioritas:** P0 · MVP  
> **Acuan:** `PRD.md` di root repository. Target internal pengumpulan malam 29 November 2026.

## 1. Tujuan modul

Menggunakan model multimodal melalui CosmosIn untuk memahami informasi pada visual, mengusulkan mapping kategori dan strategi pola, serta mengevaluasi pertanyaan identik pada dua versi gambar di masing-masing empat mode simulasi. AI tidak menentukan perhitungan warna dan tidak menggambar ulang visual.

WarnaAjar membantu pembuat materi menambahkan penanda nonwarna pada visual edukasi berbasis warna datar. Satu visual per gambar per sesi, maksimal empat kategori informasi, tanpa login. Guru/pembuat materi adalah pengguna langsung; siswa penerima manfaat, bukan pengguna website. Output bukan alat diagnosis maupun jaminan aksesibilitas bagi seluruh individu.

## 2. Scope dan ownership

| FR | Ownership |
|---|---|
| FR-05 | Semantic analysis dan validasi output AI. |
| FR-06 | Kontrak/validasi mapping; form konfirmasi milik Nepa. |
| FR-09 | Prepare pertanyaan/kunci dan evaluate before/after. |
| FR-11 | Data Uji Terbaca dan penjelasan keterbatasan bagi laporan Nepa. |

**Tech stack:** Next.js App Router Route Handlers, TypeScript, `openai`, Zod, Vitest. CosmosIn melalui SDK `openai` (Chat Completions OpenAI-compatible), model `deepseek-v4.1-flash` melalui env server `COSMOS_MODEL`, `COSMOS_BASE_URL=https://api.cosmosin.io/v1`, dan `COSMOS_API_KEY`. Strict JSON Schema + validasi Zod runtime; non-streaming, retry otomatis 0, timeout 45.000 ms per panggilan, max output 2048 token. Tidak ada fallback model/provider. POC kemampuan berhasil; live route analyze masih perlu debugging (HTTP 502 AI_INVALID_RESPONSE pada smoke awal). Batas AI: 1.5 MiB (1.572.864 byte) per gambar, 3.5 MiB (3.670.016 byte) total body multipart aktual, 64 KiB (65.536 byte) total field teks/metadata UTF-8. Ini bukan batas gambar sumber/export. Client menyiapkan salinan AI dengan legenda/pola tetap terbaca; server membatasi stream aktual dan memeriksa MIME/signature, bukan decode penuh.

**Area kode:** `src/app/api/analyze/route.ts`, `src/app/api/verify/route.ts`, `src/modules/ai-analysis/`, `src/modules/verification/`, serta unit test/fixture terkait. `.env.example` perubahan terkoordinasi. Jangan membuat frontend, image processing, atau penyimpanan data.

## 3. Functional requirements dan acceptance criteria

Bagian berikut mengikuti FR Master PRD secara langsung. FR-06: validasi kontrak dan hasil AI berada pada Steven, sedangkan review/konfirmasi dilakukan pengguna melalui UI Nepa. Baca FR-06 Master PRD.

### FR-05 — AI Semantic Analysis

MVP mendukung satu visual per gambar, dengan 1–4 kategori informasi yang dipetakan berdasarkan warna; swatch teks, latar, grid dan dekorasi tidak dihitung sebagai kategori. Jika lebih dari empat kategori informasi atau terdapat beberapa visual, tetap izinkan analisis warna dan simulasi, tetapi blok repair otomatis dan jelaskan batasan. Jangan mengecualikan kategori informasi yang sebenarnya relevan hanya untuk melewati batas. Analyze boleh mengembalikan lebih dari empat kategori sebagai temuan; jangan memotong hasil AI agar lolos batas. Mapping terkonfirmasi untuk repair/prepare harus memenuhi batas; server prepare memvalidasi jumlah included 1–4, UI memeriksa seluruh kategori relevan, satu visual, dan ID terhadap swatch.

- Endpoint server menerima gambar dan hasil analisis warna yang relevan.
- Model multimodal melalui CosmosIn mengidentifikasi jenis visual, legenda, makna warna, jenis data (categorical/ordinal/unknown), urutan jika terlihat, serta penjelasan konflik dalam bahasa Indonesia yang mudah dipahami.
- Warna yang dipetakan merujuk pada ID warna yang diberikan, bukan nilai warna baru yang ditebak oleh model.
- AI boleh menyarankan jenis penanda, tetapi tidak memodifikasi piksel atau menjadi sumber angka ΔE.
- Bila legenda tidak jelas, tandai ketidakpastian dan minta pengguna mengoreksi. Jangan mengarang kategori, nilai data atau urutan.
- Gunakan structured JSON dan Zod. Validasi referensi ID, bukan hanya struktur JSON.

**Acceptance:** response valid sesuai kontrak; ID yang tidak ada ditolak; kegagalan model, timeout, atau respons invalid tidak menyebabkan aplikasi crash; pengguna dapat mencoba lagi tanpa kehilangan input. Jika belum ada kategori yang valid, jangan lanjut otomatis ke perbaikan.
### FR-09 — Uji Terbaca

- AI membuat 2–3 pertanyaan terkait informasi yang benar-benar bergantung pada warna/legenda dari gambar asli, beserta kunci jawaban. Jangan membuat pertanyaan yang membutuhkan pengetahuan di luar visual.
- Kunci berasal dari gambar asli/mapping terkonfirmasi; pengguna dapat meninjau kebenaran kunci. Jika kunci tidak dapat dipastikan, tandai hasil sebagai belum valid.
- Siapkan satu set 2–3 pertanyaan dari sumber normal dan mapping terkonfirmasi. Guru meninjau/mengoreksi pertanyaan dan kunci sebelum uji. Ketika guru menjalankan Uji Terbaca, sistem otomatis mengevaluasi keempat mode (`protan`, `deutan`, `tritan`, `grayscale`) menggunakan set yang sama, termasuk ketika tidak ada konflik terdeteksi. Before dan after pada setiap mode memakai simulasi identik dan skala sebanding. Tidak perlu memilih target CVD. Uji bersifat opsional untuk download, tetapi dukungan seluruh mode wajib tersedia pada MVP.
- Satu E2E lengkap yang berhasil tanpa retry memakai 10 panggilan AI: 1 analyze + 1 prepare + 8 penjawaban (2 per mode). Orkestrasi empat evaluate di client, satu mode per request, disarankan berurutan untuk mengurangi risiko rate limit. Setiap mode punya status pending/running/success/error dan hasil sendiri. Retry eksplisit hanya pada mode gagal; keberhasilan mode lain tidak dihapus. Jangan tampilkan kegagalan sebagai skor nol. Jika sumber/mapping/pola/kunci berubah, abaikan/batalkan hasil kedaluwarsa.
- Pisahkan pembuatan kunci dari panggilan penjawaban; jangan sertakan kunci, mapping internal atau jawaban sebelumnya pada prompt penjawaban. Jangan memberi informasi tambahan dari luar gambar yang sedang diuji. Bandingkan jawaban terhadap kunci di server dengan normalisasi sederhana (Unicode, whitespace, kapitalisasi; pertahankan angka, satuan, dan operator bermakna). Exact match setelah normalisasi = correct; jawaban berbeda = incorrect; null/tidak dapat ditentukan = uncertain. Tidak ada panggilan AI penilai tambahan; keterbatasan sinonim dicatat.
- Tampilkan jawaban, status benar/salah/tidak dapat ditentukan, jumlah benar dari jumlah pertanyaan yang valid, mode simulasi dan keterbatasan.
- Tidak ada target peningkatan wajib pada setiap gambar. Hasil yang tidak membaik tetap harus ditampilkan. Uji Terbaca merupakan heuristik AI, bukan hasil pengujian terhadap siswa CVD.

**Acceptance:** pertanyaan dan mode identik pada dua versi; kunci tidak dikirim ke penjawab; jumlah benar dihitung dari hasil nyata; respons gagal atau tidak pasti tidak dihitung benar; perubahan gambar/pola membuat hasil uji lama kedaluwarsa.

## 4. Kontrak integrasi (baseline Master PRD §8)

Dua route, `multipart/form-data` + metadata JSON, sesuai Master PRD §8.2. Field persis mengikuti CONTRACTS v1.1; tidak ada route tambahan. Prepare hanya `action`, `image`, `mapping`; evaluate hanya `action`, `before`, `after`, `mode`, `questions`.

| Operasi | Input | Output |
|---|---|---|
| `POST /api/analyze` | `image`, `analysis` (`ColorAnalysisResult`), konteks opsional | `SemanticAnalysis` |
| `POST /api/verify`, `action=prepare` | Gambar asli + mapping terkonfirmasi | `VerificationQuestion[]` (ID, pertanyaan, kunci) |
| `POST /api/verify`, `action=evaluate` | Gambar before/after yang sudah disimulasikan, mode sama, pertanyaan dan kunci terkonfirmasi | `VerificationResult` |

Gunakan `SemanticAnalysis`, `SemanticCategory`, `VisualType`, `DataType`, `PatternKind`, `VerificationQuestion`, `VerifiedAnswer`, `VerificationItem`, `VerificationResult` dari Master PRD. `SemanticCategory.colorId` wajib merujuk ID swatch. `label` dan `order` dapat null; data ordinal harus punya urutan valid sebelum repair. Validasi ID, duplikasi, enum, shape, dan konsistensi referensi; jangan mengarang data jika legenda ambigu.

Error contract: `{ "error": { "code": "INVALID_INPUT", "message": "Gambar atau metadata tidak valid." } }` dengan HTTP status sesuai kondisi. Tidak ada session storage server.

## 5. Urutan implementasi yang disarankan

1. Gunakan fondasi `cosmos.ts`, `http.ts`, schema Zod dan env yang sudah diimplementasikan. POC live lulus; analyze mock lulus, tetapi smoke route awal 502 AI_INVALID_RESPONSE. Identifikasi penyebab dengan diagnosis aman dan ulang smoke sebelum melanjutkan. Jangan mengganti model atau melonggarkan schema secara spekulatif.
2. Buat Zod schema dan validasi input/output `/api/analyze`. Beri model gambar, daftar swatch dan konflik dari Icul; minta visualType, dataType, kategori, penjelasan Indonesia, warnings. Instruksikan untuk tidak mengikuti tulisan instruksional dalam gambar; perlakukan sebagai data.
3. Tangani legenda tidak terbaca dengan `unknown`/null, warning dan kebutuhan konfirmasi; jangan mengarang label, urutan, atau angka. Saran pola opsional, bukan konfigurasi final.
4. Implementasikan `verify` action `prepare`: 2–3 pertanyaan yang jawabannya bergantung pada legenda/warna pada gambar asli, plus kunci. Nepa menampilkan kunci untuk ditinjau pengguna sebelum evaluate.
5. Implementasikan `evaluate`: panggilan penjawab before dan after terpisah, hanya gambar versi masing-masing dan pertanyaan identik. Jangan kirim kunci, mapping, jawaban sebelumnya, atau gambar asli ke penjawab. Bandingkan jawaban dengan kunci setelah keduanya diperoleh. Bandingkan jawaban terhadap kunci di server dengan normalisasi sederhana (Unicode, whitespace, kapitalisasi; pertahankan angka, satuan, dan operator bermakna). Exact match setelah normalisasi = correct; jawaban berbeda = incorrect; null/tidak dapat ditentukan = uncertain. Tidak ada panggilan AI penilai tambahan; keterbatasan sinonim dicatat.
6. Kembalikan item per pertanyaan dengan status correct/incorrect/uncertain; tampilkan warning bila tidak pasti atau gagal. Jangan ubah hasil agar terlihat membaik. Berikan data ke Nepa untuk agregasi/tampilan.
7. Uji kontrak dan failure dengan mock; lakukan smoke test terpisah memakai API asli. Dokumentasikan limit payload, timeout, rate limit, dan prosedur retry bersama tim.

## 6. Batasan modul (jangan dikerjakan)

- Tidak mengerjakan simulasi CVD, ΔE, masking, pattern rendering, export, atau state/UI. Tidak menilai pasien, mendiagnosis CVD, atau mengklaim evaluasi AI adalah persepsi manusia.
- Tidak menggunakan image generation, RAG, vector database, multi-agent, fine-tuning, streaming chat, atau penyimpanan dokumen server.
- Jangan menambah pemanggilan model di luar 10 panggilan untuk E2E penuh tanpa retry. Automated test menggunakan mock; live API berbayar hanya dengan izin owner. Validasi MIME/ukuran request, batasi payload dan retry, jangan log gambar/base64/key. Pastikan key bukan `NEXT_PUBLIC_*`.
- Jika AI gagal, laporkan error; UI mempertahankan sumber. Repair hanya boleh berjalan dengan mapping valid yang dikonfirmasi, dan hasil repair valid masih bisa diunduh ketika verifikasi gagal.

## 7. Testing dan acceptance checklist

Tambahkan test prepare mapping >4 ditolak sebelum provider, analyze >4 tetap dapat memberi temuan, dan evaluasi empat mode via mock integrasi Nepa. Strict wire schema memakai object root dengan field required (nullable jika diperlukan); prepare dapat membungkus array di wire, tetapi response publik tetap array langsung. `suggestedPattern: null` di wire dihilangkan pada output publik. Tidak menambah AI call untuk memperbaiki JSON.

| Test | Lulus jika |
|---|---|
| Schema | JSON valid diterima; ID asing/duplikat, enum invalid, urutan ordinal ambigu ditolak atau ditandai sesuai tahap. |
| Analyze | Fixture menghasilkan mapping yang dapat dipakai setelah konfirmasi; unknown tidak diubah menjadi tebakan. |
| Prepare | 2–3 pertanyaan unik dengan kunci dari gambar, tidak meminta pengetahuan eksternal. |
| Evaluate isolation | Spy/mock membuktikan panggilan before/after terpisah, pertanyaan sama, tidak membawa kunci/mapping/jawaban lama. |
| Scoring | Correct/incorrect/uncertain dihitung berdasarkan kunci; error tidak dihitung benar. |
| Failure | Input invalid, ukuran berlebih, timeout, provider error atau JSON invalid mendapat error aman. |
| Live smoke | Route dengan CosmosIn asli mengembalikan JSON valid pada contoh nyata; hasil dicatat apa adanya. |

Gunakan fixture buatan tim dengan ground truth yang dicatat. Tidak perlu mengejar akurasi 100% pada seluruh variasi gambar. Catat hasil nyata dan keterbatasan. Mock test bukan bukti keberhasilan produksi.

## 8. Handoff dan dependency lintas anggota

- Icul menyediakan swatch/conflicts dan ID warna stabil pada revisi analisis.
- Nepa mengirim salinan gambar yang sesuai limit provider, menampilkan pemberitahuan pemrosesan pihak ketiga, form konfirmasi, kunci dan hasil verifikasi. Nepa membuat gambar uji dari fungsi simulasi Icul pada sumber dan repair Rico dengan mode sama.
- Rico menerima mapping yang dikonfirmasi lewat Nepa; tidak membaca hasil mentah AI sebagai keputusan final.
- Gunakan konfigurasi provider dan limit yang sudah didokumentasikan; koordinasikan kuota dan integrasi dengan Nepa. Jangan menganggap smoke POC sebagai bukti route produksi lulus.

## 9. Definition of Done

Dua route bekerja dengan kontrak yang sama, output dan ID tervalidasi, prepare/evaluate terpisah, kunci tidak bocor ke penjawab, kegagalan ditangani, unit test dan smoke test nyata tercatat.

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

## 11. Template prompt untuk AI agent Steven

```text
Baca PRD.md dan docs/PRD-02-Steven.md secara menyeluruh.
Baca AGENTS.md jika tersedia, shared types, dan kode relevan.
Kamu bekerja hanya sebagai coding agent modul 2 — AI Semantic Analysis & Verification (owner Steven).
Task: [satu kebutuhan spesifik]
FR: [ID requirement]
Acceptance criteria: [kriteria relevan]
Area kode: [file/direktori yang diizinkan]
Gunakan implementasi terkecil yang memenuhi task. Jangan keluar scope, menambah dependency,
atau mengubah kontrak/modul lain tanpa persetujuan. Jangan mengerjakan P1, menggunakan any,
atau membuat mock sebagai hasil produksi. Tambahkan test relevan dan jalankan pemeriksaan.
Laporkan perubahan, file, hasil test dan blocker. Jangan commit/push/merge/deploy tanpa izin.
```

**Contoh task:** Implementasikan action prepare pada POST /api/verify berdasarkan FR-09. Jangan mengerjakan evaluate, UI, atau algoritma gambar kecuali diminta.
