# WarnaAjar — Module 2 handoff

Tanggal audit: 28 November 2026, Asia/Jakarta. Owner: Steven.

**Status: MODULE 2 READY FOR INTEGRATION. FULL APPLICATION E2E belum lulus/tersedia.**
Tidak ada blocker P0 internal Module 2 yang ditemukan dalam audit ini. Modul Icul/UI Nepa belum
tersedia; gap Rico dijelaskan di bawah. Status ini tidak menyatakan seluruh aplikasi siap rilis.

## 1. Ringkasan dan arsitektur

Module 2 menangani semantic analysis, pembuatan pertanyaan/kunci, dua penjawab blind, serta scoring
deterministik. Tidak menggambar ulang gambar, menghitung ΔE, menyimpan sesi, atau membangun UI.

Alur penuh yang telah diuji:

1. Client mengirim gambar normal + ColorAnalysisResult → analyze → SemanticAnalysis.
2. Guru meninjau label/included/dataType/order → confirmed mapping.
3. Repair normal memakai mapping; prepare menerima gambar sumber normal + mapping.
4. Guru meninjau satu set 2–3 pertanyaan/kunci.
5. Client menyiapkan empat pasangan simulasi sumber/repair dan memanggil evaluate satu mode per request.
6. Backend memanggil penjawab independen untuk masing-masing gambar; server membandingkan jawaban
   dengan kunci. Frontend menyimpan/report hasil per mode dan mengunduh repair normal secara terpisah.

Target tanpa retry: **6 HTTP request = 1 analyze + 1 prepare + 4 evaluate = 10 call model**.
Analyze/prepare masing-masing satu call. Evaluate memakai dua call paralel; empat evaluate di
frontend sebaiknya berurutan agar tidak meluncurkan delapan call sekaligus.

Teknologi: Next.js App Router Route Handlers, TypeScript strict, OpenAI SDK menuju CosmosIn,
Zod runtime validation, Vitest mock transport. Shared types hanya dari src/types/index.ts.
Schema publik/utility scoring murni tidak berisi secret; service AI/http/diagnostics bertanda server-only.

## 2. Environment dan konfigurasi

Siapkan env server lokal/deployment melalui mekanisme secret yang biasa dipakai tim:

```dotenv
COSMOS_API_KEY=<isi lokal, jangan commit atau cetak>
COSMOS_BASE_URL=https://api.cosmosin.io/v1
COSMOS_MODEL=deepseek-v4.1-flash
```

Jangan menggunakan NEXT_PUBLIC untuk key. Env divalidasi lazy ketika operasi dipanggil; build/import
tidak membutuhkan panggilan AI. Tidak ada key pada source/response/log aplikasi.

Client tetap Chat Completions, JSON Schema strict, max_tokens=2048, timeout 45000 ms/call,
maxRetries=0, stream=false, SDK logging off. Tidak ada fallback atau AI repair/judge tambahan.
Pakai tugas lengkap + schema pada text part pesan multimodal user; metadata dan gambar tetap
data terpisah. Prompt system-only terbukti bermasalah pada eksperimen sebelumnya.
max_completion_tokens terbukti tidak membatasi output pada konfigurasi teruji; gunakan max_tokens.
Lihat laporan Phase 3 untuk bukti dan batas kesimpulan gateway/provider.

## 3. API contracts dan contoh pemanggilan Nepa

Semua request multipart/form-data. Metadata berupa JSON.stringify; image berupa binary Blob/File
PNG/JPEG. Jangan set header Content-Type sendiri karena browser harus membuat boundary.
Semua sukses JSON langsung, tanpa data/success wrapper. Jangan menambah field/sessionId.

| Operasi | Endpoint | Field persis | HTTP 200 |
|---|---|---|---|
| Analyze | POST /api/analyze | image, analysis, context? | SemanticAnalysis |
| Prepare | POST /api/verify | action=prepare, image, mapping | VerificationQuestion[] |
| Evaluate | POST /api/verify | action=evaluate, before, after, mode, questions | VerificationResult |

