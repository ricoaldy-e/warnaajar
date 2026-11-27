# WarnaAjar — Data & Integration Contracts v1.1

**Status:** v1.1 Final MVP Scope — sinkronisasi keputusan produk dan fondasi API; belum membuktikan implementasi lulus E2E.  
**Basis:** `PRD.md` §8, FR-01–13, dan `PRD-01-Icul.md`, `PRD-02-Steven.md`, `PRD-03-Rico.md`, `PRD-04-Nepa.md` (khususnya §4 masing-masing).  
**Scope:** P0 MVP; tanpa database, autentikasi, penyimpanan permanen atau backend terpisah.

Dokumen ini memperinci kontrak Master PRD, bukan menambah fitur. Tipe inti di §2 disalin dari Master PRD tanpa perubahan. Field multipart dan kode error mengikuti fondasi API yang sudah dibuat. Wrapper `ConfirmedMapping`, `AnalysisContext`, `ApiErrorResponse` di §2.1 masih usulan penambahan shared types; gunakan schema internal yang sudah ada sampai disepakati. Contoh signature façade dan parameter yang belum final tetap perlu koordinasi. Jika repo sudah memiliki kontrak yang sesuai, jangan buat duplikat atau mengganti sepihak. Jika ada konflik, koordinasikan dan revisi Master PRD/kontrak bersama sebelum coding.

## 1. Ownership & aturan umum

MVP mendukung satu visual per gambar, dengan 1–4 kategori informasi yang dipetakan berdasarkan warna; swatch teks, latar, grid dan dekorasi tidak dihitung sebagai kategori. Jika lebih dari empat kategori informasi atau terdapat beberapa visual, tetap izinkan analisis warna dan simulasi, tetapi blok repair otomatis dan jelaskan batasan. Jangan mengecualikan kategori informasi yang sebenarnya relevan hanya untuk melewati batas. Keempat mode uji adalah `protan`, `deutan`, `tritan`, `grayscale` (grayscale adalah pengujian tambahan tanpa warna, bukan diagnosis). Guru tidak memilih jenis CVD siswa; pemilih mode hanya mengubah preview. Sistem menyiapkan empat simulasi sumber dan empat simulasi repair dari satu hasil repair normal; boleh menghasilkan secara bertahap sesuai kebutuhan memori, tanpa mengubah cakupan empat mode. Satu repair normal dan satu PNG export. Shared types inti tidak berubah. Batasan multi-visual diverifikasi melalui review guru/dukungan visual; tidak menambah detector multi-chart atau field API.

| Owner | Input utama | Output / tanggung jawab |
|---|---|---|
| Icul (M1) | File/Blob PNG/JPEG, ImageData, mode, konfigurasi ambang | Decode, ColorAnalysisResult, fungsi simulasi/picker |
| Steven (M2) | Gambar, ColorAnalysisResult, mapping konfirmasi, gambar simulasi, pertanyaan/kunci | SemanticAnalysis, VerificationQuestion[], VerificationResult, dua route dan validasi Zod |
| Rico (M3) | ImageData sumber, swatch, mapping terkonfirmasi, PatternConfig[] | Rekomendasi pola, RepairResult, PNG Blob |
| Nepa (M4) | Seluruh output modul | UI, konfirmasi mapping/kunci, orchestration, Zustand, preview, report, download |

- Satu sumber tipe bersama: `src/types/index.ts` yang sudah ada. Jangan mendefinisikan ulang tipe di setiap modul. Zod di server harus sesuai bentuk tersebut; tidak perlu library/package tambahan.
- Gunakan camelCase dan literal enum persis. TypeScript strict; tanpa `any`.
- ID warna adalah string unik dan stabil dalam satu revisi analisis. Hex bukan ID. ID pertanyaan unik dalam satu set. Tidak perlu ID tabel, foreign key SQL atau session ID server.
- `ImageData`, `File`, `Blob`, dan object URL adalah data client. Tidak dikirim sebagai JSON. Metadata API adalah JSON; binary image dikirim sebagai multipart file.
- Gambar asli immutable. Analisis, preview, repair, dan export tidak mengubah gambar sumber. Hasil sesi hanya berada di memori browser (Zustand tanpa persist). API stateless; gambar untuk AI diteruskan ke penyedia CosmosIn, bukan disimpan oleh aplikasi.

## 2. Shared TypeScript types (Master PRD §8.1)

