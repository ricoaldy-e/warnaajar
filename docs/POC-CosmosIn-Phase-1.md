# Modul 2 — POC CosmosIn, Fase 1

Owner: Steven. Script manual di `scripts/poc-cosmos.mts`; fixture buatan sendiri di
`scripts/fixtures/cosmos-chart.png`. Keduanya terpisah dari produksi dan `npm test`.
Tidak ada API route, production client, dependency baru, atau perubahan shared types.

## Menjalankan

Jalankan dari root repository dengan Node.js yang mendukung TypeScript native dan `--env-file`
(lingkungan pengembangan saat implementasi: Node 24.11). Tidak perlu `tsx` atau dependency baru.

Pemeriksaan lokal, tanpa memuat secret atau menghubungi jaringan:

```powershell
node scripts/poc-cosmos.mts --check
```

POC berbayar, **hanya dijalankan manual oleh pemilik key**:

```powershell
node --env-file=.env.local scripts/poc-cosmos.mts --live
```

Script membaca `COSMOS_API_KEY`, `COSMOS_BASE_URL`, dan `COSMOS_MODEL` dari environment.
Base URL harus `https://api.cosmosin.io/v1` dan model harus `deepseek-v4.1-flash`.
Environment yang sudah diekspor ke shell memiliki prioritas atas `--env-file` Node;
pastikan konfigurasi shell sesuai tanpa mencetak key. Script tidak mengubah `.env.local`.

Tanpa flag, script hanya menampilkan petunjuk dan status NOT RUN. Jangan menambahkan POC ke
`npm test`, hook, CI, atau import produksi. Menjalankan ulang `--live` berarti rangkaian berbayar baru.

## Batas dan urutan panggilan

Maksimum **empat panggilan model per proses**. SDK memakai `maxRetries: 0`,
`stream: false`, timeout 45 detik per request, dan `max_tokens: 2048` per request.
Parameter diperbarui sesudah audit live Phase 3: max_completion_tokens=16 menghasilkan 298 token,
sedangkan max_tokens=16 berhenti tepat pada 16. Baseline ulang audit sebelum perubahan parameter
lulus 4/4; detail ada di CosmosIn-Phase-3-Live-Audit.md.
Batas ini khusus POC, belum menjadi limit produksi atau jaminan batas tagihan uang.
Tidak ada permintaan katalog model, fallback, atau pemanggilan penilai tambahan.

| Urutan | Capability | Request dan kriteria PASS |
|---|---|---|
| 1 | Text Completion | Meminta balasan Indonesia `Siap`; response berhasil, selesai, tidak kosong, dan balasan cocok. |
| 2 | Vision | Gambar melalui `image_url` dengan base64 data URL, tanpa `response_format`; JSON berbasis instruksi lolos Zod dan seluruh pembandingan ground truth. |
| 3 | JSON Object | Gambar dan prompt yang sama dengan `response_format: json_object`; lolos Zod dan ground truth. |
| 4 | JSON Schema | Gambar dan prompt yang sama dengan JSON Schema strict dari schema Zod; lolos Zod dan ground truth. |

Text gagal: hentikan seluruh probe berikutnya. Vision gagal: hentikan dan laporkan blocker;
tidak mengganti model/provider. JSON Object gagal tetap mengizinkan satu probe JSON Schema.
JSON Object PASS dan JSON Schema FAIL dilaporkan sebagai kandidat JSON Object + Zod untuk produksi.

PASS mengharuskan format **dan** jawaban benar. HTTP 200 saja tidak cukup. Vision tanpa
`response_format` juga memerlukan JSON sesuai instruksi: jika format ini gagal, hasilnya berarti
probe vision belum lolos, bukan bukti pasti model tidak menerima gambar. Periksa output dan
penyebabnya sebelum memutuskan langkah berikutnya; tidak ada retry otomatis untuk membedakannya.

Exit code 0: seluruh probe live PASS, atau pemeriksaan offline berhasil.
Exit code 1: konfigurasi/fixture invalid, atau ada probe live FAIL/NOT RUN.

## Fixture dan ground truth lokal