```ts
// aiImage adalah salinan sumber NORMAL yang terbaca dan memenuhi limit AI.
const analyzeForm = new FormData();
analyzeForm.append('image', aiImage, 'source.png');
analyzeForm.append('analysis', JSON.stringify(colorAnalysis));
if (context) analyzeForm.append('context', JSON.stringify(context)); // hanya subject/grade
const analyzeResponse = await fetch('/api/analyze', {
  method: 'POST', body: analyzeForm, signal: analyzeController.signal,
});

// confirmedMapping = { dataType: categorical|ordinal, categories: SemanticCategory[] }.
// Bentuk ini memakai schema internal existing; belum ada tipe ConfirmedMapping di shared types.
const prepareForm = new FormData();
prepareForm.append('action', 'prepare');
prepareForm.append('image', aiImage, 'source.png');
prepareForm.append('mapping', JSON.stringify(confirmedMapping));
const prepareResponse = await fetch('/api/verify', {
  method: 'POST', body: prepareForm, signal: prepareController.signal,
});

const evaluateForm = new FormData();
evaluateForm.append('action', 'evaluate');
evaluateForm.append('before', beforeSimulation, 'before.png');
evaluateForm.append('after', afterSimulation, 'after.png');
evaluateForm.append('mode', mode); // protan | deutan | tritan | grayscale, bukan normal
evaluateForm.append('questions', JSON.stringify(reviewedQuestions));
const evaluateResponse = await fetch('/api/verify', {
  method: 'POST', body: evaluateForm, signal: modeController.signal,
});
```

Contoh ini dokumentasi, bukan state/store frontend yang diimplementasikan. Periksa response.ok
dan validasi body: semanticAnalysisSchemaFor(activeColors), verificationQuestionsSchema,
verificationResultSchemaFor(mode, reviewedQuestions). Hanya import schema/tipe yang aman di client,
bukan cosmos/http/service AI. Tangani juga network/platform error atau body non-JSON secara aman.

### Analyze

analysis adalah ColorAnalysisResult dari Icul; context opsional hanya subject/grade. AI merujuk
colorId input dan tidak menciptakan swatch baru. Analyze boleh unknown/null atau >4 kategori;
tidak dipotong agar terlihat masuk scope. Jika included >4, server memberi warning batas repair.
SemanticAnalysis masih usulan, bukan konfirmasi guru atau izin otomatis menjalankan repair.

Hasil live Phase 6: bar/categorical; swatch_2_72=Jeruk included/dots, swatch_1_72=Apel
included/diagonal, background_72 dan text_72 excluded, seluruh order null. Penjelasan/warnings
lengkap ada di [flow JSON aktual](./Module-2-Phase-6-flow.json). Tidak perlu koreksi mapping.

### Prepare

image tetap sumber normal, bukan repair/simulasi. Mapping wajib mempunyai 1–4 included;
excluded tidak dihitung. Label included diketahui, ID unik, categorical order null, ordinal
included integer unik. Prepare tidak menerima analysis/context atau daftar hex/conflicts.
Referensi ID ke swatch aktif serta satu visual harus dicek Nepa; server tidak menyimpan hasil analyze.

Respons live Phase 6, persis:

```json
[
  {"id":"q1","question":"Batang mana yang mewakili kategori Jeruk?","expectedAnswer":"B"},
  {"id":"q2","question":"Batang A mewakili kategori apa?","expectedAnswer":"Apel"}
]
```

Kedua kunci diverifikasi dari sumber: B merah=Jeruk, A hijau=Apel. Tidak ada koreksi kunci.
Set dikembalikan dengan ID lokal q1–q3 berdasarkan urutan; reprepare dapat mengubah redaksi/urutan.
Tampilkan review/koreksi guru sebelum evaluate dan jangan prepare ulang per mode.

Wire internal {status, questions} berakar object strict. ok wajib 2–3 item unik/nonkosong;
insufficient_evidence wajib daftar kosong dan dipetakan ke 422. Narasi/JSON/status/list invalid
tetap 502 AI_INVALID_RESPONSE. Tidak mengubah narasi menjadi soal dengan parser spekulatif.

### Evaluate

