import 'server-only';
import { z } from 'zod';
import { analysisContextSchema, colorAnalysisSchema, confirmedMappingSchema, simulatedModeSchema } from './schemas';
import { verificationQuestionsSchema } from '@/modules/verification/schemas';

export const MAX_AI_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 3.5 * 1024 * 1024;
export const MAX_METADATA_BYTES = 64 * 1024;

const errors = {
  INVALID_INPUT: [400, 'Gambar atau metadata tidak valid.'],
  PAYLOAD_TOO_LARGE: [413, 'Ukuran gambar atau metadata melebihi batas yang diizinkan.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Gunakan multipart/form-data dengan gambar PNG atau JPEG.'],
  INSUFFICIENT_EVIDENCE: [422, 'Informasi gambar belum cukup untuk membuat pertanyaan yang valid.'],
  RATE_LIMITED: [429, 'Batas penggunaan layanan AI tercapai. Coba lagi nanti.'],
  AI_PROVIDER_ERROR: [502, 'Layanan AI belum dapat memproses permintaan.'],
  AI_INVALID_RESPONSE: [502, 'Hasil layanan AI tidak valid. Silakan coba lagi.'],
  AI_TIMEOUT: [504, 'Layanan AI melewati batas waktu. Silakan coba lagi.'],
  INTERNAL_ERROR: [500, 'Permintaan belum dapat diproses.'],
} as const;

export class Module2Error extends Error {
  constructor(readonly code: keyof typeof errors) {
    super(errors[code][1]);
    this.name = 'Module2Error';
  }
}

export function errorResponse(error: unknown): Response {
  const code = error instanceof Module2Error ? error.code : 'INTERNAL_ERROR';
  const [status, message] = errors[code];
  return Response.json({ error: { code, message } }, { status });
}

export async function readMultipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) throw new Module2Error('UNSUPPORTED_MEDIA_TYPE');
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new Module2Error('INVALID_INPUT');
    if (Number(length) > MAX_REQUEST_BYTES) throw new Module2Error('PAYLOAD_TOO_LARGE');
  }
  if (!request.body) throw new Module2Error('INVALID_INPUT');
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Module2Error('PAYLOAD_TOO_LARGE');
      }
      chunks.push(new Uint8Array(value));
    }
  } catch (error: unknown) {
    throw error instanceof Module2Error ? error : new Module2Error('INVALID_INPUT');
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new Module2Error('INVALID_INPUT');
  }
  let metadataBytes = 0;
  for (const value of form.values()) {
    if (typeof value === 'string') metadataBytes += Buffer.byteLength(value, 'utf8');
  }
  if (metadataBytes > MAX_METADATA_BYTES) throw new Module2Error('PAYLOAD_TOO_LARGE');
  return form;
}

function validateFields(form: FormData, files: readonly string[], required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...files, ...required, ...optional]);
  for (const name of [...files, ...required]) {
    if (!form.has(name)) throw new Module2Error('INVALID_INPUT');
  }
  for (const [name, value] of form.entries()) {
    const isFile = typeof value !== 'string';
    if (!allowed.has(name) || form.getAll(name).length !== 1 || isFile !== files.includes(name)) {
      throw new Module2Error('INVALID_INPUT');
    }
  }
}

export function parseJsonField<T>(form: FormData, name: string, schema: z.ZodType<T>): T {
  const entry = form.get(name);
  if (typeof entry !== 'string') throw new Module2Error('INVALID_INPUT');
  let value: unknown;
  try { value = JSON.parse(entry); } catch { throw new Module2Error('INVALID_INPUT'); }
  const result = schema.safeParse(value);
  if (!result.success) throw new Module2Error('INVALID_INPUT');
  return result.data;
}

export async function imageField(form: FormData, name: string): Promise<File> {
  const file = form.get(name);
  if (file === null || typeof file === 'string' || file.size === 0) throw new Module2Error('INVALID_INPUT');
  if (file.size > MAX_AI_IMAGE_BYTES) throw new Module2Error('PAYLOAD_TOO_LARGE');
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Module2Error('UNSUPPORTED_MEDIA_TYPE');
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const expected = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  if (!expected.every((byte, index) => signature[index] === byte)) throw new Module2Error('INVALID_INPUT');
  return file;
}

export async function parseAnalyzeRequest(request: Request) {
  const form = await readMultipart(request);
  validateFields(form, ['image'], ['analysis'], ['context']);
  return {
    image: await imageField(form, 'image'),
    analysis: parseJsonField(form, 'analysis', colorAnalysisSchema),
    ...(form.has('context') ? { context: parseJsonField(form, 'context', analysisContextSchema) } : {}),
  };
}

export async function parseVerifyRequest(request: Request) {
  const form = await readMultipart(request);
  if (form.get('action') === 'prepare') {
    validateFields(form, ['image'], ['action', 'mapping']);
    return {
      action: 'prepare' as const,
      image: await imageField(form, 'image'),
      mapping: parseJsonField(form, 'mapping', confirmedMappingSchema),
    };
  }
  if (form.get('action') === 'evaluate') {
    validateFields(form, ['before', 'after'], ['action', 'mode', 'questions']);
    const mode = simulatedModeSchema.safeParse(form.get('mode'));
    if (!mode.success) throw new Module2Error('INVALID_INPUT');
    return {
      action: 'evaluate' as const,
      before: await imageField(form, 'before'),
      after: await imageField(form, 'after'),
      mode: mode.data,
      questions: parseJsonField(form, 'questions', verificationQuestionsSchema),
    };
  }
  throw new Module2Error('INVALID_INPUT');
}