```ts
export type CvdMode = 'normal' | 'protan' | 'deutan' | 'tritan' | 'grayscale';
export type SimulatedMode = Exclude<CvdMode, 'normal'>;
export type VisualType = 'bar' | 'pie' | 'line' | 'map' | 'table' | 'unknown';
export type DataType = 'categorical' | 'ordinal' | 'unknown';
export type PatternKind = 'diagonal' | 'dots' | 'horizontal' | 'crosshatch';

export interface ColorSwatch {
  id: string;
  hex: string; // #RRGGBB
}

export interface ColorConflict {
  colorAId: string;
  colorBId: string;
  mode: SimulatedMode;
  deltaE: number;
}

export interface ColorAnalysisResult {
  colors: ColorSwatch[];
  conflicts: ColorConflict[];
  threshold: number;
}

export interface SemanticCategory {
  colorId: string;
  label: string | null;
  included: boolean;
  order: number | null; // only for confirmed ordinal data
  suggestedPattern?: PatternKind;
}

export interface SemanticAnalysis {
  visualType: VisualType;
  dataType: DataType;
  categories: SemanticCategory[];
  explanation: string;
  warnings: string[];
}

export interface PatternConfig {
  colorId: string;
  kind: PatternKind;
  spacingPx: number;
}

export interface RepairResult {
  image: ImageData; // client only; not serialized to API
  appliedColorIds: string[]; // means pattern applied, not certified readable
  warnings: string[];
}

export interface VerificationQuestion {
  id: string;
  question: string;
  expectedAnswer: string;
}

export type AnswerStatus = 'correct' | 'incorrect' | 'uncertain';
export interface VerifiedAnswer {
  answer: string | null;
  status: AnswerStatus;
}
export interface VerificationItem {
  question: VerificationQuestion;
  before: VerifiedAnswer;
  after: VerifiedAnswer;
}
export interface VerificationResult {
  mode: SimulatedMode;
  items: VerificationItem[];
  warnings: string[];
}
```

### 2.1 Bentuk tambahan minimum untuk integrasi (usulan)

Master PRD membedakan AI suggestion dan mapping yang dikonfirmasi, tetapi belum memberi nama tipe khusus. Gunakan satu wrapper berikut agar Rico tidak menerima hasil AI mentah. Tidak perlu tipe entitas database atau duplikasi `SemanticCategory`.

```ts
export interface ConfirmedMapping {
  dataType: Exclude<DataType, 'unknown'>;
  categories: SemanticCategory[];
}

export interface AnalysisContext {
  subject?: string;
  grade?: string;
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}
```

`ConfirmedMapping` dibentuk hanya setelah aksi konfirmasi pengguna dan validasi lokal. Nama tersebut bukan bukti konfirmasi di server; API stateless tidak dapat membuktikan tindakan UI. `context` opsional dan boleh tidak dikirim sama sekali. `suggestedPattern` tetap sekadar saran, tidak menjadi konfigurasi final.

## 3. Invariant data lintas modul

| Data | Invariant |
|---|---|
| ColorSwatch | `id` tidak kosong dan unik; `hex` #RRGGBB (normalisasi uppercase untuk konsistensi). Warna transparan tidak menjadi kategori. |
| ColorConflict | Kedua ID terdapat pada colors, tidak sama; mode bukan normal; deltaE angka finite >= 0; pasangan tidak duplikat per mode (A/B sama dengan B/A). |
| ColorAnalysisResult | threshold finite positif; conflicts hanya pasangan yang memenuhi aturan ambang internal (usulan: deltaE < threshold). Satu nilai threshold untuk semua mode; tidak dijadikan ambang klinis. |
| SemanticAnalysis | Enum sesuai shared types. ID kategori merujuk pada swatch input; paling banyak satu mapping per ID dalam MVP. Tidak boleh menebak warna/ID baru. Jika tidak diketahui gunakan null/unknown + warning. |
| ConfirmedMapping | Setiap ID valid dan unik; 1–4 kategori included; setiap included punya label nonkosong; semua swatch ditinjau, yang tidak relevan dikecualikan. Unknown tidak boleh lanjut repair. |
| Categorical mapping | order null; konfigurasi final memakai jenis pola berbeda per kategori. |
| Ordinal mapping | Included mempunyai order bilangan bulat unik, diusulkan 1..N dari rendah ke tinggi. Excluded order null. |
| PatternConfig | Tepat satu konfigurasi per kategori included; tidak ada ID asing/excluded/duplikat; spacingPx finite positif dalam batas yang disepakati. |
| RepairResult | image baru dengan dimensi dan alpha sumber; appliedColorIds unik dan subset included, hanya jika pola benar-benar diterapkan. Warning jika gagal/ambigu; tidak berarti sertifikat aksesibilitas. |
| VerificationQuestion | 2–3 pertanyaan unik, ID unik, pertanyaan dan kunci nonkosong, terkait informasi warna/legenda pada gambar. Kunci ditinjau sebelum evaluate. Jika tidak dapat dikonfirmasi jangan evaluate set itu. |
| VerificationResult | mode identik dengan request; items tepat satu per pertanyaan yang diuji, tanpa pertanyaan/kunci baru, before/after status sesuai enum; answer null jika tidak dapat ditentukan. |