before/after sudah disimulasikan pada mode/skala yang sama. Semua item request beserta kunci
diterima server untuk scoring, tetapi DTO model dibuat eksplisit hanya id/question.
Tidak mengirim kunci, mapping/analysis/context, sumber normal, gambar pasangan, label before/after,
mode, jawaban sebelumnya atau history kepada model. Satu call menjawab seluruh pertanyaan.

Wire strict {answers:[{id,answer}]} mewajibkan jumlah/ID tepat, unik dan lengkap; answer nonkosong
atau null. Urutan model boleh berbeda. Server mencocokkan berdasarkan ID, bukan posisi, lalu
menyusun urutan request dan memvalidasi VerificationResult. Invalid tidak diisi null diam-diam.

Contoh respons live Protan pada Phase 6 (seluruh item):

```json
{
  "mode":"protan",
  "items":[
    {
      "question":{"id":"q1","question":"Batang mana yang mewakili kategori Jeruk?","expectedAnswer":"B"},
      "before":{"answer":null,"status":"uncertain"},
      "after":{"answer":"B","status":"correct"}
    },
    {
      "question":{"id":"q2","question":"Batang A mewakili kategori apa?","expectedAnswer":"Apel"},
      "before":{"answer":null,"status":"uncertain"},
      "after":{"answer":"Apel","status":"correct"}
    }
  ],
  "warnings":[
    "Uji Terbaca merupakan heuristik AI, bukan persepsi aktual siswa dengan CVD.",
    "Scoring memakai pencocokan persis setelah normalisasi; sinonim atau format berbeda dapat dinilai incorrect."
  ]
}
```

## 4. Error handling dan limit

Error berbentuk {error:{code,message}} dengan pesan aman, tanpa key, provider message, prompt,
image/base64, stack atau detail diagnostic. Pertahankan input/repair valid ketika AI gagal.

| HTTP | Code | Penanganan client |
|---|---|---|
| 400 | INVALID_INPUT | Perbaiki field/mapping/pertanyaan/mode; jangan ulang otomatis |
| 413 | PAYLOAD_TOO_LARGE | Siapkan salinan AI lebih kecil, tanpa menurunkan export diam-diam |
| 415 | UNSUPPORTED_MEDIA_TYPE | Kirim binary PNG/JPEG dan multipart yang benar |
| 422 | INSUFFICIENT_EVIDENCE | Prepare tidak mempunyai minimal dua soal yang dapat dipercaya |
| 429 | RATE_LIMITED | Tampilkan error; retry eksplisit setelah batas provider memungkinkan |
| 502 | AI_PROVIDER_ERROR | Provider/koneksi gagal; tidak ada skor atau hasil parsial |
| 502 | AI_INVALID_RESPONSE | Parsing/schema/ID output gagal; tidak ada hasil palsu |
| 504 | AI_TIMEOUT | Timeout SDK/provider; retry eksplisit bila dipilih pengguna |
| 500 | INTERNAL_ERROR | Konfigurasi/internal invalid; tampilkan pesan aman |

| Batas server AI | Nilai |
|---|---|
| Satu file | 1.572.864 byte (1.5 MiB) |
| Total body aktual | 3.670.016 byte (3.5 MiB, termasuk boundary/header multipart) |
| Metadata agregat UTF-8 | 65.536 byte (64 KiB, termasuk action/mode) |
| Questions | 2–3, ID dan pertanyaan unik |

Content-Length hanya pemeriksaan awal; stream aktual dibatasi sebelum parsing multipart.
Server memeriksa MIME/signature, bukan decode penuh/dimensi. Icul/Nepa harus menyiapkan gambar
valid, sumber asli/export tetap immutable, dan salinan AI tidak menghilangkan legenda/pola.

Cancellation diteruskan dari Request.signal. Kegagalan satu call evaluate membatalkan sibling;
request gagal tanpa VerificationResult parsial. Local abort tidak membuktikan provider menghentikan
komputasi/billing request yang sudah diterima. Retry per mode selalu eksplisit di client.

## 5. Aturan state dan orkestrasi Nepa

