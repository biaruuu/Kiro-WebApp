// Vercel Edge function: media proxy for HLS playlists, segments, mp4 and
// subtitle files.
//
// Stream providers require a specific Referer header, which browsers will not
// let a page set. The player therefore requests
//   /api/stream?url=<encoded upstream url>&ref=<encoded referer>
// and this function fetches the upstream with the right headers. HLS playlists
// are rewritten so every segment / key / sub-playlist also goes through here.
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

function proxied(absUrl: string, ref: string): string {
  return `/api/stream?url=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(ref)}`;
}

function rewritePlaylist(text: string, baseUrl: string, ref: string): string {
  const resolve = (u: string) => {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return u;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Tags that carry a URI="..." attribute (keys, maps, media, ...)
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          return `URI="${proxied(resolve(uri), ref)}"`;
        });
      }
      return proxied(resolve(trimmed), ref);
    })
    .join('\n');
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

  const target = self.searchParams.get('url');
  const ref = self.searchParams.get('ref') || '';
  if (!target) return new Response('Missing url', { status: 400 });

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
      return new Response(rewritePlaylist(text, res.url || upstream.toString(), ref), {
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
