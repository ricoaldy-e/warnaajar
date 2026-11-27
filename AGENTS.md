<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# WarnaAjar — aturan agent

> Dokumen konteks/PRD bersifat dinamis dan masih dapat berubah sesuai kesepakatan tim.
> Baca versi terbaru sebelum mengerjakan task.

## Baca dulu

1. `PRD.md` (scope MVP, kontrak antarmodul §8, aturan agent §1).
2. PRD modul yang dikerjakan: `docs/PRD-01-Icul.md` (warna), `docs/PRD-03-Rico.md` (repair),
   `docs/PRD-04-Nepa.md` (UI/integrasi). PRD modul 2 (AI & verifikasi) belum ada: pakai `PRD.md`.
3. `src/types/index.ts`: satu-satunya sumber tipe bersama. Jangan duplikasi atau ubah sepihak.

## Stack terkunci

Next.js App Router, React, TypeScript strict, Tailwind CSS, shadcn/ui, Lucide, Canvas API,
Culori, Zustand (tanpa persist), `@google/genai`, Zod, Vitest, Playwright.
Dependency baru butuh persetujuan tim. Tanpa database, ORM, auth, Docker, backend terpisah.

## Aturan

- Anti-overengineering: perubahan terkecil yang utuh; tanpa abstraksi/layer yang tidak diminta.
- Kerjakan hanya modul dan task yang diminta. P0 sebelum P1.
- Dilarang: `any`, mock/data dummy di jalur produksi, secret di client atau `NEXT_PUBLIC_*`.
- Cek dokumentasi library lewat Context7 MCP sebelum memakai API. Jika tidak tersedia,
  baca docs/types di `node_modules` dan beri tahu pengguna.
- Sebelum melapor selesai: `npm run typecheck`, `npm run lint`, `npm test`
  (plus `npm run build` dan `npm run test:e2e` saat integrasi). Laporkan hasil apa adanya.
- Dilarang commit, push, merge, atau deploy tanpa izin eksplisit.