Tidak ada implementasi Zustand/UI pada Phase 6. Gunakan state sesi memori, tanpa persist/storage.
Simpan VerificationResult berdasarkan SimulatedMode dan status pending/running/success/error
per mode. Pemilih preview tidak memilih target evaluasi; seluruh empat mode harus dijalankan.

| Perubahan/kejadian | Invalidasi yang diperlukan |
|---|---|
| Gambar sumber berubah | Reset seluruh warna/simulasi/semantic/mapping/repair/soal/kunci/evaluasi terkait gambar lama |
| Swatch/mapping berubah | Batalkan hasil turunan yang bergantung; hapus repair, soal/kunci dan seluruh hasil evaluate |
| Pattern berubah | Hapus seluruh hasil evaluate, pertahankan set soal/kunci sumber |
| Soal atau kunci berubah | Hapus seluruh hasil evaluate sebelumnya |
| Retry satu mode | Ganti status/hasil mode itu saja; hasil mode lain tetap |
| Satu evaluate gagal | Mode itu error; jangan menghapus hasil mode lain atau repair valid |
| Preview mode berubah | Hanya tampilan; jangan membatalkan hasil valid tanpa perubahan sumber/pola/set |

Jalankan loop empat mode secara berurutan dengan try/catch per mode. Backend memparalelkan dua
penjawab di dalam satu request; jangan Promise.all keempat evaluate tanpa kontrol concurrency.
Satu set reviewedQuestions identik digunakan kembali pada semua mode dan retry-nya.

Gunakan AbortController dan revision/request token sesuai dependensi: prepare bergantung sumber/
mapping; evaluate bergantung sumber/mapping/pattern/soal/kunci. Cek token lagi sebelum menyimpan
response. Overlap request pada mode yang sama memakai latest-request-wins, antar-mode tidak
saling menimpa. Pattern berubah cukup membatalkan evaluate terkait, bukan menghapus soal sumber.

Download repair PNG normal tetap tersedia tanpa keberhasilan evaluation; skipped/error tidak
mengunci download dan tidak ditampilkan sebagai lulus. Jangan meng-export gambar simulasi sebagai
output normal. Tampilkan warning repair dan status evaluasi secara terpisah.

## 6. Accessibility Report dari hasil aktual

Untuk setiap sisi dan mode sukses:

```ts
const total = result.items.length;
const rows = result.items.map(item => item.before); // ulangi untuk after
const correct = rows.filter(row => row.status === 'correct').length;
const incorrect = rows.filter(row => row.status === 'incorrect').length;
const uncertain = rows.filter(row => row.status === 'uncertain').length;
const percentageCorrect = 100 * correct / total;
```

Denominator selalu seluruh jumlah pertanyaan (2–3), bukan hanya jawaban non-null. Uncertain
tidak benar. Jika belum dijalankan atau gagal, tampilkan status/not available dengan hitungan dan
persentase null/—; jangan menggunakan nol. Ini statistik jawaban AI, bukan skor aksesibilitas klinis.

| Mode, Phase 6 | Before C/I/U | After C/I/U | Persentase benar before → after |
|---|---|---|---|
| Protan | 0/0/2 | 2/0/0 | 0% → 100% |
| Deutan | 2/0/0 | 2/0/0 | 100% → 100% |
| Tritan | 2/0/0 | 2/0/0 | 100% → 100% |
| Grayscale | 0/0/2 | 2/0/0 | 0% → 100% |

Semua mode pada tabel berstatus success; nol Protan/Grayscale adalah correct count dari dua null
yang valid, bukan kegagalan provider. Hasil sama pada Deutan/Tritan tidak diubah agar meningkat.
[Contoh report JSON](./Module-2-Accessibility-Report-Example.json) berasal dari respons aktual;
metadata engineering di artifact QA tidak perlu ditampilkan pada UI guru.

## 7. Requirement traceability matrix — khusus Module 2

Path test di bawah berada pada src/modules; nama test/source merupakan bukti yang dapat diperiksa.