PNG RGB 1000×700, judul **Hasil panen kebun sekolah**, satuan keranjang. Semua data terlihat
di gambar. Urutan legenda berbeda dari urutan batang; label kategori hanya ada di legenda.
Model harus mencocokkan warna dengan kategori, membaca nilai, lalu menghitung total.

| Posisi batang | Warna | Kategori | Nilai |
|---|---|---|---:|
| A | Biru `#3869C5` | Salak | 7 |
| B | Merah `#D64545` | Duku | 4 |
| C | Hijau `#20815A` | Sawo | 11 |

Jenis visual `bar`, jenis data `categorical`, kategori tertinggi Sawo, total 22.
Urutan legenda: Sawo, Duku, Salak. POC membandingkan nama warna dasar dan label, tanpa menuntut
model menebak hex persis. Urutan array diabaikan; kapitalisasi/whitespace tepi dinormalisasi.
Sinonim nama warna belum dinormalisasi, sehingga output perlu diperiksa manual jika berbeda.

Ground truth hanya disimpan pada pembanding lokal dan dokumen ini. Request tidak mengirim nama
kategori, nilai, pasangan legenda, maupun jawaban yang diharapkan sebagai teks. Prompt hanya
berisi instruksi umum dan schema tanpa contoh jawaban. Teks gambar diperlakukan sebagai data.
Schema POC bukan `SemanticAnalysis` penuh: ia menambahkan pembacaan batang dan total khusus
pembuktian kemampuan. Enum jenis visual/data menggunakan tipe dari `src/types/index.ts`.
Jangan memakai schema POC sebagai kontrak produksi.

## Laporan hasil

Setiap probe yang dijalankan mencetak capability, PASS/FAIL, HTTP status bila tersedia, output
model terbatas 4000 karakter, hasil validasi Zod, pembandingan setiap field ground truth,
latency, token usage bila tersedia, dan pesan error aman. Tabel akhir juga mencantumkan NOT RUN.
HTTP status null berarti tidak tersedia, bukan HTTP 0. SDK logging dimatikan; key, bearer token,
dan data URL gambar disamarkan. Pesan mentah error provider, headers, dan stack tidak dicetak.

Token usage dilaporkan dari provider dan bukan estimasi harga. Jangan menafsirkan output
terpotong (`finish_reason: length`) sebagai jawaban valid. Jika perlu menaikkan budget token,
review hasil dan sepakati perubahan secara eksplisit sebelum menjalankan lagi.

**Status live saat implementasi Fase 1:** belum dijalankan. Text Completion, Vision, JSON Object,
dan JSON Schema semuanya **NOT RUN**. Pemeriksaan offline bukan bukti kapabilitas model.
Setelah eksekusi manual, tinjau output, ground truth, latency, serta token usage sebelum Fase 2.

**Pembaruan dari laporan owner pada instruksi Fase 2:** keempat probe live sudah direview dan
PASS, seluruhnya HTTP 200: Text 1592 ms, Vision 2892 ms, JSON Object 1842 ms, JSON Schema 1477 ms.
Validasi Zod dan seluruh pembandingan ground truth PASS; total panggilan 4/4. JSON Schema
disetujui untuk Fase 2. Angka ini berasal dari laporan owner; agent tidak mengulang request live.

Pemeriksaan implementasi yang sudah dijalankan tanpa API berbayar:

