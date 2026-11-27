# Modul 2 — semantic analysis dan verification (final handoff)

Owner: Steven. POST /api/analyze (Phase 3), POST /api/verify action=prepare (Phase 4), serta
action=evaluate dengan deterministic scoring (Phase 5) sudah lolos live acceptance CosmosIn
pada fixture sintetis. Shared types: src/types/index.ts. Integrasi frontend belum dikerjakan.

**Phase 6: MODULE 2 READY FOR INTEGRATION.**
[Handoff final, traceability matrix dan gap owner](../../../docs/Module-2-Handoff.md).
Full API flow aktual: 6 HTTP request / 10 call CosmosIn, empat mode, mapping/kunci direview tanpa
koreksi, repair Rico aktual dijalankan read-only di browser. Icul masih scaffold sehingga simulasi
memakai QA fixture, bukan integrasi Icul. Tidak ada klaim FULL APPLICATION E2E PASS.
Typecheck/lint/build PASS; 438 test mock PASS. E2E dijalankan tetapi No tests found.
Budget Phase 6 10/16 call, usage 13.294 prompt + 711 completion = 14.005 token, tanpa timeout/retry.
Lihat [flow aktual](../../../docs/Module-2-Phase-6-flow.json) dan
[contoh Accessibility Report](../../../docs/Module-2-Accessibility-Report-Example.json).

## Konfigurasi yang terbukti bekerja

- CosmosIn https://api.cosmosin.io/v1, deepseek-v4.1-flash, SDK openai Chat Completions.
- Env server: COSMOS_API_KEY, COSMOS_BASE_URL, COSMOS_MODEL. Tidak boleh NEXT_PUBLIC.
- Non-streaming, timeout 45000 ms, maxRetries=0, **max_tokens=2048**.
- response_format json_schema strict=true dari zodResponseFormat; satu panggilan per analyze.
- max_completion_tokens=16 terbukti menghasilkan 298 token; max_tokens=16 berhenti tepat pada 16.
- Tidak ada fallback, retry otomatis, parser permisif, AI tambahan, atau cache hasil.

## Root cause dan request final

Respons naratif membuat JSON.parse gagal. Request system-only mereproduksi non-JSON lewat SDK
dan direct HTTP meski response_format strict dikirim. Tanpa context juga gagal; kontrol text-only
dengan tugas system juga gagal. Penerapan instruksi system/strict output pada konfigurasi provider
ini tidak dapat diandalkan. Audit tidak dapat melihat implementasi internal gateway/upstream.

Request final mempertahankan system dan mengulang tugas lengkap + schema pada text part user
yang membawa gambar, mengikuti POC. Metadata analysis/context berada di text part terpisah,
image_url base64 di bagian terakhir. subject/grade hanya metadata interpretasi; gambar dan semua
metadata adalah data tidak tepercaya. Output diminta tepat satu objek JSON, tanpa Markdown,
fence, teks pembuka/penutup, soal, latihan, atau pembahasan pelajaran.

Schema prompt berasal dari helper yang sama dan diuji identik dengan schema response_format.
Wire required-nullable: suggestedPattern wajib, boleh null; semua object tertutup.
Respons wajib lolos JSON.parse, Zod wire, normalisasi suggestedPattern null (field dihapus),
Zod publik, colorId, duplikasi dan order. Narasi tidak diubah menjadi mapping secara spekulatif.
Empty/refusal/finish_reason selain stop termasuk output terpotong tetap ditolak.

Bukti dan batas kesimpulan:
[laporan audit](../../../docs/CosmosIn-Phase-3-Live-Audit.md),
[ledger eksperimen](../../../docs/CosmosIn-live-results.json).

## HTTP dan fondasi validasi

POST /api/analyze menerima multipart: image PNG/JPEG normal, analysis JSON ColorAnalysisResult,
context JSON subject/grade opsional. HTTP 200 mengembalikan SemanticAnalysis langsung.
Jangan set Content-Type multipart sendiri pada fetch browser. Request.signal diteruskan ke SDK.