| Requirement P0 | Implementasi | Bukti test/live | Status |
|---|---|---|---|
| FR-05 analyze satu call | ai-analysis/analyze.ts → completeJson sekali | analyze.test.ts categorical valid; api-flow.test.ts; Phase 6 #1 | PASS |
| ID/enum/shape/order semantic valid | ai-analysis/schemas.ts, analyze.ts | schemas.test.ts ID asing; analyze.test.ts invalid/ordinal/unknown | PASS |
| Analyze >4 tidak dipotong + warning | analyze.ts sesudah validasi publik | analyze.test.ts kasus 4/5; live Phase 3 #14/#25 | PASS |
| Confirmed mapping 1–4 included, excluded tidak dihitung | schemas.ts confirmedMappingSchema | schemas.test.ts 1/4/5 + banyak excluded; http.test.ts prepare lima | PASS |
| FR-09 prepare satu call, 2–3 soal/kunci | verification/prepare.ts, schemas.ts | prepare.test.ts dua/tiga, request schema; Phase 6 #2 | PASS |
| Insufficient evidence 422, malformed tetap 502 | preparationWireSchema + Module2Error | prepare.test.ts status/list invalid dan insufficient; live Phase 4 #9 | PASS |
| Evaluate tepat dua independent calls | verification/evaluate.ts | evaluate.test.ts empat mode/payload blind; Phase 6 #3–6 | PASS |
| Kunci tidak dikirim ke penjawab | DTO eksplisit id/question | evaluate.test.ts PRIVATE_KEY; audit hash seluruh delapan call Phase 6 | PASS |
| ID jawaban tepat, unik, lengkap; urutan request | answeringWireSchemaFor + Map | evaluate.test.ts ID asing/duplikat/hilang/reorder | PASS |
| Scoring deterministik server dan answer asli | verification/scoring.ts | scoring.test.ts 19 kasus; evaluate.test.ts raw answer/mixed | PASS |
| Empat mode, set pertanyaan identik | http.ts simulatedModeSchema, evaluate.ts | evaluate.test.ts empat mode; api-flow.test.ts; Phase 6 | PASS |
| After boleh lebih buruk/sama | skor tidak bergantung sisi | evaluate.test.ts membaik/sama/memburuk/semua uncertain | PASS |
| JSON strict + Zod tanpa repair parser | cosmos.ts, seluruh wire/public schemas | cosmos/prepare/evaluate tests malformed/narasi/foreign fields | PASS |
| Body/file/metadata limits aktual | ai-analysis/http.ts | http.test.ts stream/Content-Length/UTF-8/exact boundary; route tests | PASS |
| Public error contract, tanpa hasil parsial | http.ts errorResponse + routes | http.test.ts sembilan kode; evaluate.test.ts error kedua sisi | PASS |
| Timeout/cancellation, sibling berhenti | cosmos.ts timeout/signal, evaluate controller | cosmos.test.ts 45s; evaluate.test.ts timeout/cancel/sibling | PASS |
| Retry=0, fixed provider/model, no fallback | cosmos.ts client/options/env schema | cosmos.test.ts auth/429/503/koneksi call count; SDK source audit | PASS |
| Secret/log aman, server-only | cosmos/http/diagnostics/analyze/prepare/evaluate | diagnostics.test.ts env gate/redaction; cosmos.test.ts safe error | PASS |
| Stateless, tanpa penyimpanan permanen | service request-local; tidak ada fs/cache/session pada production | audit source + evaluate.test.ts tidak ada history | PASS |
| FR-06/09 review dan dependensi swatch | schema input + kontrak/handoff | live Phase 6 mapping/key review tanpa koreksi | API tersedia; UI Nepa pending |
| Full flow 6 HTTP/10 model calls | kedua routes existing | api-flow.test.ts baru + ledger Phase 6 | PASS |
| FR-11 data laporan jujur | VerificationResult + formula/report di atas | actual four-mode responses, scoring assertions | Backend PASS; UI pending |

