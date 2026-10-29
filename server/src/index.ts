import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { extractPlaces } from './extract.ts';
import { fetchCaption, geocode } from './sources.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 60);
/** Comma-separated web origins allowed to call the API. Native apps send no Origin and are unaffected. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());

const ExtractRequest = z.object({
  url: z.url({ protocol: /^https?$/ }).optional(),
  text: z.string().max(8000).optional(),
});

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

async function handleExtract(req: IncomingMessage, res: ServerResponse) {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';
  if (rateLimited(ip)) return send(req, res, 429, { error: 'Too many requests, try again later.' });

  let raw: unknown;
  try {
    raw = await readJson(req);
  } catch {
    return send(req, res, 400, { error: 'Invalid JSON body' });
  }
  const parsed = ExtractRequest.safeParse(raw);
  if (!parsed.success) return send(req, res, 400, { error: z.prettifyError(parsed.error) });
  const { url, text } = parsed.data;

  const caption = [text, url && !text ? await fetchCaption(url) : undefined]
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!caption) return send(req, res, 200, { caption: null, places: [] });

  const started = Date.now();
  try {
    const extracted = await extractPlaces(caption, url);
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
      found: places.length,
      located: places.filter((p) => p.lat).length,
      ms: Date.now() - started,
    });
    return send(req, res, 200, { caption, places });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError)
      return send(req, res, 503, { error: 'AI is busy, retry shortly' });
    if (e instanceof Anthropic.APIError) {
      log('error', 'claude_api_error', { status: e.status, message: e.message });
      return send(req, res, 502, { error: 'AI extraction failed' });
    }
    log('error', 'extract_failed', { message: e instanceof Error ? e.message : String(e) });
    return send(req, res, 500, { error: 'Internal error' });
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') return send(req, res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/extract') return void handleExtract(req, res);
  return send(req, res, 404, { error: 'not found' });
});

server.listen(PORT, () => log('info', 'listening', { port: PORT }));

// Let in-flight requests finish when the platform stops the container.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log('info', 'shutting_down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