Batas: 1572864 byte per gambar, 3670016 byte body aktual, 65536 byte metadata agregat UTF-8.
Pembaca membatasi stream sebelum parsing, bukan hanya Content-Length. Field asing/duplikat,
file salah, MIME/signature, metadata dan referensi input invalid ditolak.
Server tidak melakukan decode/dimensi; client menyiapkan salinan AI dengan legenda terbaca.

Kode CONTRACTS: INVALID_INPUT 400, PAYLOAD_TOO_LARGE 413, UNSUPPORTED_MEDIA_TYPE 415,
INSUFFICIENT_EVIDENCE 422, RATE_LIMITED 429, AI_PROVIDER_ERROR/AI_INVALID_RESPONSE 502,
AI_TIMEOUT 504, INTERNAL_ERROR 500. Error: { error: { code, message } }.
Key/header/prompt/raw response/stack tidak dikirim ke frontend.

## PRD v1.1

Analyze boleh mendeteksi >4 kategori; swatch/kategori tidak dipotong. Jika included >4, server
menambahkan warning bahwa repair MVP hanya mendukung satu visual dengan 1–4 kategori.
Prompt juga meminta warning multi-visual, tetapi server tidak memiliki segmenter untuk membuktikan
jumlah visual. Guru/UI tetap memeriksa batas tersebut sebelum repair.

confirmedMappingSchema mensyaratkan **1–4 included**; excluded tidak dihitung. ID harus unik,
label included diketahui; categorical order null dan ordinal included integer unik.
parseVerifyRequest menolak prepare dengan >4 included sebagai INVALID_INPUT sebelum network.
Ini validasi Phase 2, bukan implementasi prepare atau route verify.

verification/schemas.ts menyediakan wire preparation/answering serta validator publik;
prepare.ts menghasilkan pertanyaan/kunci, evaluate.ts memanggil dua penjawab terpisah dan
scoring.ts membandingkan jawaban secara lokal.
ConfirmedMapping/AnalysisContext/ApiErrorResponse masih schema internal; shared types dan kontrak
HTTP tidak diubah. Prepare hanya action/image/mapping; evaluate action/before/after/mode/questions.

## Diagnostik aman

diagnostics.ts server-only, hanya NODE_ENV=development dan hanya pada kegagalan:
stage, finish reason standar, HTTP status, token usage numerik, Zod issue code/path aman serta
bentuk content (panjang/fence/BOM/delimiter/posisi syntax jika tersedia). Posisi memakai UTF-16.
Stage: empty_response, refusal, finish_reason, invalid_json, wire_schema, public_schema,
color_id_reference. Nilai input, pesan parser/provider dan field dinamis tidak dicatat.
Hook capture raw response sementara sudah dihapus dari production setelah diagnosis.

## Pengujian dan audit live eksplisit

Automated tests memakai mock. Jalankan npm.cmd run typecheck, npm.cmd run lint, npm.cmd test,
npm.cmd run build, npm.cmd run test:e2e. Status akhir pada laporan audit; E2E masih kosong.

scripts/cosmos.live.ts tidak cocok pola default *.test.ts. Runner live hanya berjalan dengan config
eksplisit dan COSMOS_LIVE_APPROVED=1. Ledger persisten mencatat 28 slot, termasuk satu blocked;
jangan mereset budget tanpa izin baru. Perintah berikut hanya untuk audit baru yang sudah diizinkan:

```powershell
$env:COSMOS_LIVE_APPROVED = '1'
$env:LIVE_VARIANT = 'production'
node --env-file=.env.local node_modules/vitest/vitest.mjs run --config scripts/cosmos-live.config.mts
```

Variant endpoint memakai server port 3103 dan observer usage yang hanya mencatat requestId,
status/usage/finishReason, tanpa payload/key/content:

