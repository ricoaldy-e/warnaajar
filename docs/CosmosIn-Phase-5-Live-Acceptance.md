# Phase 5 — blind evaluation dan deterministic scoring

28 November 2026, Asia/Jakarta. Owner: Steven.

## Hasil

POST /api/verify action=evaluate sudah bekerja melalui CosmosIn asli. Tujuh evaluate sukses
mencakup empat mode dengan set soal identik, visual dua/empat kategori, peta ordinal, dan satu
pengulangan konfigurasi final. Setiap sukses mempunyai tepat dua respons provider independen.
Schema/ID/scoring dan audit blind payload lulus. Tidak ada hasil yang dipaksa meningkat.

Typecheck/lint/build PASS, 437 test mock PASS (13 file). E2E dijalankan dan melaporkan
No tests found; tidak diklaim lulus. Phase 4 tetap tersedia dan regression-nya dipertahankan.
Phase 6/frontend tidak dikerjakan. Tidak ada shared type, kontrak HTTP, provider/model, dependency,
client abstraction, retry otomatis, AI judge, database, session atau storage production baru.

## Perubahan file

- src/modules/verification/evaluate.ts: dua penjawab blind, validasi hasil, pencocokan ID,
  orchestration paralel/cancellation, scoring lokal dan validasi response publik.
- src/modules/verification/scoring.ts: normalisasi NFC/whitespace/kapitalisasi dan exact comparison.
- src/modules/verification/schemas.ts: answeringWireSchemaFor memeriksa kelengkapan ID jawaban.
- src/app/api/verify/route.ts: dispatch evaluate nyata, mempertahankan prepare dan helper error.
- verification/__tests__/evaluate.test.ts, evaluate-fixtures.ts, scoring.test.ts: test baru.
- verification/__tests__/prepare.test.ts: hanya assertion sementara evaluate belum tersedia yang
  diganti perilaku evaluate baru; seluruh pengujian prepare tetap ada.
- README Modul 2: kontrak, error, scoring, hasil live dan handoff Nepa.
- scripts/create-evaluate-fixtures.mts dan scripts/fixtures/evaluate/: tiga sumber sintetis,
  masing-masing empat mode x dua versi PNG, SVG sumber dan pertanyaan/kunci untuk review.
- scripts/evaluate.live.ts, evaluate-live.config.mts: runner eksplisit dengan budget terpisah.
- scripts/observe-cosmos.mjs: audit opsional hash instruksi/pertanyaan/gambar dan bentuk DTO,
  serta diagnostik transport aman. Default usage audit fase sebelumnya tetap dipertahankan.
- docs/CosmosIn-Phase-5-live-results.json dan usage.jsonl: ledger respons/usage/audit sintetis.

Working tree telah diperiksa sebelum implementasi; pekerjaan anggota lain dipertahankan.
AGENTS, PRD/CONTRACTS v1.1, PRD Steven dan panduan integrasi Icul/Nepa, shared types, source/tests
Phase 1–4 serta laporan live sebelumnya dipakai sebagai acuan. Context7 tidak tersedia; docs
Next.js dan source/types SDK/Culori terpasang dibaca. Tidak mengubah source analyze/prepare/cosmos/http
atau modul Icul/Rico/Nepa. Tidak commit/push/merge/deploy.

## HTTP dan arsitektur blind

Multipart persis: action=evaluate, before, after (PNG/JPEG), mode protan/deutan/tritan/grayscale,
questions JSON VerificationQuestion[] dengan 2–3 soal/kunci hasil review guru. Parser existing
menolak mode normal, field asing, ID/soal/kunci invalid dan payload berlebih sebelum network.
Limit: 1.5 MiB per file, 3.5 MiB body aktual, 64 KiB metadata agregat.

evaluate.ts membuat DTO baru dengan menyalin hanya id dan question. Masing-masing call hanya
membawa satu gambar, DTO seluruh pertanyaan, dan tugas/schema identik. Tidak mengirim kunci,
mapping/analysis/context, gambar normal/pasangan, mode/label before-after, jawaban sebelumnya
atau history. Tidak memberi instruksi bahwa suatu versi harus lebih baik.

