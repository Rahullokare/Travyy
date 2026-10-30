import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { AiBusyError, configuredExtractors, extractFromPost } from './extract.ts';
import { isTrustedImageHost } from './images.ts';
import { fetchCaption, geocode } from './sources.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 60);
/** AI providers with keys, in fallback order. With none the server still serves /caption; /extract answers 503 and the app falls back. */
const EXTRACTORS = configuredExtractors();
const AI_ENABLED = EXTRACTORS.length > 0;
/** Comma-separated web origins allowed to call the API. Native apps send no Origin and are unaffected. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());

const HttpUrl = z.url({ protocol: /^https?$/ });
const ExtractRequest = z.object({
  url: HttpUrl.optional(),
  text: z.string().max(8000).optional(),
  /** The post's cover image, when the phone read it (Instagram blocks the server). Instagram/TikTok/YouTube CDNs only. */
  imageUrl: HttpUrl.optional(),
});
const CaptionRequest = z.object({ url: HttpUrl });

/** Text this short next to a link is share-sheet boilerplate or a title, not the caption. */
const SHORT_TEXT = 200;

function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields }));
}

// In-memory limiter: fine for one instance. Move to Redis/Upstash when running several.
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { n: 1, reset: now + 3_600_000 });
    return false;
  }
  entry.n += 1;
  return entry.n > RATE_LIMIT_PER_HOUR;
}

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  const allowed = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : '';
  return allowed
    ? {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      }
    : {};
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function clientIp(req: IncomingMessage): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

/** Rate-limit, read and validate a JSON body. Sends the error response itself and returns undefined on failure. */
async function readRequest<T>(req: IncomingMessage, res: ServerResponse, schema: z.ZodType<T>) {
  if (rateLimited(clientIp(req))) {
    send(req, res, 429, { error: 'Too many requests, try again later.' });
    return undefined;
  }
  let raw: unknown;
  try {
    raw = await readJson(req);
  } catch {
    send(req, res, 400, { error: 'Invalid JSON body' });
    return undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    send(req, res, 400, { error: z.prettifyError(parsed.error) });
    return undefined;
  }
  return parsed.data;
}

/** Fetch the post's caption and log where it came from (never the caption itself). */
async function lookupCaption(url: string) {
  const started = Date.now();
  const found = await fetchCaption(url);
  log(found.text ? 'info' : 'warn', 'caption_lookup', {
    host: new URL(url).hostname,
    source: found.source,
    chars: found.text?.length ?? 0,
    image: !!found.imageUrl,
    ms: Date.now() - started,
    ...found.detail,
  });
  return found;
}

async function handleCaption(req: IncomingMessage, res: ServerResponse) {
  const body = await readRequest(req, res, CaptionRequest);
  if (!body) return;
  const found = await lookupCaption(body.url);
  return send(req, res, 200, { caption: found.text ?? null, source: found.source });
}

async function handleExtract(req: IncomingMessage, res: ServerResponse) {
  if (!AI_ENABLED) return send(req, res, 503, { error: 'AI extraction is not configured on this server' });
  const body = await readRequest(req, res, ExtractRequest);
  if (!body) return;
  const { url, text } = body;

  const fetched = url && (!text || text.length < SHORT_TEXT) ? await lookupCaption(url) : undefined;
  const caption = [text, fetched?.text].filter(Boolean).join('\n').trim();
  const sentImage = body.imageUrl && isTrustedImageHost(body.imageUrl) ? body.imageUrl : undefined;
  const imageUrl = sentImage ?? fetched?.imageUrl;
  if (!caption && !imageUrl) return send(req, res, 200, { caption: null, places: [] });

  const started = Date.now();
  try {
    const {
      places: extracted,
      provider,
      failures,
      usedImage,
    } = await extractFromPost(EXTRACTORS, { caption, url, imageUrl });
    for (const f of failures) log('warn', 'ai_provider_failed', f);
    const places = [];
    for (const p of extracted.slice(0, 15)) {
      const hit = await geocode([p.name, p.city, p.country].filter(Boolean).join(', '));
      places.push({
        name: p.name,
        city: p.city ?? hit?.city ?? undefined,
        country: p.country ?? hit?.country ?? undefined,
        category: p.category,
        confidence: Math.min(1, Math.max(0, hit ? p.confidence : p.confidence * 0.5)),
        lat: hit?.lat,
        lng: hit?.lng,
        address: hit?.address,
      });
    }
    log('info', 'extract', {
      provider,
      usedImage,
      found: places.length,
      located: places.filter((p) => p.lat).length,
      ms: Date.now() - started,
    });
    return send(req, res, 200, { caption: caption || null, places });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof AiBusyError) {
      log('warn', 'ai_busy', { message });
      // 429, not 503: the app reads 503 as "this server has no AI" and stops asking.
      return send(req, res, 429, { error: 'AI is busy, retry shortly' });
    }
    log('error', 'extract_failed', { message });
    return send(req, res, 502, { error: 'AI extraction failed' });
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') return send(req, res, 200, { ok: true, ai: AI_ENABLED });
  if (req.method === 'POST' && req.url === '/extract') return void handleExtract(req, res);
  if (req.method === 'POST' && req.url === '/caption') return void handleCaption(req, res);
  return send(req, res, 404, { error: 'not found' });
});

server.listen(PORT, () =>
  log('info', 'listening', {
    port: PORT,
    aiProviders: EXTRACTORS.map((p) => p.name),
    instagramCaptions: (process.env.INSTAGRAM_CAPTIONS ?? 'on').toLowerCase() !== 'off',
  }),
);

// Let in-flight requests finish when the platform stops the container.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'shutting_down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