```powershell
$env:NODE_OPTIONS = '--import ./scripts/observe-cosmos.mjs'
npm.cmd run dev -- --port 3103
```

Di terminal kedua pilih LIVE_VARIANT=endpoint dan LIVE_FIXTURE=semantic-two/semantic-four/
semantic-five/semantic-ordinal sebelum menjalankan runner. Ground truth hanya diperiksa sesudah
respons, tidak masuk prompt. Observer hanya untuk proses audit, bukan konfigurasi aplikasi.
Fixture PNG/SVG/metadata dibuat oleh scripts/create-semantic-fixtures.mts menggunakan sharp
yang sudah terpasang melalui Next; tidak ada dependency tambahan. Konflik fixture kosong bukan
hasil perhitungan Modul 1 dan tidak membuktikan aksesibilitas.

## Keterbatasan

Schema valid tidak membuktikan label benar: satu smoke awal membaca Sawo sebagai Sawu.
Fixture final lulus, tetapi gambar/provider lain belum dijamin. Guru tetap wajib review.
Instruksi bukan jaminan kebal prompt injection. Pola hanya usulan, bukan jaminan hasil repair.
Integrasi UI/E2E belum dibuktikan. Backend evaluate empat mode diuji pada Phase 5 di bawah.

## POST /api/verify — prepare (Phase 4)

Request multipart persis: action=prepare, image binary PNG/JPEG normal, mapping JSON string
ConfirmedMapping. Tidak menerima analysis, context, mode atau field lain. Parser http.ts existing
memeriksa limit gambar/body/metadata dan mapping 1–4 included sebelum network. Excluded tidak
dihitung, label/ID/order tetap divalidasi. Server tidak memiliki swatch/session analyze sebelumnya.

```ts
const form = new FormData();
form.append('action', 'prepare');
form.append('image', aiImage, 'source.png');
form.append('mapping', JSON.stringify(confirmedMapping));
const response = await fetch('/api/verify', { method: 'POST', body: form });
const value: unknown = await response.json();
// Periksa response.ok dan schema; jangan set Content-Type multipart sendiri.
```

HTTP 200: VerificationQuestion[] langsung (2–3 item), tanpa wrapper. Contoh output live aktual
pada pengulangan final fixture bar dua kategori:

```json
[
  {"id":"q1","question":"Batang mana yang mewakili kategori Jeruk?","expectedAnswer":"B"},
  {"id":"q2","question":"Kategori apa yang diwakili batang A?","expectedAnswer":"Apel"}
]
```

Wire internal berbentuk object {status, questions}, semua field required dan object tertutup.
Item wire hanya question/expectedAnswer, tanpa ID. Status ok memerlukan 2–3 pertanyaan nonkosong
dan unik setelah trim/normalisasi whitespace/kapitalisasi. Status insufficient_evidence memerlukan
questions kosong dan dipetakan ke HTTP 422 INSUFFICIENT_EVIDENCE. Status/list tidak konsisten,
JSON/narasi/schema invalid tetap HTTP 502 AI_INVALID_RESPONSE, bukan 422.
Server membuat q1/q2/q3 berdasarkan urutan, memangkas whitespace tepi, lalu memvalidasi array
publik dengan verificationQuestionsSchema existing. ID stabil dalam satu set; bukan identitas
pertanyaan lintas panggilan. Set baru dapat berbeda redaksi/urutan.

Prompt meminta bahasa Indonesia, kunci pendek berbasis gambar dan hubungan kategori/legenda
included. Setiap item harus memakai kategori pada pertanyaan atau jawaban. Pertanyaan judul,
jumlah batang, tinggi kode A/B tanpa kategori, pengetahuan luar, aritmetika hipotetis, dan
pembahasan dilarang. Jangan menebak lokasi/warna/prioritas konflik dari colorId tanpa hex.
Jika tidak ada minimal dua pertanyaan yang dapat dibuktikan dari gambar, model diminta jujur
insufficient_evidence; mapping sendiri tidak membuktikan bahwa informasi tersebut ada di gambar.