Catatan: detail seperti `order` 1..N, kelengkapan mapping semua swatch, format uppercase, dan `< threshold` merupakan konvensi yang diusulkan agar implementasi tidak berbeda; bukan perubahan scope. Ketika output AI belum lengkap, UI dapat menambahkan baris swatch yang belum dipetakan untuk ditinjau, bukan mengarang kategori.

## 4. Kontrak modul lokal (client-only)

Nama fungsi berikut adalah **usulan façade publik minimal**. Nama implementasi lokal boleh berbeda jika interface bersama dan contoh pemanggilan sudah disepakati. Tidak perlu membuat layer service/repository tambahan. Nepa memanggil fungsi; Icul/Rico tidak bergantung pada Zustand/UI.

### 4.1 Icul — Color analysis

```ts
// Signature ilustratif; implementasi berada di modules/color-analysis.
decodeImage(file: Blob): Promise<ImageData>
extractColors(source: ImageData): ColorSwatch[]
simulateCvd(source: ImageData, mode: CvdMode): ImageData
analyzeColors(colors: ColorSwatch[], threshold: number): ColorAnalysisResult
pickColor(source: ImageData, x: number, y: number): string
```

- `decodeImage` memvalidasi MIME/decode dan batas dimensi; input gagal harus ditangani. UI menyediakan file picker, paste dan drag-drop.
- `simulateCvd` menghasilkan salinan, termasuk mode normal; pertahankan alpha/dimensi. Fungsi yang sama menerima source atau repair untuk preview/verification.
- `pickColor` menerima koordinat piksel asli (Nepa dapat mengonversi dari CSS); kembalikan #RRGGBB, atau tangani piksel transparan/di luar batas sebagai input tidak valid. Manual picker mengubah daftar swatch, bukan otomatis menandai seluruh objek.
- `analyzeColors` memakai model Machado dan CIEDE2000, hasil deterministik. Grayscale tambahan; mode normal tidak merupakan konflik CVD. Sepakati apakah grayscale juga menghasilkan konflik sebelum integrasi; `SimulatedMode` sudah mengizinkan nilai tersebut.

### 4.2 Rico — Repair engine

```ts
recommendPatterns(
  source: ImageData, colors: ColorSwatch[], mapping: ConfirmedMapping
): PatternConfig[]
repairImage(
  source: ImageData, colors: ColorSwatch[], mapping: ConfirmedMapping,
  patterns: PatternConfig[]
): RepairResult
exportPng(image: ImageData): Promise<Blob>
```

- Repair hanya dari sumber normal, bukan gambar hasil simulasi atau repair sebelumnya.
- Categorical: 1–4 kategori dengan jenis pola berbeda; guru bebas memilih dari empat jenis dan spacing valid. Blok repair/rekomendasi dengan >4 kategori included atau jenis pola duplikat pada konfigurasi final. Ordinal: satu keluarga arsir, spacing makin kecil untuk order makin tinggi. Periksa warning/preview bila area terlalu kecil atau ambigu.
- Legenda dan isi kategori memakai konfigurasi sama. Lindungi teks/angka/batas dan area non-target. Bila mask ambigu, jangan mengklaim keberhasilan; keluarkan warning dan jangan aplikasikan area yang tidak aman.
- Export PNG valid dari `RepairResult.image` terbaru; tidak perlu AI verification berhasil. Dimensi tetap sesuai sumber yang diterima.

## 5. Kontrak HTTP (Steven ↔ Nepa)

