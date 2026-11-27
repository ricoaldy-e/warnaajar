# WarnaAjar

Website untuk membantu pembuat materi menemukan dan memperbaiki hambatan penglihatan warna pada
visual pembelajaran (diagram, peta tematik, tabel berwarna). Alur: **Periksa → Pahami → Perbaiki
→ Uji**, lalu unduh PNG dengan penanda tambahan nonwarna. Kategori lomba: Quality Education (SDG 4).

> Status: scaffold awal. Fitur pada `PRD.md` belum diimplementasikan.

## Modul dan ownership

| Modul | Pemilik | Folder |
|---|---|---|
| 1. Image processing & color analysis | Icul | `src/modules/color-analysis/` |
| 2. AI semantic analysis & verification | Steven | `src/modules/ai-analysis/`, `src/modules/verification/`, `src/app/api/` |
| 3. Image repair & pattern engine | Rico | `src/modules/image-repair/` |
| 4. Frontend, UI/UX & integrasi | Nepa | `src/app/` (selain `api/`), `src/components/`, `src/stores/`, `public/`, `tests/e2e/` |

Bersama: `src/types/` (kontrak, `PRD.md` §8.1) dan `src/lib/`.
Detail: [PRD.md](PRD.md) dan folder [docs/](docs/).

## Setup lokal

Butuh Node.js **24.15+** (atau 22.22.2+).

```bash
npm install
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
npx playwright install chromium # sekali, untuk E2E
npm run dev                     # http://localhost:3000
```

Isi `.env.local`:

- `GEMINI_API_KEY`: API key Gemini (hanya dipakai di server, jangan di-commit).
- `GEMINI_MODEL`: ID model multimodal yang mendukung structured output.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm start` | Build dan jalankan produksi |
| `npm run typecheck` | Generate tipe route, lalu `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | E2E (Playwright); gagal "No tests found" selama belum ada test |

## Scope dan keterbatasan MVP

- Satu gambar PNG/JPEG per sesi, tanpa login, database, atau penyimpanan permanen.
- Targetnya visual berwarna datar. Foto, gradien/heatmap, dan ilustrasi kompleks tidak didukung.
- Analisis warna dan perbaikan berjalan di browser; untuk analisis AI, gambar dikirim lewat server
  ke Google Gemini.
- Bukan alat diagnosis buta warna dan tidak menjamin aksesibilitas bagi semua orang.
- Simulasi CVD adalah aproksimasi; Uji Terbaca adalah heuristik AI, bukan pengujian pada siswa.
