import { MAX_BODY_BYTES, type Body } from '@ngapi/protocol';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const TEXTUAL_MIME_RE = /json|text\/|xml|javascript|x-www-form-urlencoded|graphql/i;

export function mimeOf(contentType: string | null | undefined): string | null {
  const m = contentType?.split(';')[0].trim().toLowerCase();
  return m || null;
}

export function isTextualMime(mime: string | null): boolean {
  return mime === null || (TEXTUAL_MIME_RE.test(mime) && mime !== 'text/event-stream');
}

/** Text body: JSON when the mime says so or the text parses as an object/array. */
export function textBody(text: string, mime: string | null, fullSize?: number): Body {
  const keptBytes = encoder.encode(text).length;
  const size = fullSize ?? keptBytes;
  const truncated = text.length > MAX_BODY_BYTES || size > keptBytes;
  const kept = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
  const kind = (mime && /json/i.test(mime)) || looksLikeJson(kept) ? 'json' : 'text';
  return { kind, text: kept, size, truncated };
}

function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Formats any XHR/fetch request body (string, FormData, URLSearchParams, Blob, buffers...). */
export function requestBody(body: unknown): Body {
  if (body === null || body === undefined) return { kind: 'none' };
  if (typeof body === 'string') return textBody(body, null);
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { kind: 'form', entries: [...body], size: encoder.encode(body.toString()).length };
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    let size = 0;
    const entries: [string, string][] = [];
    for (const [k, v] of body) {
      if (typeof v === 'string') {
        entries.push([k, v]);
        size += v.length;
      } else {
        entries.push([k, `[File ${v.name} · ${v.type || 'unknown'} · ${v.size} B]`]);
        size += v.size;
      }
    }
    return { kind: 'form', entries, size };
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) return { kind: 'binary', mime: body.type || null, size: body.size };
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return { kind: 'binary', mime: null, size: (body as ArrayBuffer).byteLength };
  }
  return textBody(String(body), null);
}

/** Reads at most MAX_BODY_BYTES from a stream without consuming more than needed. */
export async function readCapped(stream: ReadableStream<Uint8Array>): Promise<{ text: string; size: number; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let kept = 0;
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (kept < MAX_BODY_BYTES) {
      const slice = value.subarray(0, MAX_BODY_BYTES - kept);
      chunks.push(slice);
      kept += slice.length;
    }
  }
  const all = new Uint8Array(kept);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return { text: decoder.decode(all), size, truncated: size > kept };
}