CosmosIn melalui SDK `openai` (Chat Completions OpenAI-compatible), model `deepseek-v4.1-flash` melalui env server `COSMOS_MODEL`, `COSMOS_BASE_URL=https://api.cosmosin.io/v1`, dan `COSMOS_API_KEY`. Strict JSON Schema + validasi Zod runtime; non-streaming, retry otomatis 0, timeout 45.000 ms per panggilan, max output 2048 token. Tidak ada fallback model/provider. POC kemampuan berhasil; live route analyze masih perlu debugging (HTTP 502 AI_INVALID_RESPONSE pada smoke awal). Batas AI: 1.5 MiB (1.572.864 byte) per gambar, 3.5 MiB (3.670.016 byte) total body multipart aktual, 64 KiB (65.536 byte) total field teks/metadata UTF-8. Ini bukan batas gambar sumber/export. Client menyiapkan salinan AI dengan legenda/pola tetap terbaca; server membatasi stream aktual dan memeriksa MIME/signature, bukan decode penuh. Wire schema strict boleh berbeda dari bentuk publik (object root; required nullable bila perlu), tetapi output publik tetap sesuai shared types. Jangan menambah field atau endpoint.

Hanya dua route: `POST /api/analyze` dan `POST /api/verify`. Request `multipart/form-data`; response JSON langsung (tanpa wrapper `data` pada sukses). Field JSON adalah **string JSON.stringify(...)**, bukan object FormData atau base64. File adalah Blob/File PNG atau JPEG valid. Jangan menyetel header Content-Type manual di fetch browser karena browser membuat boundary. Semua request membawa data yang diperlukan; tidak ada server session atau endpoint upload terpisah.

### 5.1 POST /api/analyze

| Field | Encoding | Wajib | Makna |
|---|---|---|---|
| image | binary PNG/JPEG | Ya | Salinan gambar asli mode normal, legenda tetap terlihat |
| analysis | JSON ColorAnalysisResult | Ya | Swatch, konflik, threshold dari Icul |
| context | JSON AnalysisContext | Tidak | subject/grade jika pengguna mengisi |

Response HTTP 200: `SemanticAnalysis`. AI hanya memahami konteks dan menyarankan pola; bukan sumber ΔE. Analyze dapat mengembalikan >4 kategori agar temuan tidak hilang; batas diterapkan sebelum repair/prepare. Server validasi enum, ID, duplikasi, bentuk output; unknown/null harus jujur dan ada warning relevan.

```ts
const form = new FormData();
form.append('image', aiImage, 'source.png'); // contoh jika Blob PNG
form.append('analysis', JSON.stringify(colorAnalysis));
if (context) form.append('context', JSON.stringify(context));
const response = await fetch('/api/analyze', { method: 'POST', body: form });
// Cek response.ok, parse JSON dan tangani error sesuai kontrak.
```

### 5.2 POST /api/verify — prepare

| Field | Encoding | Wajib | Makna |
|---|---|---|---|
| action | string `prepare` | Ya | Pilih operasi |
| image | binary PNG/JPEG | Ya | Gambar asli normal, bukan versi repair |
| mapping | JSON ConfirmedMapping | Ya | Pemetaan yang sudah ditinjau guru |

Response HTTP 200: `VerificationQuestion[]` (array langsung, 2–3 pertanyaan). Nepa wajib memberikan kesempatan meninjau/mengoreksi pertanyaan dan kunci sebelum evaluate. Prepare sekali per sumber/mapping; jika bukti tidak cukup gunakan 422 INSUFFICIENT_EVIDENCE. Jika AI tidak bisa menghasilkan pertanyaan yang didukung gambar, kembalikan error yang sesuai; tidak membuat kunci palsu.

```ts
const form = new FormData();
form.append('action', 'prepare');
form.append('image', aiImage, 'source.png');
form.append('mapping', JSON.stringify(confirmedMapping));
const response = await fetch('/api/verify', { method: 'POST', body: form });
```

Server prepare memvalidasi bentuk mapping, jumlah included 1–4, ID unik dan urutan, tetapi tidak memiliki daftar swatch dari request analyze sebelumnya; validasi referensi ID terhadap swatch aktif dilakukan Nepa sebelum request. Jangan menganggap ID dapat dicek terhadap penyimpanan server.

### 5.3 POST /api/verify — evaluate

| Field | Encoding | Wajib | Makna |
|---|---|---|---|
| action | string `evaluate` | Ya | Pilih operasi |
| before | binary PNG/JPEG | Ya | Gambar sumber yang sudah disimulasikan |
| after | binary PNG/JPEG | Ya | Gambar repair yang sudah disimulasikan |
| mode | string SimulatedMode | Ya | Mode sama untuk before & after |
| questions | JSON VerificationQuestion[] | Ya | Pertanyaan dan kunci yang sudah ditinjau |

