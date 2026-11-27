// Preloader khusus proses dev audit. Tidak mencatat payload, key, prompt, atau response content.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (...args) {
  let response;
  try { response = await originalFetch(...args); }
  catch (error) {
    if (process.env.COSMOS_AUDIT_BLIND_CHECK === '1' && String(args[0]).startsWith('https://api.cosmosin.io/v1/chat/completions')) {
      const code = error?.cause?.code;
      appendFileSync(process.env.COSMOS_AUDIT_USAGE_FILE, JSON.stringify({ transportError: true,
        code: ['EACCES', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code) ? code : 'unrecognized',
      }) + '\n');
    }
    throw error;
  }
  if (String(args[0]).startsWith('https://api.cosmosin.io/v1/chat/completions')) {
    const result = await response.clone().json();
    let blindAudit;
    if (process.env.COSMOS_AUDIT_BLIND_CHECK === '1') {
      try {
        const body = JSON.parse(args[1].body);
        const parts = body.messages.find((message) => message.role === 'user').content;
        const metadata = JSON.parse(parts[1].text);
        const images = parts.filter((part) => part.type === 'image_url');
        const hash = (value) => createHash('sha256').update(value).digest('hex');
        blindAudit = {
          hasExpectedAnswer: args[1].body.includes('expectedAnswer'),
          metadataKeys: Object.keys(metadata),
          questionFields: [...new Set(metadata.questions.flatMap((question) => Object.keys(question)))].sort(),
          imageCount: images.length,
          imageSha256: hash(Buffer.from(images[0].image_url.url.split(',')[1], 'base64')),
          instructionSha256: hash(JSON.stringify([body.messages[0].content, parts[0].text])),
          questionsSha256: hash(parts[1].text),
          format: body.response_format.type, strict: body.response_format.json_schema.strict,
          max_tokens: body.max_tokens, stream: body.stream,
        };
      } catch { blindAudit = { auditUnavailable: true }; }
    }
    appendFileSync(process.env.COSMOS_AUDIT_USAGE_FILE ?? 'docs/CosmosIn-endpoint-usage.jsonl', JSON.stringify({
      requestId: response.headers.get('x-request-id'), status: response.status,
      usage: result.usage, finishReason: result.choices?.[0]?.finish_reason,
      ...(blindAudit ? { blindAudit } : {}),
    }) + '\n');
  }
  return response;
};