Call berjalan paralel dengan completeJson existing: CosmosIn deepseek-v4.1-flash, JSON Schema
strict, tugas lengkap/schema di text part user, metadata DTO di text part terpisah, image_url
terakhir, max_tokens=2048, timeout 45 detik, retry=0, non-streaming. Instruksi meminta jawaban
singkat sesuai gambar, mempertahankan satuan, null bila ambigu, tanpa menebak/pengetahuan luar/
penilaian/pembahasan. Gambar/pertanyaan adalah data tidak tepercaya dan tidak masuk instruksi.

Request.signal digabung dengan controller operasi. Jika satu call gagal, sibling aktif dibatalkan,
error aslinya dikembalikan melalui kontrak existing. Tidak ada hasil parsial, jawaban palsu, atau
pengubahan provider error menjadi uncertain/incorrect. Sebuah mode tidak menyimpan state mode lain.

## Wire schema dan scoring

Wire object strict, semua field wajib:

```json
{"answers":[{"id":"q1","answer":"B"},{"id":"q2","answer":null}]}
```

answer adalah string nonkosong atau null. Zod memeriksa jumlah tepat, seluruh ID dari request,
ID unik dan tidak hilang/asing; foreign fields ditolak. Urutan model bebas, tetapi server menyusun
kembali dengan Map berdasarkan ID. Missing ID tidak diisi null. JSON/schema/reference invalid
menghasilkan AI_INVALID_RESPONSE. VerificationResult akhir divalidasi ulang dengan schema existing.

Scoring memakai kunci hanya setelah kedua hasil jawaban diterima. Null → uncertain. String yang
sama setelah Unicode NFC, trim, collapse whitespace dan lowercase id-ID → correct; lainnya
incorrect. Jawaban model asli dipertahankan, tidak diganti hasil normalisasi. Angka, satuan,
negatif, desimal, operator dan perbedaan format bermakna tidak dihapus. Tidak ada fuzzy/embedding/
AI judge. Contoh: apel=Apel; 40 g != 40 kg; -40 != 40; 4,5 != 4.5; Batang B != B.

Respons publik langsung VerificationResult dengan mode/items/warnings, tanpa score/percentage.
Frontend dapat menghitung jumlah status correct per sisi dari seluruh item; uncertain tidak benar.
Provider error adalah status request error, bukan skor nol. After boleh sama atau lebih buruk.

## Fixture simulasi khusus QA

src/modules/color-analysis masih hanya .gitkeep. Karena itu tidak memanggil atau mengklaim integrasi
engine Icul. Tidak memanggil renderer Rico; pola fixture digambar sendiri sebagai SVG engineering.

Generator membuat bar dua/empat kategori dengan urutan legenda berbeda dari urutan batang:
A=Apel, B=Jeruk, C=Melon, D=Anggur. Peta ordinal memakai Utara=Rendah, Tengah=Sedang, Selatan=Tinggi.
Soal/kunci berasal dari hubungan visual yang sudah ditinjau, konsisten dengan acceptance Phase 4.
Expected answers tidak dikirim ke model; file pertanyaan/kunci hanya input endpoint dan pembanding.

Before/after mempertahankan sumber, ukuran, label dan posisi yang sama. Versi after menambahkan
diagonal/dots/horizontal/crosshatch pada kategori bar dan swatch legendanya. Ordinal memakai
keluarga garis horizontal dengan spacing 24/14/7 untuk rendah/sedang/tinggi, konsisten di legenda.

Kedua SVG dirasterisasi dengan sharp yang sudah terpasang. Piksel sRGB didekode ke linear RGB
menggunakan converter Culori; matriks deficiency severity=1 dari helper Culori diterapkan pada
komponen linear, lalu dikodekan kembali ke sRGB dan di-clamp. Grayscale memakai luminance linear
0.2126 R + 0.7152 G + 0.0722 B. Alpha/dimensi dipertahankan. Source Culori deficiency.js menyebut
matriks berbasis Machado 2009; helper tersebut menerima komponen RGB, sehingga generator secara
eksplisit memasukkan komponen linear sebelum perkalian dan mengodekan hasil sesudahnya.
Self-check grayscale hitam/putih dan inspeksi gambar before/after dilakukan. Tidak ada klaim
conformance independen/klinis atau validasi engine Icul; sumber referensi ilmiah eksternal tidak
berhasil diambil saat audit. Seluruh transformasi ini hanya tooling fixture, bukan server production.