Response HTTP 200: `VerificationResult` (satu mode per request). Nepa otomatis menjalankan evaluate untuk empat mode setelah guru memulai Uji Terbaca; satu set soal/kunci yang ditinjau digunakan kembali. Satu E2E lengkap yang berhasil tanpa retry memakai 10 panggilan AI: 1 analyze + 1 prepare + 8 penjawaban (2 per mode). Orkestrasi empat evaluate di client, satu mode per request, disarankan berurutan untuk mengurangi risiko rate limit. Setiap mode punya status pending/running/success/error dan hasil sendiri. Retry eksplisit hanya pada mode gagal; keberhasilan mode lain tidak dihapus. Jangan tampilkan kegagalan sebagai skor nol. Jika sumber/mapping/pola/kunci berubah, abaikan/batalkan hasil kedaluwarsa. Before/after dibuat memakai fungsi Icul dengan mode yang sama; salinan untuk AI menggunakan skala yang sebanding dan pola/legenda masih terlihat. Server memvalidasi format dan enum; konsistensi versi gambar dan penerapan mode adalah tanggung jawab client (server tidak bisa membuktikannya hanya dari pixel request).

```ts
const form = new FormData();
form.append('action', 'evaluate');
form.append('before', beforeBlob, 'before.png');
form.append('after', afterBlob, 'after.png');
form.append('mode', mode);
form.append('questions', JSON.stringify(reviewedQuestions));
const response = await fetch('/api/verify', { method: 'POST', body: form });
```

Steven harus memisahkan tiga proses:

1. Prepare menghasilkan pertanyaan dan kunci dari sumber asli dan mapping.
2. Evaluate memanggil penjawab **secara terpisah** untuk before dan after. Prompt penjawab hanya gambar versi tersebut + `{ id, question }[]` identik; tidak menyertakan expectedAnswer, mapping, jawaban sebelumnya, gambar versi lain atau sumber normal. Jangan gunakan chat history yang mengandung kunci.
3. Setelah jawaban tersedia, server membandingkan dengan kunci. Bandingkan jawaban terhadap kunci di server dengan normalisasi sederhana (Unicode, whitespace, kapitalisasi; pertahankan angka, satuan, dan operator bermakna). Exact match setelah normalisasi = correct; jawaban berbeda = incorrect; null/tidak dapat ditentukan = uncertain. Tidak ada panggilan AI penilai tambahan; keterbatasan sinonim dicatat. Kegagalan salah satu panggilan penjawab membuat request mode itu gagal, bukan skor 0 atau hasil sukses palsu; mode lainnya tetap dipertahankan di client.

### 5.4 Error response

Semua kegagalan route mengikuti bentuk Master PRD, misalnya:

```json
{"error":{"code":"INVALID_INPUT","message":"Gambar atau metadata tidak valid."}}
```

Kode error yang dipakai fondasi API (bukan endpoint tambahan):

| HTTP | code | Kapan |
|---|---|---|
| 400 | INVALID_INPUT | Field wajib hilang, JSON/enum/ID invalid |
| 413 | PAYLOAD_TOO_LARGE | Batas ukuran terlampaui |
| 415 | UNSUPPORTED_MEDIA_TYPE | Format media tidak didukung |
| 422 | INSUFFICIENT_EVIDENCE | Tidak dapat menyiapkan pertanyaan valid |
| 429 | RATE_LIMITED | Kuota/rate limit |
| 502 | AI_PROVIDER_ERROR | Panggilan provider gagal |
| 502 | AI_INVALID_RESPONSE | Output model tidak sesuai schema |
| 504 | AI_TIMEOUT | Provider timeout |
| 500 | INTERNAL_ERROR | Kesalahan tidak terduga |

Platform dapat menolak request sebelum route berjalan (misalnya payload terlalu besar); UI harus bisa menangani response non-JSON dan network error dengan pesan aman. Jangan menampilkan secret, stack trace atau data gambar. Retry eksplisit, bukan loop otomatis. Gagal verify tidak menghapus repair valid atau mengunci download.

## 6. Contoh data satu alur E2E