Test aktual:
[analyze](../src/modules/ai-analysis/__tests__/analyze.test.ts),
[cosmos](../src/modules/ai-analysis/__tests__/cosmos.test.ts),
[HTTP](../src/modules/ai-analysis/__tests__/http.test.ts),
[diagnostics](../src/modules/ai-analysis/__tests__/diagnostics.test.ts),
[prepare](../src/modules/verification/__tests__/prepare.test.ts),
[evaluate](../src/modules/verification/__tests__/evaluate.test.ts),
[scoring](../src/modules/verification/__tests__/scoring.test.ts),
[full flow mock](../src/modules/verification/__tests__/api-flow.test.ts).

## 8. Final code quality/security audit

Tidak ditemukan bug P0 internal; tidak ada refactor kosmetik atau perubahan source production
pada Phase 6. Type safety, error contracts, input limits, strict parsing/schema, boundary server-only,
secret management dan cancellation telah diperiksa terhadap kode dan regression tests.

- Schema/tipe bersama tetap src/types/index.ts; wrapper yang belum disepakati tetap schema internal.
- Instruksi aplikasi dipisah dari metadata/gambar, tetapi ini mitigasi, bukan jaminan kebal injection.
- Zod membuktikan bentuk/referensi, bukan makna/fakta/kebenaran label. Review guru wajib.
- Hanya diagnostics.ts yang log di production source, gated development dan kegagalan. Nilai input,
  raw prompt/image/AI response/provider message/stack tidak dicetak. SDK logLevel off.
- Tidak ada fs write/database/session/cache/persist pada source service/API. Ledger/fixture adalah
  artifact QA eksplisit sintetis, bukan jalur penyimpanan data pengguna.
- Duplikasi instruksi system + user disengaja karena bukti kompatibilitas CosmosIn, bukan refactor
  yang perlu dihapus. Tidak membuat provider abstraction atau client baru.

### Audit timeout Phase 5

Ledger Phase 5 mencatat satu evaluate gagal dengan dua slot konservatif dan HTTP 504, tanpa
usage/requestId provider yang teramati. Penyebab transport spesifik tetap tidak diketahui.
SDK source membedakan timeout koneksi dan deadline total; timeout koneksi bisa terjadi sebelum
45 detik. Keduanya wajar dipetakan AI_TIMEOUT. Tidak ada bukti untuk mengubah klasifikasi lama.

maxRetries=0 dikirim eksplisit. Source SDK makeRequest/parse retry branches memerlukan retry budget;
jalur workload-identity refresh tidak digunakan pada konfigurasi apiKey string ini. Test memeriksa
auth/429/503/koneksi/timeout tidak retry. Evaluate aborts sibling dan meneruskan caller cancellation.
Tidak ditemukan request aplikasi yang sengaja terus dibiarkan berjalan setelah hasil gagal.
Tidak dapat menyimpulkan apakah upstream membatalkan compute/billing setelah local abort.
Phase 6 berjalan tanpa timeout/retry dan menghasilkan tepat 10 respons provider sesuai rancangan.

## 9. Kompatibilitas aktual dan gap per owner (read-only)

### Icul

src/modules/color-analysis hanya .gitkeep. Belum ada ekstraksi warna, ID stabil, empat simulasi,
decode/resize atau pipeline salinan AI yang dapat diuji. Handoff yang dibutuhkan: ColorSwatch[]
ber-ID stabil per revisi, ColorAnalysisResult valid (termasuk swatch latar/teks), dan PNG/JPEG normal/
simulasi yang memenuhi limit. Jangan memotong kategori informasi agar masuk batas.

Phase 6 memakai metadata ColorAnalysisResult sintetis (threshold=10, conflicts kosong), bukan
hasil perhitungan ΔE Modul 1. Simulasi QA mengikuti metode linear RGB/Culori Phase 5; ini bukan
bukti integrasi aktual atau conformance klinis Icul. Owner Icul perlu menguji implementasi nyata.

### Rico

Engine tersedia dan **dipakai aktual** pada fixture dua kategori, tanpa mengubah source owner.
Harness membundle entry dengan Vite (envDir=false), menjalankan di Chrome headless, memanggil
recommendPatterns → validatePatternConfigs → repairImage → exportImageDataToPng. Browser ditutup.

