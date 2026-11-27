# Phase 4 — verification preparation

Tanggal: 28 November 2026, Asia/Jakarta. Owner: Steven.

## Hasil

POST /api/verify action=prepare bekerja melalui CosmosIn asli. Lima eksekusi konfigurasi final
lulus acceptance: 2 kategori, 4 kategori, peta ordinal, insufficient evidence dan fixture berulang.
Typecheck/lint/362 test mock/build lulus. E2E masih kosong. Phase 5/evaluate/scoring tidak dibuat.

Tidak ada perubahan analyze.ts, cosmos.ts, http.ts, shared types, requirement PRD atau HTTP contract.
Pekerjaan existing dan modul anggota lain dipertahankan. Context7 tidak tersedia; source/types
SDK OpenAI dan dokumentasi Next.js terpasang dipakai sebelum implementasi.

## Implementasi

- src/modules/verification/prepare.ts: prompt, request multimodal, satu panggilan completeJson,
  penanganan insufficient evidence, ID lokal dan validasi output publik.
- src/modules/verification/schemas.ts: preparationWireSchema internal ditambahkan, validator
  pertanyaan/evaluasi existing tetap tersedia.
- src/app/api/verify/route.ts: parseVerifyRequest → prepareQuestions → array JSON/errorResponse.
  Evaluate valid secara eksplisit ditolak dengan INTERNAL_ERROR 500 existing, tanpa provider.
- verification/__tests__/prepare.test.ts dan prepare-fixtures.ts: 45 test baru memakai mock transport.
- README Modul 2: kontrak, contoh live aktual, status Phase 3/4, limit dan handoff Nepa.
- scripts/create-prepare-fixtures.mts dan dua set SVG/PNG/JSON: peta ordinal dan insufficient.
  Fixture bar memakai semantic-two/semantic-four Phase 3; sharp existing tanpa dependency baru.
- scripts/prepare.live.ts + prepare-live.config.mts: runner eksplisit, terpisah dari npm test.
- scripts/observe-cosmos.mjs: tujuan file usage dapat dipilih melalui env, default Phase 3 tetap.
- Ledger docs/CosmosIn-Phase-4-live-results.json dan usage.jsonl: bukti request/token/hasil sintetis.

## Kontrak dan validasi

Multipart hanya action=prepare, image binary normal PNG/JPEG, mapping string JSON ConfirmedMapping.
Limit existing: 1.5 MiB/gambar, 3.5 MiB/body aktual, metadata agregat 64 KiB. Mapping 1–4 included,
excluded tidak dihitung; label, ID unik dan order diperiksa sebelum network. Tidak ada session
server atau daftar swatch tersimpan. Referensi mapping terhadap swatch aktif tetap milik Nepa.

Wire object strict required:

```json
{"status":"ok","questions":[{"question":"...","expectedAnswer":"..."}]}
```

Status ok wajib 2–3 item valid dan unik setelah normalisasi whitespace/kapitalisasi. Semua kunci
nonkosong, foreign fields ditolak. Insufficient evidence hanya valid jika status insufficient_evidence
dan questions=[]; hasilnya HTTP 422 INSUFFICIENT_EVIDENCE. Bentuk/status tidak konsisten atau
malformed JSON menjadi 502 AI_INVALID_RESPONSE. Tidak menyamakan malformed dengan bukti kurang.

ID q1/q2/q3 dibuat lokal berdasarkan urutan. Whitespace tepi dipangkas, lalu array publik divalidasi
kembali dengan verificationQuestionsSchema. Respons sukses VerificationQuestion[] langsung,
tanpa wrapper questions/data/success. ID tidak menjamin redaksi/urutan sama pada panggilan ulang.

## Prompt dan konfigurasi

Konfigurasi Phase 3 dipakai tanpa perubahan fondasi: CosmosIn deepseek-v4.1-flash, OpenAI SDK,
JSON Schema strict, max_tokens=2048, timeout 45 detik, retry=0, stream=false.
Tugas lengkap + schema pada text part user, metadata mapping pada text part terpisah, image_url
base64 terakhir; pesan system pendamping. Test transport memastikan schema prompt identik dengan
schema SDK. Metadata/gambar tidak diinterpolasi sebagai instruksi aplikasi; tidak ada kunci/secret
di prompt selain kunci pertanyaan yang memang dihasilkan untuk ditinjau guru.

Pertanyaan harus menguji relasi kategori included dengan lokasi/nilai/tingkat pada gambar.
Model dilarang memakai pengetahuan luar, angka hipotetis, mengarang legenda, meminta ΔE/pola,
menghasilkan pembahasan, atau membocorkan kunci dalam pertanyaan. Color ID tidak mengandung
informasi hex yang boleh ditebak. Jika minimal dua pertanyaan tidak dapat dibuktikan, kembalikan
insufficient_evidence. Tidak ada pemanggilan model untuk validasi/repair/grading tambahan.

## Seluruh eksperimen live

Semua panggilan melalui endpoint Next.js asli pada port 3104, memakai fixture sintetis.
Observer mencatat tepat satu panggilan provider pada setiap operasi; tidak mencatat payload/key/image.