## Seluruh eksperimen live

Semua request memakai endpoint lokal asli port 3105 dan fixture sintetis.

| Attempt | Fixture/mode | HTTP | Before correct/total | After correct/total | Keterangan |
|---|---|---|---|---|---|
| 1 | Dua/Protan | 504 | — | — | AI_TIMEOUT; respons/usage provider tidak tersedia |
| 2 | Dua/Deutan | 200 | 2/2 | 2/2 | Sama; kedua payload blind dan scoring valid |
| 3 | Dua/Protan | 200 | 0/2 | 2/2 | Before dua uncertain, after dua correct |
| 4 | Dua/Tritan | 200 | 2/2 | 2/2 | Sama |
| 5 | Dua/Grayscale | 200 | 0/2 | 2/2 | Before dua uncertain, after dua correct |
| 6 | Empat/Grayscale | 200 | 0/3 | 3/3 | Before tiga uncertain, after tiga correct |
| 7 | Ordinal/Grayscale | 200 | 3/3 | 3/3 | Sama; label tingkat/wilayah sesuai ground truth |
| 8 | Dua/Deutan ulang | 200 | 2/2 | 2/2 | Pengulangan konfigurasi final valid |

Empat mode visual dua kategori memakai set ID/question/expectedAnswer identik. Semua tujuh
sukses lolos schema, kelengkapan ID, pemeriksaan scoring dan audit blind. Jawaban non-null pada
acceptance sukses sesuai ground truth; uncertain tidak dihitung correct dan tidak diisi tebakan.
Tidak ada klaim bahwa hasil selalu meningkat, atau bahwa performa model mewakili siswa CVD.

Attempt pertama mendapat AI_TIMEOUT sekitar 11 detik tanpa respons provider yang teramati.
GET katalog selanjutnya HTTP 200. Ditambahkan audit transport aman dan server direstart; percobaan
lain berhasil tanpa perubahan client/model/timeout atau retry produksi. Penyebab transport
spesifik tidak terbukti dan tidak ditebak. Runner awal juga gagal membaca file usage yang belum
terbentuk sehingga status ledger transport_error menyertai HTTP 504; runner diperbaiki agar
file yang tidak ada tidak menutupi error publik. Hasil dan reservasi awal tetap dipertahankan.

### Bukti independensi request

Observer manual pada 14 respons mencatat, tanpa raw prompt/image/key:

- hasExpectedAnswer=false; metadataKeys hanya questions; questionFields hanya id/question.
- imageCount=1 per call, digest SHA-256 cocok dengan file sebelum atau sesudah masing-masing.
- Dua call dalam satu evaluate memiliki instructionSha256 dan questionsSha256 identik.
- json_schema strict=true, max_tokens=2048, stream=false.
- Tepat dua respons provider per evaluate sukses, masing-masing requestId dan usage sendiri.

Audit hash tidak disisipkan ke respons API dan tidak aktif pada aplikasi biasa. Test mock juga
memeriksa tidak ada gambar silang, history/jawaban lama atau kunci yang disalin ke DTO.

### Contoh respons live nyata, attempt 3

```json
{
  "mode": "protan",
  "items": [
    {
      "question": {"id":"q1","question":"Batang mana yang mewakili kategori Jeruk?","expectedAnswer":"B"},
      "before": {"answer":null,"status":"uncertain"},
      "after": {"answer":"B","status":"correct"}
    },
    {
      "question": {"id":"q2","question":"Kategori apa yang diwakili batang A?","expectedAnswer":"Apel"},
      "before": {"answer":null,"status":"uncertain"},
      "after": {"answer":"Apel","status":"correct"}
    }
  ],
  "warnings": [
    "Uji Terbaca merupakan heuristik AI, bukan persepsi aktual siswa dengan CVD.",
    "Scoring memakai pencocokan persis setelah normalisasi; sinonim atau format berbeda dapat dinilai incorrect."
  ]
}
```