Instruksi lengkap + schema dikirim pada text part multimodal user, mapping pada text part data
terpisah dan gambar pada image_url terakhir, dengan instruksi system pendamping. Schema prompt
identik dengan response_format SDK strict. Semua tulisan gambar/mapping tidak dipercaya sebagai
instruksi. Memakai cosmos.ts existing: max_tokens=2048, timeout 45 detik, non-stream, retry=0,
tepat satu call per prepare yang lolos input. Tidak ada AI validation/repair/grading tambahan.

Evaluate kini tersedia pada Phase 5; perilaku sementara INTERNAL_ERROR untuk evaluate pada
Phase 4 sudah diganti implementasi nyata. Kontrak dan handoff tersedia pada bagian berikutnya.

### Live acceptance dan pemeriksaan

Pada 28 November 2026: prompt final lulus kelima eksekusi endpoint — bar dua kategori, bar empat
kategori, peta ordinal, insufficient evidence (422), serta pengulangan bar dua kategori.
Kunci diperiksa terhadap ground truth gambar, bukan hanya status/schema. Percobaan awal #5 sempat
menghasilkan satu pertanyaan tinggi batang tanpa relasi kategori; hasil itu ditolak pada review
relevansi dan prompt diperketat sebelum lima acceptance final. Kegagalan awal tetap dicatat.

Phase 4 memakai budget baru **10/10 call**, masing-masing satu call provider per request.
Total usage: **13.783 prompt + 667 completion = 14.450 token**.
Typecheck PASS, lint PASS, **362 test mock PASS (11 file)**, build PASS. E2E dijalankan tetapi
No tests found. [Laporan lengkap](../../../docs/CosmosIn-Phase-4-Live-Acceptance.md),
[ledger](../../../docs/CosmosIn-Phase-4-live-results.json).

Runner live terpisah scripts/prepare.live.ts + scripts/prepare-live.config.mts, flag eksplisit
COSMOS_PREPARE_LIVE_APPROVED=1, server port 3104, PREPARE_FIXTURE memilih fixture yang diizinkan.
Observer manual memakai COSMOS_AUDIT_USAGE_FILE=docs/CosmosIn-Phase-4-usage.jsonl agar ledger
Phase 3 tetap terpisah. Budget sudah habis; runner menolak call berikutnya. Jangan mereset ledger
atau menjalankan paid request lanjutan tanpa izin baru. Automated npm test tidak memanggil API.
Server audit sudah dihentikan, tanpa penyimpanan gambar/prompt/secret pada aplikasi.

### Handoff kepada Nepa

- Kirim gambar sumber normal yang terbaca beserta mapping hasil review guru. Pastikan referensi
  colorId terhadap swatch aktif dan hanya satu visual; server prepare tidak memiliki daftar hex.
- Tampilkan set pertanyaan/kunci untuk ditinjau dan dikoreksi guru. Validasi runtime tidak dapat
  membuktikan makna pertanyaan, bahasa, atau grounding seluruh gambar. Prompt bukan jaminan
  semantik atau perlindungan prompt injection sempurna.
- Simpan set yang sudah ditinjau pada revisi sesi aktif untuk dipakai identik di empat mode nanti.
  Perubahan sumber/mapping membatalkan set lama; request prepare baru boleh menghasilkan set berbeda.
- Tangani 422 sebagai belum ada pertanyaan yang dapat dipercaya; jangan membuat kunci dummy.
  Error prepare tidak menghapus gambar atau repair valid dan tidak mengunci download.
- Evaluate Phase 5 memisahkan kunci/mapping dari prompt penjawab before/after; lihat handoff
  di bawah sebelum mengorkestrasi empat mode dari frontend.

## POST /api/verify — evaluate (Phase 5)