| Call | Fixture | HTTP / jumlah soal | Review ground truth dan relevansi |
|---|---|---|---|
| 1 | Bar dua kategori | 200 / 3 | A→Apel, B→Jeruk; Jeruk lebih tinggi. PASS |
| 2 | Bar empat kategori | 200 / 3 | A→Apel, D→Anggur, C→Melon. PASS |
| 3 | Peta ordinal | 200 / 3 | Risiko tertinggi→Selatan, Utara→Rendah, Sedang→Tengah. PASS |
| 4 | Data tidak tersedia | 422 / 0 | Tidak ada legenda/nilai, tidak ada kunci palsu. PASS |
| 5 | Ulang bar dua kategori | 200 / 3 | Kunci benar, tetapi q3 hanya tinggi A/B tanpa kategori: FAIL relevansi |
| 6 | FINAL bar dua kategori | 200 / 3 | Apel→A, B→Jeruk, Jeruk→B. PASS |
| 7 | FINAL bar empat kategori | 200 / 3 | A→Apel, C→Melon, D→Anggur. PASS |
| 8 | FINAL peta ordinal | 200 / 3 | Utara→Rendah, Sedang→Tengah, Selatan→Tinggi. PASS |
| 9 | FINAL Data tidak tersedia | 422 / 0 | Insufficient evidence jujur, tanpa pertanyaan palsu. PASS |
| 10 | FINAL ulang bar dua kategori | 200 / 2 | Jeruk→B, A→Apel. PASS |

Masalah call 5 tidak disembunyikan. Prompt diperketat: setiap item harus menyebut kategori included
pada pertanyaan atau kunci berupa label kategori, dan tidak menambah pertanyaan tinggi kode/bentuk
tanpa relasi kategori hanya demi mencapai tiga item. Kelima acceptance diulang dengan prompt final.
Regression memeriksa instruksi ini tetap ada pada request. Runtime schema tidak mengklaim mampu
menilai semantik pertanyaan; tidak ditambahkan parser heuristik atau AI grader.

Ground truth bar: dua kategori A=Apel/hijau, B=Jeruk/merah, B lebih tinggi; empat kategori
A=Apel/hijau, B=Jeruk/merah, C=Melon/biru, D=Anggur/kuning. Grafik ini tidak memiliki skala
angka yang dapat dijadikan kunci numerik, dan final tidak mengarang nilai numerik.
Ground truth map: Utara=Rendah/hijau, Tengah=Sedang/kuning, Selatan=Tinggi/merah; urutan 1/2/3.
Gambar insufficient hanya teks Data tidak tersedia. Expected/groundTruth hanya dipakai untuk
review setelah respons, tidak dikirim ke model. Metadata request hanya mapping.

Contoh respons live final call 10, persis:

```json
[
  {"id":"q1","question":"Batang mana yang mewakili kategori Jeruk?","expectedAnswer":"B"},
  {"id":"q2","question":"Kategori apa yang diwakili batang A?","expectedAnswer":"Apel"}
]
```

## Pemeriksaan otomatis dan budget

- npm.cmd run typecheck: PASS.
- npm.cmd run lint: PASS.
- npm.cmd test: PASS, 11 file / 362 test; 45 test baru Phase 4, seluruh regression existing tetap.
- npm.cmd run build: PASS, /api/analyze dan /api/verify tercantum sebagai dynamic routes.
- npm.cmd run test:e2e: dijalankan, No tests found; tidak diklaim lulus. Proses yang menunggu
  shutdown dihentikan setelah kegagalan tersebut. Tidak menambah frontend/E2E di luar scope.

Coverage baru: dua/tiga soal, schema object strict, konsistensi status/questions, kunci/soal kosong,
duplikasi, narasi/JSON malformed, schema invalid, stable IDs, trim, mapping 2/4 + excluded, mapping
5/ordinal/ID invalid sebelum network, multipart/MIME/signature/limit invalid, provider/timeout/rate,
error publik, exactly one call, metadata injection separation dan evaluate belum tersedia.

**10/10 paid model calls**, terpisah dari budget Phase 3. Usage teramati:
**13.783 prompt + 667 completion = 14.450 token**. Tidak ada retry otomatis atau call tambahan.
Budget habis setelah seluruh acceptance final selesai; tidak ada call berikutnya.
Ledger mencatat requestId, status, token usage dan review aktual, tanpa kredensial atau data pengguna.
Runner menolak ketika ledger mencapai sepuluh; jangan reset tanpa izin baru.

Server audit port 3104 dihentikan. Tidak ada penyimpanan gambar/raw prompt pada production,
capture raw response tidak diaktifkan kembali, .env.local tidak diubah. Tidak commit/push/deploy.

## Handoff dan kesiapan Phase 5

Phase 4 selesai pada fixture yang diuji. Nepa perlu memvalidasi satu visual dan referensi swatch,
menampilkan 2–3 soal/kunci untuk review/koreksi guru, dan menyimpan satu set pada revisi sesi.
Mengubah sumber/mapping membatalkan set lama. Reprepare dapat menghasilkan soal/urutan berbeda;
kedua eksekusi final valid tetapi tidak dijanjikan identik. Error prepare tidak menghapus repair
valid atau mengunci download. 422 berarti belum ada set yang dapat dipercaya, bukan skor nol.

Phase 5 siap dikerjakan sebagai task terpisah. Belum ada evaluate, penjawaban before/after,
normalisasi/perbandingan jawaban, scoring atau orkestrasi empat mode. Evaluate valid saat ini
mengembalikan 500 INTERNAL_ERROR aman tanpa provider; ini bukan kontrak error baru atau hasil palsu.

Batasan: grounding, bahasa, keterbacaan dan relevansi semantik tidak dapat dibuktikan oleh Zod.
Call 5 menunjukkan perlunya review guru. Prompt injection tidak dijamin hilang. Kunci pendek
mempermudah perbandingan deterministik nanti, tetapi jawaban sinonim tetap keterbatasan Phase 5.
Tidak ada klaim performa seluruh gambar, kebal prompt injection, atau peningkatan aksesibilitas klinis.