## Budget dan hasil otomatis

Delapan attempt x dua slot = **16/20 slot konservatif**. Empat belas call terkonfirmasi mempunyai
respons/usage. Delivery/billing dua percobaan awal tidak diketahui, sehingga tidak diasumsikan
gratis atau dikeluarkan dari budget. Usage teramati: **17.198 prompt + 405 completion = 17.603
token** pada 14 call; usage awal tidak tersedia. Empat slot tersisa tidak dipakai karena acceptance
sudah selesai. Tidak ada panggilan model untuk scoring, validasi, retry otomatis atau grading.

Ledger [hasil](./CosmosIn-Phase-5-live-results.json) dan [usage](./CosmosIn-Phase-5-usage.jsonl)
mencatat hasil nyata, termasuk kegagalan awal. Runner memakai flag/config eksplisit, bukan npm test,
dan menolak melampaui sepuluh evaluate/20 slot. Jangan reset ledger tanpa izin baru.

- npm.cmd run typecheck: PASS.
- npm.cmd run lint: PASS.
- npm.cmd test: PASS, 13 file / 437 test, seluruhnya mock. Basis 362 test Phase 1–4 tetap;
  hanya assertion evaluate belum tersedia diperbarui untuk perilaku baru. 75 test baru mencakup
  scoring dan evaluate.
- npm.cmd run build: PASS; /api/analyze dan /api/verify dynamic routes.
- npm.cmd run test:e2e: dijalankan, No tests found. Tidak ada klaim E2E PASS. Proses yang menunggu
  shutdown setelah pesan itu dihentikan.

Coverage mencakup NFC/case/whitespace, angka/unit/negatif/desimal/operator/ambigu/null, blind DTO,
ID asing/duplikat/hilang/reorder, seluruh pertanyaan per call, wire/JSON/narasi invalid, keempat
mode, input/limit/multipart invalid sebelum network, error masing-masing sisi, timeout, rate,
Request.signal, sibling cancellation, hasil after membaik/sama/memburuk, semua uncertain dan
kombinasi correct/incorrect/uncertain. Error tidak menghasilkan VerificationResult parsial.

## Handoff dan batas kesiapan

Prepare tetap action/image normal/mapping, array 2–3 soal/kunci yang harus ditinjau guru.
Satu set yang disetujui dipakai identik di keempat mode. Evaluate satu mode per request dengan
pasangan simulasi/skala/source revision yang sama; backend tidak dapat membuktikannya dari piksel.
Frontend menyimpan hasil/status per mode, melakukan retry eksplisit hanya mode gagal, mempertahankan
hasil sukses mode lain, dan membatalkan/mengabaikan response lama ketika revisi berubah.

Source/mapping berubah → invalidasi set terkait dan evaluate. Pattern berubah → invalidasi hasil
evaluate terkait, tanpa otomatis mengubah kunci sumber. Kunci/set berubah → invalidasi evaluate.
Download repair PNG normal tetap tersedia jika uji skipped/error; tidak diberi status lulus palsu.
Jumlah correct dihitung dari status item per sisi, tanpa menambah field skor HTTP atau skor klinis.

Backend Phase 5 siap menjadi dasar task integrasi Phase 6 terpisah; Phase 6 tidak dikerjakan.
Tidak ada blocker backend pada acceptance yang diuji. Integrasi aktual Icul/Rico/Nepa dan E2E
belum terbukti. Exact match dapat menilai sinonim/format ekuivalen incorrect; AI dapat salah
membaca/menebak meskipun prompt meminta null. Prompt injection tidak dijamin hilang. Review guru
atas set/kunci dan pelaporan hasil nyata tetap wajib.

Server audit port 3105 sudah dihentikan. Observer opsional hanya aktif pada proses audit tersebut;
tidak ada raw response capture baru, gambar pengguna, perubahan .env.local, atau storage production.