- `node scripts/poc-cosmos.mts --check`: PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd test`: PASS, 3 file / 71 test existing. POC tidak dimasukkan ke test suite.
- Harness sementara dengan `fetch` tiruan: 17 skenario PASS, mencakup tanpa flag, check offline,
  env invalid, empat response sukses, autentikasi, vision gagal, saldo, JSON Schema ditolak,
  JSON invalid, ground truth salah, schema salah, output terpotong/kosong, timeout, serta
  redaksi key/data URL/base64 mentah dari output model.
  Harness memeriksa endpoint/model, payload gambar, prompt tanpa kunci, maksimal empat panggilan,
  penghentian dini, serta tidak adanya key/base64 pada log. Tidak ada request jaringan sungguhan.

PowerShell host memblokir launcher `npm.ps1`; pemeriksaan berhasil melalui `npm.cmd`
tanpa mengubah execution policy. Build/E2E tidak dijalankan karena fase ini belum mengintegrasikan aplikasi.

## Alignment kontrak — masih memerlukan koordinasi

Acuan: `CONTRACTS.md` v1.0, Master PRD §8, PRD Steven, dan `src/types/index.ts`.
Dokumen kontrak masih menyatakan baseline/usulan, bukan seluruh detail yang sudah dikunci.

| Bagian | Kondisi aktual dan keputusan tertunda |
|---|---|
| Analyze | Kandidat `image`, `analysis`, `context?` sesuai CONTRACTS §5.1. `analysis` adalah JSON `ColorAnalysisResult`; context dalam kontrak diusulkan berbentuk subject/grade. |
| Prepare | CONTRACTS §5.2 hanya memuat `action`, `image`, `mapping`. Kandidat tugas menambah `analysis` untuk membawa swatch/conflicts serta memungkinkan server memvalidasi ID dan memprioritaskan kategori konflik. **Tambahan ini masih memerlukan persetujuan integrasi Nepa.** Paragraf kontrak yang saat ini menyerahkan validasi referensi ID kepada client juga perlu diselaraskan jika tambahan disetujui. |
| Evaluate | Kandidat `action`, `before`, `after`, `mode`, `questions` sesuai CONTRACTS §5.3. Gunakan `before`/`after`, bukan nama kandidat lama `beforeImage`/`afterImage`. |
| Metadata | File tetap binary multipart; `analysis`, `mapping`, `context`, `questions` berupa string JSON. `action` dan `mode` berupa string literal, mengikuti CONTRACTS. |
| Shared types | Seluruh tipe inti di CONTRACTS §2 cocok dengan `src/types/index.ts`. `ConfirmedMapping`, `AnalysisContext`, dan `ApiErrorResponse` pada §2.1 belum tersedia di shared types; jangan mendefinisikan ulang atau menambahkannya sepihak. Usulan mapping membungkus dataType dan categories, bukan array kategori saja. |
| Lokasi tipe | CONTRACTS menyebut rekomendasi `src/types/warnaajar.ts` atau lokasi existing; lokasi nyata adalah `src/types/index.ts`. Tetap gunakan lokasi existing. |
| Provider/env | CONTRACTS, PRD, AGENTS, README root, dan `.env.example` masih menyebut Gemini. Instruksi pemilik task menetapkan CosmosIn/OpenAI SDK dan tiga env COSMOS. Dokumen bersama, env example, dan dependency Gemini tidak diubah dalam Fase 1. |
| Invariant | Urutan ordinal 1..N, mapping seluruh swatch, uppercase hex, dan aturan ambang pada CONTRACTS masih usulan; tidak dikunci lewat POC. |
| Rico | Signature ilustratif CONTRACTS §4.2 berbeda dari API existing `src/modules/image-repair/README.md` (termasuk return warnings dan argumen terpisah). Koordinasikan dengan Rico/Nepa; POC tidak memanggil atau mengubah engine. |
| Kunci tidak pasti | Shared `VerificationQuestion` tidak memiliki flag validitas. CONTRACTS sudah mengusulkan error 422 `INSUFFICIENT_EVIDENCE` jika prepare tak dapat menghasilkan pertanyaan valid. Sepakati kode/perilaku bersama Nepa sebelum implementasi. |

## Keputusan sebelum Fase 2

1. Periksa hasil POC live dan pilih format output yang benar-benar lolos. Bila vision gagal,
   laporkan blocker; perubahan provider/model memerlukan keputusan baru.
2. Persetujuan Nepa untuk tambahan `analysis` di prepare dan penempatan wrapper mapping/context
   yang belum menjadi shared types. Endpoint dan shared types tidak berubah dalam Fase 1.
3. Sepakati payload maksimum, resolusi salinan AI, timeout produksi, token budget, error code,
   serta aturan validasi mapping. Angka POC bukan default produksi.
4. Persetujuan melanjutkan Fase 2. Tidak ada pekerjaan fase lanjutan dalam perubahan ini.
