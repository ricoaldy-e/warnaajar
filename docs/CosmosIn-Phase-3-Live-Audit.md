# CosmosIn — audit live Phase 3, 27 November 2026

## Hasil

Blocker format output Phase 3 terselesaikan pada konfigurasi dan fixture yang diuji.
POST /api/analyze melalui CosmosIn asli menghasilkan HTTP 200, SemanticAnalysis valid, dan
ground truth final benar untuk 2/4/5 kategori serta ordinal. Fixture dua kategori lulus tiga kali
pada konfigurasi final. Tidak ada pekerjaan Phase 4/5, perubahan shared types/kontrak HTTP,
provider/model baru, retry otomatis atau dependency baru.

Ledger: [CosmosIn-live-results.json](./CosmosIn-live-results.json). Nomor di bawah mengacu ledger.
Runner eksperimen mencatat hasil bahkan saat non-JSON; status PASS Vitest runner hanya berarti
eksperimen selesai, bukan keberhasilan provider. Hasil provider/semantik dinilai dari ledger.

## Audit sumber dan dokumentasi provider

Working tree sudah berisi pekerjaan belum commit sebelum audit: PRD v1.1, PRD anggota,
fondasi Phase 1–3, package/env example. Tidak direset atau ditimpa. Acuan dibaca: AGENTS, PRD,
CONTRACTS, PRD Icul/Steven/Rico/Nepa, POC, source/schema/test ai-analysis/verification dan route.
Modul anggota lain, shared types dan dokumen kontrak tidak diubah oleh audit ini.
Environment lokal dibaca tanpa mencetak nilai key. Context7 tidak tersedia; API SDK/Next/TypeScript
diperiksa melalui source/types/docs terpasang. Sharp transitive Next dipakai hanya membuat fixture,
bukan dependency runtime tambahan atau perubahan engine anggota lain.

Dokumentasi resmi:

- [Chat Completions](https://cosmosin.io/docs/chat-completions): system/user, text/image parts,
  response_format dan kedua nama parameter token disebut didukung.
- [Model DeepSeek V4.1 Flash](https://cosmosin.io/models/deepseek-v4.1-flash): vision dan JSON schema.
- [SDK compatibility](https://cosmosin.io/docs/sdk-compatibility): OpenAI Chat Completions didukung.

GET /v1/models aktual (bukan model call) mengonfirmasi model deepseek-v4.1-flash, input text/image,
capability structured_output, supported_parameters max_tokens dan response_format.
Dokumentasi/capability bukan bukti enforcement; hasil live di bawah lebih membatasi klaim.

## Root cause berdasarkan bukti

1. Penyebab langsung 502: content naratif Markdown gagal JSON.parse. Parsing/Zod tidak rusak;
   output tersebut memang tidak sesuai kontrak. Pembacaan legenda benar tidak berarti output valid.
2. Request lama menaruh seluruh tugas/schema pada system dan hanya analysis/context/image pada
   user. Rekonstruksi ini gagal melalui SDK (#7) dan direct HTTP (#10), keduanya HTTP 200/stop,
   prompt_tokens=549 dan non-JSON meski response_format json_schema strict benar-benar dikirim.
3. Tanpa context (#19) tetap non-JSON; context SMP bukan satu-satunya penyebab. Kontrol text-only
   dengan tugas system (#20) juga non-JSON, 122 prompt token. Maka kegagalan tidak bisa dibatasi
   hanya pada image atau Next.js. Penerapan instruksi system/strict output di jalur provider ini
   tidak dapat diandalkan. Token count konsisten dengan instruksi system tidak terpakai, tetapi
   implementasi internal gateway/upstream tidak dapat diperiksa, sehingga penghilangan pesan
   oleh komponen tertentu tetap inferensi, bukan fakta internal yang dibuktikan.
4. Tugas lengkap + schema pada text part user menghasilkan JSON valid melalui SDK (#6, #8),
   termasuk Color ID unik probe_*_72 yang tidak tercetak di gambar. Metadata tetap terbaca.
   Penggabungan seluruh teks (#9) juga berhasil, tetapi tidak diperlukan untuk solusi final.
5. Masalah parameter terpisah: max_completion_tokens=16 menghasilkan 298 completion token/stop
   (#21); request pembanding max_tokens=16 menghasilkan tepat 16/length (#22). Alias pertama
   tidak diterapkan pada konfigurasi teruji, bertentangan dengan dokumentasi umum provider.

Tidak ada bukti SDK membuang response_format: test mock transport memeriksa body ter-serialize,
dan direct HTTP dengan payload yang sama mengulang kegagalan. Keberhasilan POC strict ketika
prompt sudah eksplisit tidak membuktikan provider menegakkan schema secara independen.

## Eksperimen terkontrol

| Nomor | Request | Hasil aktual |
|---|---|---|
| 1 | POC awal dalam sandbox | Terhalang jaringan; koneksi probe mengonfirmasi EACCES; usage tidak tersedia |
| 2–5 | POC text, vision tanpa format, JSON Object, JSON Schema | 4/4 PASS, HTTP 200, Zod dan ground truth sesuai |
| 6 | Production task/schema pada user text | JSON publik valid; mapping Sawo/Duku/Salak sesuai |
| 7 | Rekonstruksi system-only | Non-JSON, HTTP 200, 549 prompt token |
| 8 | Production + Color ID sintetis unik | JSON publik valid; ID unik dibaca benar |
| 9 | Instruksi/schema/metadata dalam satu text part | JSON publik valid; tidak dipilih karena tidak diperlukan |
| 10 | system-only direct HTTP tanpa SDK | Non-JSON, 549 prompt token; mereproduksi #7 |
| 11 | Endpoint Next.js fixture POC | HTTP 200/schema valid, tetapi Sawo terbaca Sawu: gagal label ground truth |
| 12–15 | Endpoint 2/4/5 kategori dan ordinal setelah instruksi ejaan/cakupan | Semuanya HTTP 200/schema/ground truth valid |
| 16–18 | Tiga pengulangan endpoint dua kategori | Semuanya schema/ground truth valid |
| 19 | system-only tanpa context | Non-JSON, 534 prompt token |
| 20 | system-only text control tanpa gambar | Non-JSON, 122 prompt token |
| 21 | Kontrol max_completion_tokens=16 | 298 completion token, stop |
| 22 | Kontrol max_tokens=16 | 16 completion token, length; output terpotong tidak diterima aplikasi |
| 23–28 | Acceptance konfigurasi FINAL max_tokens=2048 | Enam endpoint request, semuanya HTTP 200/schema/ground truth valid |

Tidak menjalankan seluruh kombinasi secara buta. POC sudah membandingkan tiga mekanisme format;
karena strict dengan instruksi user bekerja, tidak beralih ke JSON Object atau prompt-only.
Image-first/single-user tambahan dan fixture ambigu tidak dijalankan: tidak diperlukan untuk
memilih solusi, dan sisa budget disimpan. Autentikasi/saldo/rate limit tidak menjadi blocker.

## Solusi final

- Tetap CosmosIn/model yang sama dan response_format json_schema strict.
- system berisi instruksi tepercaya; user parts berurutan: tugas lengkap + schema, JSON metadata,
  image_url data URL. Schema prompt berasal dari helper SDK yang sama, tidak ditulis ulang manual.
- Metadata/context/gambar tidak diinterpolasi sebagai instruksi tepercaya. subject/grade bukan
  permintaan soal. Instruksi meminta JSON tunggal dan melarang narasi/soal/fence/pembahasan.
- max_tokens=2048, timeout 45 detik, retry=0, stream=false, satu model call per analyze.
- JSON.parse, wire required-nullable, Zod publik, normalisasi null pattern, enum dan ID tetap utuh.
- Mapping terkonfirmasi 1–4 included; excluded tidak dihitung. Parser prepare menolak >4 sebelum
  network. Analyze >4 tidak dipotong dan menambahkan warning scope deterministik.
- Prompt meminta warning multi-visual dan ejaan legenda yang teliti. Tidak ada segmenter baru;
  jumlah visual tetap perlu review UI/guru.

## Live acceptance final (#23–28)

| Fixture | Bukti semantik | Status |
|---|---|---|
| semantic-two (#23, #27, #28) | Apel/Jeruk, ID swatch_1_72/swatch_2_72, background/text excluded; pola diagonal/dots | 3/3 PASS |
| semantic-four (#24) | Apel/Jeruk/Melon/Anggur, categorical, semua ID sesuai; empat pola enum berbeda | PASS |
| semantic-five (#25) | Kelima label/ID included, Mangga tetap ada, warning batas MVP, tanpa pemotongan | PASS |
| semantic-ordinal (#26) | Rendah/Sedang/Tinggi, ordinal, order 1/2/3; pola horizontal satu keluarga | PASS |

Semua fixture dibuat sendiri, legenda jelas, tanpa data pengguna. Expected labels/order hanya
digunakan pada pembanding lokal setelah respons; tidak dikirim sebagai jawaban di prompt.
Warna/threshold/konflik fixture adalah metadata sintetis, bukan implementasi Modul 1.

## Pemeriksaan otomatis dan file

Pemeriksaan akhir: npm.cmd run typecheck PASS, npm.cmd run lint PASS, npm.cmd test PASS
(10 file / 317 test mock), npm.cmd run build PASS. E2E dijalankan dengan
npm.cmd run test:e2e dan melaporkan No tests found (tests/e2e kosong), sehingga **E2E tidak lulus**.
Proses Playwright yang masih menunggu shutdown dihentikan setelah pesan kegagalan itu.
Build berhasil dan mencantumkan /api/analyze sebagai dynamic route.

Regression mencakup JSON valid, naratif capture sintetis, malformed JSON, schema/enum/ID invalid,
nullable pattern, request schema user-text identik dengan response_format, metadata SMP terpisah,
mapping boundary 1/4/5 included + excluded, analyze >4 tidak dipotong, dan error publik.
Automated suite tidak memanggil provider. scripts/cosmos.live.ts hanya config/flag eksplisit.

File production: src/modules/ai-analysis/analyze.ts, cosmos.ts, schemas.ts.
Test: ai-analysis/__tests__/analyze.test.ts, cosmos.test.ts, http.test.ts, schemas.test.ts;
fixture naratif dan test route dari investigasi sebelumnya tetap dipertahankan.
Dokumentasi: README modul, laporan ini, ledger, catatan POC.
Tool audit: scripts/cosmos-live.config.mts, cosmos.live.ts, observe-cosmos.mjs,
create-semantic-fixtures.mts dan empat set fixture PNG/SVG/JSON.
POC script diperbarui ke max_tokens tanpa mengganti budget.
Hook raw capture poc-debug.ts dan test khususnya dihapus setelah diagnosis; diagnostik aman tetap.

## Budget, cleanup, dan batas kesiapan

27 panggilan model terkonfirmasi dengan usage, 1 percobaan jaringan blocked. Budget dihitung
konservatif 28/30 slot; tidak memakai dua slot terakhir. Total usage teramati:
**35.220 prompt + 9.993 completion = 45.213 token**. Nilai ini berasal dari provider, bukan estimasi.
GET katalog dan request offline capture tidak dihitung model call. Ledger mencatat requestId
(bila tersedia), status dan usage; tidak berisi key/header/prompt/base64/raw narasi pengguna.

Debug capture aplikasi sudah dihapus. Tidak ada raw response sementara baru yang dibuat agent.
File response lama milik pengguna yang dibuka di IDE tidak dihapus. Server audit port 3103 dihentikan;
tidak mengubah .env.local atau mematikan server milik pengguna. Log usage audit dipertahankan
sebagai bukti, tanpa content response.

Phase 3 siap menjadi fondasi task Phase 4 terpisah; Phase 4/5 tidak dikerjakan. Belum berarti
alur produk lengkap siap rilis: UI/integrasi, repair guard multi-visual, verifikasi empat mode dan
E2E masih belum terbukti. Sawo/Sawu pada #11 membuktikan review guru tetap wajib. Tidak ada klaim
provider konsisten untuk seluruh gambar, enforcement strict sempurna, atau kebal prompt injection.