**Fixture ilustratif:** peta penggunaan lahan dengan wilayah A = Hutan, B = Permukiman, C = Pertanian. Angka ΔE, pola, jawaban dan status di bawah hanya contoh kontrak, bukan hasil perhitungan atau eksperimen. ID persis sama di seluruh payload.

### 6.1 Icul → Steven/Nepa: ColorAnalysisResult

```json
{
  "colors": [
    {"id":"c1","hex":"#45934F"},
    {"id":"c2","hex":"#CD4949"},
    {"id":"c3","hex":"#E4C34D"},
    {"id":"c4","hex":"#000000"},
    {"id":"c5","hex":"#FFFFFF"}
  ],
  "conflicts": [
    {"colorAId":"c1","colorBId":"c2","mode":"deutan","deltaE":4.2},
    {"colorAId":"c1","colorBId":"c2","mode":"protan","deltaE":5.8}
  ],
  "threshold": 10
}
```

### 6.2 Steven → Nepa: SemanticAnalysis

```json
{
  "visualType":"map",
  "dataType":"categorical",
  "categories":[
    {"colorId":"c1","label":"Hutan","included":true,"order":null,"suggestedPattern":"diagonal"},
    {"colorId":"c2","label":"Permukiman","included":true,"order":null,"suggestedPattern":"dots"},
    {"colorId":"c3","label":"Pertanian","included":true,"order":null,"suggestedPattern":"horizontal"},
    {"colorId":"c4","label":"Teks","included":false,"order":null},
    {"colorId":"c5","label":"Latar","included":false,"order":null}
  ],
  "explanation":"Hutan dan permukiman berpotensi sulit dibedakan pada simulasi deutan dan protan.",
  "warnings":[]
}
```

### 6.3 Nepa → Rico / verify prepare: ConfirmedMapping

```json
{
  "dataType":"categorical",
  "categories":[
    {"colorId":"c1","label":"Hutan","included":true,"order":null},
    {"colorId":"c2","label":"Permukiman","included":true,"order":null},
    {"colorId":"c3","label":"Pertanian","included":true,"order":null},
    {"colorId":"c4","label":"Teks","included":false,"order":null},
    {"colorId":"c5","label":"Latar","included":false,"order":null}
  ]
}
```

Nepa mengirim kategori yang sudah dikonfirmasi; Rico juga menerima source ImageData dan ColorSwatch[] aktif.

### 6.4 Rico → Nepa: PatternConfig[]

```json
[
  {"colorId":"c1","kind":"diagonal","spacingPx":10},
  {"colorId":"c2","kind":"dots","spacingPx":12},
  {"colorId":"c3","kind":"horizontal","spacingPx":10}
]
```

Jika `ordinal`, contoh order 1,2,3 dengan `kind: diagonal` untuk ketiganya dan spacing 16,12,8. Nilai ini hanya ilustrasi konfigurasi, bukan batas final.

### 6.5 Rico → Nepa: RepairResult (runtime object, bukan JSON)

```ts
const result: RepairResult = {
  image: repairedImageData,
  appliedColorIds: ['c1', 'c2', 'c3'],
  warnings: [],
};
```

`repairedImageData` adalah objek `ImageData` hasil engine. Tidak ada URL database atau data base64 di kontrak ini.

### 6.6 Steven → Nepa: VerificationQuestion[] (prepare)

```json
[
  {"id":"q1","question":"Wilayah manakah yang merupakan hutan?","expectedAnswer":"A"},
  {"id":"q2","question":"Wilayah manakah yang merupakan permukiman?","expectedAnswer":"B"},
  {"id":"q3","question":"Wilayah manakah yang merupakan pertanian?","expectedAnswer":"C"}
]
```

Nepa memperlihatkan kunci untuk review. Set yang disetujui dipakai ulang untuk empat request evaluate, masing-masing dengan dua gambar simulasi mode yang sama.

### 6.7 Steven → Nepa: VerificationResult (evaluate)

```json
{
  "mode":"deutan",
  "items":[
    {"question":{"id":"q1","question":"Wilayah manakah yang merupakan hutan?","expectedAnswer":"A"},
     "before":{"answer":"B","status":"incorrect"},"after":{"answer":"A","status":"correct"}},
    {"question":{"id":"q2","question":"Wilayah manakah yang merupakan permukiman?","expectedAnswer":"B"},
     "before":{"answer":null,"status":"uncertain"},"after":{"answer":"B","status":"correct"}},
    {"question":{"id":"q3","question":"Wilayah manakah yang merupakan pertanian?","expectedAnswer":"C"},
     "before":{"answer":"C","status":"correct"},"after":{"answer":"C","status":"correct"}}
  ],
  "warnings":[]
}
```