Hasil: source 1200×760, mapping Jeruk dots/Apel diagonal, spacing 10, 2/2 applied, warning kosong,
source tidak termutasi. 4.668 piksel berubah: bar A 2.249, bar B 1.960, legenda Jeruk 152,
legenda Apel 307, **0 di luar empat area target**. Repair normal/legend diperiksa visual; output
actual Rico menjadi sumber after pada keempat evaluate. Ini bukti fixture tersebut, bukan semua gambar.

API aktual sesuai [README Rico](../src/modules/image-repair/README.md), bukan signature façade
ilustratif CONTRACTS: repairImage(source, swatches, categories, dataType, configs, tolerance?).
Client-only ImageData/Canvas; jangan panggil dari route server atau render SSR. Gunakan source
asli setiap re-render dan ekspor repair normal. Tampilkan seluruh warnings dan cek applied/included.

Gap yang perlu ditangani Rico/Nepa sebelum release aplikasi:

| Gap | Bukti aktual | Tindak lanjut owner |
|---|---|---|
| >4 kategori belum hard-block di engine | patterns.ts mengembalikan empat categorical + warning; ordinal sampai 19; tests mempertahankan ini | Rico selaraskan guard v1.1; Nepa hard-block sebelum repair, bukan sekadar sebelum prepare |
| Config kategori hilang/jenis categorical duplikat masih warning | validatePatternConfigs; renderer hanya menolak errors | Rico/Nepa cegah konfigurasi final invalid sesuai FR-08 |
| Ordinal beda keluarga/urutan spacing salah masih warning | patterns.ts + patterns.test.ts | Rico/Nepa cegah final invalid; included max4 tetap |
| Shared signature ilustratif berbeda API nyata | CONTRACTS façade vs README/index Rico | Nepa gunakan README aktual; tim koordinasikan dokumen, tanpa mengubah tipe sepihak |
| Garis tipis/legenda mini/teks kontras rendah | keterbatasan README Rico | UI tampilkan warning/preview dan jangan klaim repair penuh |

### Nepa

src/app/page.tsx masih scaffold; src/stores dan tests/e2e hanya .gitkeep. Tidak ada request UI,
konfirmasi kategori/kunci, orkestrasi empat mode, state per mode, invalidasi, report atau download
yang dapat dinyatakan terintegrasi. Implementasikan panduan §3–6 dan checklist §12 pada ownership Nepa.
Tidak membuat store/UI atau mengubah dokumen PRD Nepa dalam audit Module 2 ini.

## 10. Pengujian Phase 6 dan budget

Full API flow berhasil berurutan di Next.js lokal port 3106 memakai CosmosIn asli:

| HTTP # | Operasi | Status | Call model |
|---|---|---|---|
| 1 | Analyze normal + metadata QA | 200, semantic/ground truth valid | 1 |
| 2 | Prepare dari mapping direview | 200, dua soal/kunci valid | 1 |
| 3 | Evaluate Protan | 200, seluruh ID/status valid | 2 |
| 4 | Evaluate Deutan | 200, seluruh ID/status valid | 2 |
| 5 | Evaluate Tritan | 200, seluruh ID/status valid | 2 |
| 6 | Evaluate Grayscale | 200, seluruh ID/status valid | 2 |

Semua empat evaluate menggunakan set soal yang sama. Audit hash memverifikasi delapan payload
penjawab tidak membawa expectedAnswer, masing-masing satu gambar yang cocok dengan file input,
dan instruksi/DTO pertanyaan identik. Scoring dicek terhadap jawaban/kunci hasil review.
Semantic dan kunci tidak memerlukan koreksi. Hasil sama/membaik dipertahankan apa adanya.

Budget Phase 6: **10/16 model calls**, 6 HTTP requests, 0 timeout, 0 retry. Usage teramati:
**13.294 prompt + 711 completion = 14.005 token**. Sisa 6 call tidak dipakai karena flow berhasil.
Tidak mengulang eksperimen Phase 1–5; laporan/ledger historis dipertahankan sebagai bukti.

Artifact:
[flow aktual](./Module-2-Phase-6-flow.json),
[ledger call](./Module-2-Phase-6-ledger.json),
[usage](./Module-2-Phase-6-usage.jsonl),
[report contoh](./Module-2-Accessibility-Report-Example.json),
scripts/fixtures/phase6/ (sumber normal, repair Rico, delapan simulasi QA).