Multipart persis: action=evaluate, before, after (binary PNG/JPEG hasil simulasi), mode
protan/deutan/tritan/grayscale, questions JSON VerificationQuestion[] yang sudah ditinjau guru.
Tidak menerima normal, mapping, analysis, context, originalImage atau sessionId. Parser/limit
existing tetap: 1.5 MiB/file, 3.5 MiB body aktual, 64 KiB metadata dan 2–3 pertanyaan unik.

```ts
const form = new FormData();
form.append('action', 'evaluate');
form.append('before', beforeSimulation, 'before.png');
form.append('after', afterSimulation, 'after.png');
form.append('mode', mode);
form.append('questions', JSON.stringify(reviewedQuestions));
const response = await fetch('/api/verify', { method: 'POST', body: form, signal });
const value: unknown = await response.json();
// Periksa response.ok/schema. Jangan set Content-Type sendiri.
```

HTTP 200 adalah VerificationResult langsung: mode, items seluruh pertanyaan dengan question,
before {answer,status}, after {answer,status}, warnings. Tidak ada score/percentage/wrapper baru.
Contoh lengkap hasil nyata tersedia pada [laporan Phase 5](../../../docs/CosmosIn-Phase-5-Live-Acceptance.md).

### Blind calls dan validasi

evaluate.ts membentuk DTO eksplisit dengan menyalin id/question saja. Kedua call memakai
instruksi, schema dan konfigurasi yang sama, masing-masing hanya satu gambar. Tidak mengirim
expectedAnswer, mode/label before-after, gambar pasangan/sumber normal, mapping, semantic analysis,
hasil call sebelumnya atau chat history. Penjawab diminta membaca gambar/legenda/penanda yang ada,
memberi jawaban singkat (satuan dipertahankan) atau null bila ambigu, tanpa menebak/menilai/membahas.
Pertanyaan dan teks gambar tetap data tidak tepercaya. Tugas/schema ada pada text part user.

Wire strict object {answers:[{id,answer}]}; semua field wajib, answer nonkosong atau null.
Runtime Zod memeriksa jumlah tepat, ID dari request, ID unik dan tidak ada ID hilang/asing.
Model boleh mengurutkan ulang; server memakai Map berdasarkan ID dan mengembalikan urutan request.
JSON/schema/reference invalid menjadi AI_INVALID_RESPONSE, bukan uncertain.

Dua call berjalan paralel, max_tokens=2048/call, timeout existing 45 detik/call, retry=0,
non-streaming, CosmosIn deepseek-v4.1-flash. Request.signal diteruskan; jika salah satu gagal,
sibling yang masih aktif dibatalkan. Error publik dikembalikan tanpa hasil parsial/kunci palsu.
Sukses selalu tepat dua call; tidak ada AI judge, JSON repair atau penyimpanan server.

### Deterministic scoring

scoreAnswer mempertahankan answer asli. Comparison saja memakai Unicode NFC, trim, collapse
whitespace dan lowercase id-ID. Null → uncertain; exact match setelah normalisasi → correct;
selain itu → incorrect. Tidak menghapus angka, tanda negatif, satuan, desimal atau operator.
Contoh 40 kg vs 40 g tetap incorrect; -40 vs 40 incorrect; B vs Batang B juga incorrect.
Tidak ada fuzzy/embedding/AI matching. Sinonim/format ekuivalen tetap dapat gagal exact match.

Frontend menghitung dari status item, misalnya:

```ts
const total = result.items.length;
const correctBefore = result.items.filter(item => item.before.status === 'correct').length;
const correctAfter = result.items.filter(item => item.after.status === 'correct').length;
```

Uncertain bukan correct. Provider error bukan skor nol atau uncertain; mode tersebut berstatus
error dan hasil sukses mode lain tetap disimpan. Jangan memaksakan correctAfter > correctBefore.

### Live acceptance dan batas bukti

