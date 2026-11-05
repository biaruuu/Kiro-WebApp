// Vercel Edge function: media proxy for HLS playlists, segments, mp4 and
// subtitle files.
//
// Stream providers require a specific Referer header, which browsers will not
// let a page set. The player therefore requests
//   /api/stream?t=<sealed token>
// where the token (minted by /api/src, AES-GCM sealed) holds the upstream url
// and referer, so neither ever appears in the browser. HLS playlists are
// rewritten so every segment / key / sub-playlist also goes through here as a
// fresh token.
//
// Abuse protection: only requests coming from this same site are served, and
// private / loopback / IP-literal hosts are refused.

export const config = { runtime: 'edge' };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 literal
  if (h.includes(':') || h.startsWith('[')) return true; // IPv6 literal
  return false;
}

// --- token sealing (must match api/src.ts) ----------------------------------
const SECRET = process.env.SRC_SECRET?.trim() || 'animallu-private-gateway-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: Uint8Array) => {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (str: string) => {
  const p = str.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

let keyPromise: Promise<CryptoKey> | null = null;
const getKey = () =>
  (keyPromise ??= crypto.subtle
    .digest('SHA-256', enc.encode(`src:${SECRET}`))
    .then((h) => crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt'])));

async function seal(payload: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getKey(),
    enc.encode(JSON.stringify(payload)),
  );
  const out = new Uint8Array(iv.length + data.byteLength);
  out.set(iv);
  out.set(new Uint8Array(data), iv.length);
  return toB64(out);
}

async function open(token: string): Promise<{ u?: string; r?: string; k?: string } | null> {
  try {
    const raw = fromB64(token);
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12) },
      await getKey(),
      raw.slice(12),
    );
    return JSON.parse(dec.decode(data));
  } catch {
    return null;
  }
}

async function proxied(absUrl: string, ref: string, key?: string): Promise<string> {
  return `/api/stream?t=${await seal(key ? { u: absUrl, r: ref, k: key } : { u: absUrl, r: ref })}`;
}

// --- FlixCloud playback (ReAnime) -------------------------------------------------
// Some manifests come back as Base64 + XOR instead of plain "#EXTM3U"; the API hands
// out the key (`playlist_key`) for them. Image-wrapped segments (.png/.webp) are
// unwrapped before they reach the player. Both follow the upstream API's own docs.
function decryptManifest(body: string, playlistKey: string): string | null {
  try {
    const key = fromB64(playlistKey);
    const payload = fromB64(body.trim().replace(/\s+/g, ''));
    const out = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ key[i % key.length];
    const text = dec.decode(out).trim();
    return text.startsWith('#EXTM3U') ? text : null;
  } catch {
    return null;
  }
}

const SEGMENT_XOR = Uint8Array.from([157, 42, 241, 71, 179, 142, 92, 112, 166, 25, 228, 59, 216, 98, 15, 197]);

function unwrapImageSegment(body: Uint8Array): Uint8Array | null {
  let offset = 0;
  const isWebp =
    body.length > 12 &&
    body[0] === 0x52 && body[1] === 0x49 && body[2] === 0x46 && body[3] === 0x46 &&
    body[8] === 0x57 && body[9] === 0x45 && body[10] === 0x42 && body[11] === 0x50;
  const isPng =
    body.length > 8 &&
    body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47 &&
    body[4] === 0x0d && body[5] === 0x0a && body[6] === 0x1a && body[7] === 0x0a;
  if (isWebp) offset = 12;
  else if (isPng) offset = 8;
  if (!offset) return null;
  const out = body.slice(offset);
  if (out[0] !== 0x47) for (let i = 0; i < out.length; i++) out[i] ^= SEGMENT_XOR[i % SEGMENT_XOR.length];
  return out;
}

async function rewritePlaylist(text: string, baseUrl: string, ref: string, key?: string): Promise<string> {
  const resolve = (u: string) => {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return u;
    }
  };
  const lines = await Promise.all(
    text.split(/\r?\n/).map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Tags that carry a URI="..." attribute (keys, maps, media, ...)
        const uris = [...line.matchAll(/URI="([^"]+)"/g)];
        if (!uris.length) return line;
        let out = line;
        for (const m of uris) {
          out = out.replace(m[0], `URI="${await proxied(resolve(m[1]), ref, key)}"`);
        }
        return out;
      }
      return proxied(resolve(trimmed), ref, key);
    }),
  );
  return lines.join('\n');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const self = new URL(req.url);
  const fromSameSite =
    hostOf(req.headers.get('referer')) === self.host ||
    req.headers.get('sec-fetch-site') === 'same-origin';
  if (!fromSameSite) {
    return new Response('Forbidden', { status: 403 });
  }

  const token = self.searchParams.get('t');
  if (!token) return new Response('Missing token', { status: 400 });
  const opened = await open(token);
  const target = opened?.u;
  const ref = opened?.r || '';
  const key = opened?.k || '';
  if (!target) return new Response('Invalid token', { status: 400 });

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (upstream.protocol !== 'https:' && upstream.protocol !== 'http:') {
    return new Response('Invalid protocol', { status: 400 });
  }
  if (isBlockedHost(upstream.hostname)) {
    return new Response('Host not allowed', { status: 403 });
  }

  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
  if (ref) {
    headers['Referer'] = ref;
    try {
      headers['Origin'] = new URL(ref).origin;
    } catch {
      /* ignore bad referer */
    }
  }
  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

  let res: Response;
  try {
    res = await fetch(upstream.toString(), { headers, redirect: 'follow' });
  } catch (e: any) {
    return new Response(`Upstream error: ${e?.message ?? e}`, { status: 502 });
  }

  const contentType = res.headers.get('content-type') || '';
  const looksLikePlaylist =
    /mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(upstream.pathname + upstream.search);

  if (looksLikePlaylist && res.ok) {
    let text = await res.text();
    if (key && !text.trimStart().startsWith('#EXTM3U')) text = decryptManifest(text, key) ?? text;
    if (text.trimStart().startsWith('#EXTM3U')) {
      return new Response(await rewritePlaylist(text, res.url || upstream.toString(), ref, key || undefined), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
        },
      });
    }
    // Not actually a playlist: return as-is.
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': contentType || 'text/plain' },
    });
  }

  // image-wrapped segments (only for tokens that carry a FlixCloud key)
  if (key && res.ok && req.method === 'GET' && /\.(png|webp|jpe?g)(\?|$)/i.test(upstream.pathname + upstream.search)) {
    const raw = new Uint8Array(await res.arrayBuffer());
    const clean = unwrapImageSegment(raw);
    return new Response(clean ?? raw, {
      status: 200,
      headers: {
        'Content-Type': clean ? 'video/mp2t' : contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const out = new Headers();
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  // Segments/subtitles are immutable per signed URL; let the edge cache them.
  out.set('Cache-Control', res.ok ? 'public, max-age=3600' : 'no-store');
  return new Response(req.method === 'HEAD' ? null : res.body, {
    status: res.status,
    headers: out,
  });
}