Report mode deutan dari contoh: 1/3 benar sebelum dan 3/3 setelah. Tiga mode lain harus memakai response masing-masing, bukan menyalin angka contoh ini. `uncertain` bukan benar. Data ini ilustrasi, bukan bukti peningkatan manusia. Jangan mengirim persentase dari AI; hitung berdasarkan items aktual.

## 7. State contract — Nepa

Gunakan satu state sesi browser minimal. Nama property mengikuti Master PRD §8.3; wrapper di bawah diusulkan untuk memudahkan integrasi. Tidak ada persist middleware, IndexedDB atau storage server. UI-specific state seperti dialog/step/error bisa tetap lokal.

```ts
interface SourceImage {
  file: Blob;
  name: string;
  image: ImageData;
}
interface SessionData {
  sourceImage: SourceImage | null;
  colorAnalysis: ColorAnalysisResult | null;
  semanticAnalysis: SemanticAnalysis | null;
  confirmedMapping: ConfirmedMapping | null;
  patterns: PatternConfig[];
  repairResult: RepairResult | null;
  reviewedQuestions: VerificationQuestion[] | null;
  verificationResults: Partial<Record<SimulatedMode, VerificationResult>>;
  verificationStatus: Partial<Record<SimulatedMode, 'pending' | 'running' | 'success' | 'error'>>;
  verificationErrors: Partial<Record<SimulatedMode, string>>;
  previewMode: CvdMode;
  revision: number;
}
```

`revision` adalah counter lokal untuk mencegah stale async response; bukan versi database. `reviewedQuestions` null sampai kunci disetujui. Loading/error dan cancellation menggunakan state minimal sesuai repo. Mode tanpa hasil valid berarti belum diuji/gagal, bukan skor nol. Mode evaluasi otomatis empat mode, tidak tergantung previewMode. Key hasil harus sama dengan `result.mode`. Status/error per mode adalah state client, bukan response HTTP baru. Bentuk state di atas adalah rancangan minimal; nama lokal boleh disesuaikan tanpa mengubah perilaku.

| Aksi | Wajib invalidasi/reset |
|---|---|
| Upload/ganti source | Semua data turunan, preview default, kunci, hasil uji |
| Ubah swatch/threshold | Hitung ulang ColorAnalysisResult; hapus semanticAnalysis, mapping, pola, repair, pertanyaan dan verification |
| Konfirmasi ulang mapping | Reset/rekomendasi ulang pola, repair, pertanyaan/kunci, verification |
| Ubah pola | Hapus repair lama dan verification; render ulang sumber. Set pertanyaan yang masih valid untuk sumber/mapping boleh dipertahankan. |
| Ubah mode preview | Tidak mengubah mapping/repair/verification; label hasil uji dengan mode asli |
| Ubah set pertanyaan/kunci | Batalkan hasil verification lama; review ulang |
| Evaluate / retry satu mode | Simpan/ganti hanya hasil, status dan error mode tersebut; pertahankan mode lain yang masih valid |
| Download | Tidak mengubah sumber atau data analisis |

Setiap perubahan yang membatalkan request terkait harus mengabaikan atau membatalkan request tersebut. Gunakan revision/request token minimal, misalnya tangkap revision saat memulai operasi dan cek lagi sebelum commit hasil. Untuk retry/operasi sejenis yang overlap, latest request wins pada operasi/mode yang sama (request token atau AbortController); evaluate antar-mode tidak saling membatalkan; perubahan preview saja tidak membatalkan kerja yang tidak terkait. Lepaskan object URL yang sudah tidak dipakai.

## 8. Kontrak report dan export

Tidak perlu tipe tabel atau API report terpisah. Nepa menurunkan ringkasan dari state:

