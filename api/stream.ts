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

async function open(token: string): Promise<{ u?: string; r?: string } | null> {
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

async function proxied(absUrl: string, ref: string): Promise<string> {
  return `/api/stream?t=${await seal({ u: absUrl, r: ref })}`;
}

async function rewritePlaylist(text: string, baseUrl: string, ref: string): Promise<string> {
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
          out = out.replace(m[0], `URI="${await proxied(resolve(m[1]), ref)}"`);
        }
        return out;
      }
      return proxied(resolve(trimmed), ref);
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
    const text = await res.text();
    if (text.trimStart().startsWith('#EXTM3U')) {
      return new Response(await rewritePlaylist(text, res.url || upstream.toString(), ref), {
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
