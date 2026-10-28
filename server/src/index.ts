import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { extractPlaces } from './extract.ts';
import { fetchCaption, geocode } from './sources.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 32 * 1024;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR ?? 60);

const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 3_600_000 });
    return false;
  }
  h.n += 1;
  return h.n > RATE_LIMIT;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/extract') return send(res, 404, { error: 'not found' });

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '?';
  if (rateLimited(ip)) return send(res, 429, { error: 'Too many requests, try again later.' });

  let body: { url?: unknown; text?: unknown };
  try {
    body = (await readJson(req)) as typeof body;
  } catch {
    return send(res, 400, { error: 'Invalid JSON body' });
  }
  const url = typeof body.url === 'string' && /^https?:\/\//.test(body.url) ? body.url : undefined;
  const text = typeof body.text === 'string' ? body.text.slice(0, 8000) : undefined;

  const caption = [text, url && !text ? await fetchCaption(url) : undefined].filter(Boolean).join('\n').trim();
  if (!caption) return send(res, 200, { caption: null, places: [] });

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
        confidence: hit ? p.confidence : p.confidence * 0.5,
        lat: hit?.lat,
        lng: hit?.lng,
        address: hit?.address,
      });
    }
    return send(res, 200, { caption, places });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return send(res, 503, { error: 'AI is busy, retry shortly' });
    if (e instanceof Anthropic.APIError) {
      console.error(`Claude API error ${e.status}:`, e.message);
      return send(res, 502, { error: 'AI extraction failed' });
    }
    console.error(e);
    return send(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => console.log(`Travyy API listening on :${PORT}`));