- Potensi konflik = `colorAnalysis.conflicts`, dengan mode dan deltaE; tidak otomatis berkurang karena pattern.
- Kategori target = mapping included. Jumlah kategori berpola = `repairResult.appliedColorIds.length`; kategori target yang tidak tercantum dilaporkan belum tertangani. Jangan menganggap semua pasangan konflik terselesaikan hanya berdasarkan ID yang berpola; perhatikan warning dan konfigurasi pembeda.
- Uji Terbaca = `items.filter(item => item.before.status === 'correct').length` dan versi after, dibagi jumlah pertanyaan valid dalam set yang dievaluasi. `uncertain` masuk denominator jika pertanyaannya valid dan jawabannya tidak pasti; bukan benar. Jika set/kunci belum valid atau request gagal, tampilkan belum diuji/gagal, bukan persentase 0 atau 100.
- Tampilkan keempat mode beserta status, hasil jika sukses, warning, dan bahwa evaluasi AI bersifat heuristik, bukan pembuktian kemampuan membaca manusia. Jangan menggabungkan menjadi skor aksesibilitas absolut; pertanyaan hanya mencakup informasi yang diuji.
- Export: Blob `image/png` dari repair normal terbaru, nama seperti `peta-warnaajar.png`. UI download lokal. Verification error tidak memblokir repair valid; beri status belum diverifikasi.

## 9. Parameter yang belum boleh dikunci sepihak

| Parameter | Penanggung jawab kesepakatan |
|---|---|
| Ambang ΔE konflik, aturan inklusi batas, grayscale conflict | Icul + Nepa + Steven |
| Toleransi masking (berbeda dari ambang konflik), spacing min/max, penanganan mask tumpang tindih | Rico + Icul + Nepa |
| Maksimum file/dimensi input & export | Icul + Rico + Nepa (Master PRD mengusulkan 5 MB, sisi terpanjang 4096 px; belum final) |
| Kuota, latency aktual dan strategi antrean request | Steven + Nepa; konfigurasi provider/limit sudah dicatat §5, live endpoint perlu diverifikasi |
| Nama façade publik, field multipart detail & kode error usulan | Semua pemilik yang terdampak |

Contoh threshold=10 dan spacing=10 di dokumen ini bukan default yang sudah disetujui. Jangan hardcode asumsi dari contoh. Tidak perlu infrastruktur tambahan untuk mengakomodasi parameter tersebut. Simpan secret dan model di env server; nama env mengikuti §5, tanpa NEXT_PUBLIC untuk secret.

## 10. Acceptance checklist integrasi

- [ ] Semua modul import tipe yang sama; tidak ada tipe duplikat atau `any`.
- [ ] Fixture dari Icul valid; ID konflik dan kategori cocok dengan swatch.
- [ ] API menolak input/output invalid, termasuk ID asing pada analyze dan enum tidak sah.
- [ ] Repair ditolak sebelum mapping valid dikonfirmasi; ordinal dengan order invalid tidak diproses.
- [ ] Repair/prepare menolak >4 kategori included; UI tidak menyembunyikan kategori relevan untuk lolos batas. Fixture 2/4 kategori dan >4 kategori, serta multi-visual diuji.
- [ ] Empat pasang simulasi, satu set soal, empat evaluate per sesi penuh; status/error per mode, retry mode gagal, dan invalidasi seluruh hasil saat pola berubah.
- [ ] Pola hanya kategori included; legenda sama; sumber tidak termutasi; hasil valid PNG normal.
- [ ] Prepare menghasilkan set 2–3 soal yang dapat ditinjau; evaluate memakai pertanyaan dan mode sama.
- [ ] Spy/mock membuktikan penjawab before/after terpisah dan bebas kunci, mapping serta jawaban lama.
- [ ] Hasil verify aktual dihitung benar; error dan uncertain tidak dianggap benar.
- [ ] Ganti sumber/koreksi mapping/pola membatalkan data turunan; async lama tidak menimpa state.
- [ ] Download repair valid tetap tersedia saat verify gagal; tidak ada klaim lulus palsu.
- [ ] Typecheck, lint, unit test Vitest, E2E Playwright dan build lulus; smoke CosmosIn asli dicatat terpisah dari mock.
- [ ] Tidak ada database, auth, storage eksternal, atau endpoint CRUD.

## 11. Aturan AI coding agent

Baca Master PRD, PRD modul sendiri, CONTRACTS.md dan AGENTS.md jika ada sebelum coding. Kerjakan task yang diminta saja; tidak menambah scope/fitur P1, service, library, tipe atau abstraksi tanpa kebutuhan yang disetujui. Jangan mengubah enum, field, API, atau fungsi publik secara sepihak. Jika menemui kontradiksi, laporkan dan usulkan perubahan terkecil kepada owner terkait. Tambahkan fixture/test sesuai kontrak, laporkan hasil nyata dan blocker, jangan commit/push/merge/deploy tanpa izin. Contoh data bukan mock produksi atau angka hasil eksperimen.