Pada 28 November 2026, tujuh evaluate sukses melalui endpoint asli: empat mode dengan satu set
pertanyaan dua kategori, empat kategori grayscale, peta ordinal grayscale, dan pengulangan Deutan.
Semua schema/ID/scoring/audit blind lolos. Protan/grayscale dua kategori: 0/2 correct + 2 uncertain
menjadi 2/2 correct. Deutan/tritan: 2/2 → 2/2. Empat kategori grayscale: 0/3 + 3 uncertain → 3/3.
Ordinal grayscale: 3/3 → 3/3. Pengulangan Deutan: 2/2 → 2/2. Hasil sama tetap dilaporkan apa adanya.

Ada satu percobaan awal HTTP 504 AI_TIMEOUT tanpa respons/usage provider yang tercatat.
Penyebab transport spesifik tidak terbukti; GET katalog berhasil dan setelah restart request lain
berhasil tanpa perubahan client/model/timeout. Dua slot awal tetap dihitung konservatif.
Budget Phase 5: 16/20 slot (14 call terkonfirmasi + 2 percobaan timeout dengan delivery/billing
tidak diketahui). Usage teramati pada 14 call: 17.198 prompt + 405 completion = 17.603 token;
usage timeout awal tidak tersedia. Ledger [hasil](../../../docs/CosmosIn-Phase-5-live-results.json).

Icul masih scaffold .gitkeep saat audit. Fixture khusus QA dibuat offline oleh
scripts/create-evaluate-fixtures.mts: SVG normal dan overlay pola konsisten pada kategori/legenda,
rasterisasi sharp existing, decode sRGB ke linear RGB, matriks deficiency severity=1 dari helper
Culori, encode kembali ke sRGB dan clamp. Grayscale memakai luminance linear Rec.709.
Ini fixture simulasi, bukan bukti integrasi atau validasi engine Icul/Rico/klinis. Tidak ada
image processing baru pada route production. Metode dan batasnya dijelaskan di laporan.

Typecheck/lint/build PASS; 437 test mock PASS (13 file). Seluruh regression Phase 1–4 tetap;
assertion sementara evaluate belum tersedia diperbarui ke perilaku baru. E2E dijalankan tetapi
No tests found. Server audit port 3105 dihentikan, tanpa commit/push/deploy atau Phase 6.
Runner scripts/evaluate.live.ts memakai config/flag eksplisit dan ledger terpisah; npm test
tidak menggunakan API berbayar. Tidak mengulang live tanpa kebutuhan/izin dalam budget yang berlaku.

### Handoff empat mode kepada Nepa

- Prepare satu set dari sumber normal/mapping, tampilkan review/koreksi guru, lalu reuse set yang
  sama persis di protan/deutan/tritan/grayscale. Jangan prepare ulang untuk setiap mode.
- Buat pasangan before/after dari sumber/repair yang benar pada mode dan skala identik. Server
  memeriksa metadata, bukan membuktikan mode/versi dari piksel. Simulasi tetap milik Icul/Nepa.
- Kirim satu evaluate per mode, disarankan berurutan untuk membatasi concurrency. Backend sendiri
  memakai dua call paralel per evaluate. Simpan status pending/running/success/error serta hasil
  per mode. Tidak ada endpoint batch atau state frontend yang dibuat dalam Phase 5.
- Retry eksplisit hanya mode gagal. Pertahankan hasil sukses mode lain dan input/repair valid.
  Gunakan AbortController dan pemeriksaan revisi agar hasil request lama tidak menimpa sesi baru.
- Perubahan source, mapping, pattern atau set/kunci membatalkan hasil evaluate yang tergantung
  padanya. Perubahan pattern membatalkan evaluate, bukan otomatis mengubah kunci sumber.
- Download PNG repair normal tetap independen dari evaluasi: skipped/error tidak mengunci download
  dan tidak boleh diberi status lulus palsu. Uji AI bukan persepsi siswa atau skor aksesibilitas klinis.