Pemeriksaan akhir: typecheck PASS, lint PASS, **438 test mock PASS (14 file)**, build PASS.
Seluruh 437 test existing dipertahankan. Satu integration test baru menutup gap urutan enam request
dan penggunaan ulang set soal dengan tepat sepuluh model calls. Automated suite tidak memakai API.
test:e2e dijalankan tetapi No tests found; tidak diklaim PASS. Ini **API integration test dengan
engine Rico di harness browser dan simulasi QA**, bukan E2E website Icul–Nepa lengkap.

Tool audit live eksplisit: scripts/module2-flow.live.ts + module2-flow-live.config.mts, ledger
terpisah maksimal 16 call. Tahap review terjadi di antara analyze/prepare/evaluate, bukan model
grading tambahan atau field HTTP baru. Jangan reset ledger/budget atau menambah paid call tanpa
kebutuhan/izin yang berlaku. Server audit port 3106 dan browser harness sudah dihentikan.

## 11. Referensi bersama yang perlu disinkronkan tim

Tidak diubah sepihak pada Phase 6:

- AGENTS.md masih mencantumkan @google/genai dan menyatakan PRD Modul 2 belum ada. Tim perlu
  menyelaraskan stack/katalog dokumen dengan implementasi CosmosIn dan PRD Steven yang tersedia.
- README root masih meminta GEMINI_API_KEY dan menyatakan gambar dikirim ke Google Gemini;
  update setup/provider disclosure ke CosmosIn oleh owner dokumen bersama.
- .env.example masih memiliki placeholder GEMINI_API_KEY/GEMINI_MODEL dan package.json masih
  memiliki @google/genai. Tidak digunakan source Module 2 saat ini; cleanup harus dikoordinasikan,
  bukan menghapus dependency/env tim secara sepihak.
- PRD/CONTRACTS/PRD Steven masih memiliki catatan status smoke analyze awal gagal. Requirement
  dan bentuk kontrak tidak diubah; status implementasi terbaru ada pada laporan Phase 3–6.
- Catatan Gemini pada POC Phase 1 merupakan riwayat keputusan; bedakan dari panduan aktif.

## 12. Checklist integrasi dan known limitations

- [x] Ketiga operasi Module 2 sesuai kontrak dan live API flow selesai.
- [x] 1/1/2 call per operasi, empat mode, blind DTO dan scoring server tervalidasi.
- [x] Scope 1–4 included untuk mapping, analyze >4 tetap utuh dan warning.
- [x] Error/timeout/cancellation/log/secret ditinjau; tidak ada P0 internal yang ditemukan.
- [x] Regression/build PASS dan handoff tersedia; tidak commit/push/merge/deploy.
- [ ] Icul menyediakan implementasi nyata, stabilitas ID dan simulasi teruji.
- [ ] Rico/Nepa menutup guard >4/config invalid dan menyelaraskan pemanggilan API engine.
- [ ] Nepa mengimplementasikan review/state/orkestrasi/invalidation/report/download.
- [ ] Tim memperbarui referensi provider/status bersama dan menyepakati wrapper shared types bila diperlukan.
- [ ] E2E website lengkap tersedia dan lulus sebelum klaim rilis aplikasi.

Limitasi tetap: struktur valid bukan bukti label/kunci benar; model vision dapat salah/ambigu;
sinonim atau format ekuivalen dapat dinilai incorrect oleh exact matching; prompt injection tidak
dijamin hilang; server tidak membuktikan mode/versi/dimensi dari piksel. Provider dapat berubah
perilaku atau timeout. Uji AI bukan uji manusia CVD, diagnosis atau jaminan aksesibilitas klinis.

**Blocker internal Module 2: tidak ditemukan pada scope dan bukti yang diuji.** Blocker aplikasi
adalah implementasi/integrasi Icul/Nepa, gap guard Rico dan E2E yang belum tersedia. Berhenti pada
handoff ini; perubahan modul anggota lain atau commit/push/deploy menunggu izin pemilik task.
