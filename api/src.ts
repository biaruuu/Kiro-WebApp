// Vercel serverless function: private gateway to the streaming backend.
//
// The browser never talks to the upstream streaming API (or to any media
// host) directly. It only calls this function, which
//   * renames every upstream provider to an invented name,
//   * replaces upstream episode ids / media URLs with sealed (AES-GCM) tokens
//     that only this deployment can open,
//   * strips download links, headers and any other third-party details.
//
//   GET /api/src?k=eps&id=<anilistId>   -> { <alias>: { episodes: { sub, dub } } }
//   GET /api/src?k=watch&t=<token>      -> { streams, subtitles, ... }  (media via /api/stream?t=)
//   GET /api/src?k=map&id=<anilistId>   -> cross-site ids
//
// Env (Vercel):
//   STREAM_API   upstream base url(s), comma separated (falls back to VITE_STREAM_API / the default)
//   SRC_SECRET   any long random string used to seal tokens (recommended)

// One or more upstream streaming APIs (comma separated). Providers from every
// upstream are merged, so adding another instance adds more sources.
const UPSTREAMS = (
  process.env.STREAM_API?.trim() ||
  process.env.VITE_STREAM_API?.trim() ||
  'https://anibiartv-api.vercel.app'
)
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const SECRET = process.env.SRC_SECRET?.trim() || 'animallu-private-gateway-v1';

// Real provider -> invented name, in the order they are preferred.
const PROVIDERS: [string, string][] = [
  ['anikoto', 'aura'],
  ['animegg', 'bolt'],
  ['mkissa', 'cove'],
  ['aniwaves', 'dawn'],
  ['animenosub', 'echo'],
  ['senshi', 'flux'],
  ['kaa', 'glow'],
  ['anizone', 'haze'],
  ['animeonsen', 'iris'],
  ['anipm', 'jade'],
  ['animedunya', 'kite'],
  ['reanime', 'luna'],
];
const NON_PROVIDER_KEYS = new Set(['page', 'type', 'mappings']);

// --- token sealing (WebCrypto: available in Node 18+ and the Edge runtime) ---
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = {
  to: (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  from: (str: string) => {
    const p = str.replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
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
  return b64.to(out);
}

async function open<T = any>(token: string): Promise<T | null> {
  try {
    const raw = b64.from(token);
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

// --- helpers --------------------------------------------------------------------
async function upstream(base: string, path: string, timeoutMs = 20000): Promise<any> {
  const res = await fetch(`${base}/${path.replace(/^\/+/, '')}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error('upstream'), { status: res.status });
  return res.json();
}

function aliasFor(real: string): string {
  const hit = PROVIDERS.find(([r]) => r === real);
  if (hit) return hit[1];
  let h = 0;
  for (const ch of real) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `s${h.toString(36).slice(0, 4)}`;
}

const rankOf = (real: string) => {
  const i = PROVIDERS.findIndex(([r]) => r === real);
  return i === -1 ? 99 : i;
};

const proxied = async (url: string, referer?: string) =>
  `/api/stream?t=${await seal({ u: url, r: referer || '' })}`;

const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

// --- handlers -------------------------------------------------------------------
async function episodes(id: string) {
  const settled = await Promise.allSettled(
    UPSTREAMS.map((base) => upstream(base, `episodes/${id}`, 25000).then((d) => ({ base, d }))),
  );
  const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) throw Object.assign(new Error('upstream'), { status: 502 });

  // The all-providers call can come back with only the sources that were ready.
  // Ask each upstream directly for the providers it left out, so more of them
  // show up (slow / failing ones are simply skipped).
  const usable = (v: any) =>
    v && !v.error && (v.episodes?.sub?.length || v.episodes?.dub?.length);
  const extras = await Promise.allSettled(
    ok.flatMap(({ base, d }) =>
      PROVIDERS.filter(([real]) => !usable(d?.[real])).map(([real]) =>
        upstream(base, `episodes/${real}/${id}`, 9000).then((r) => ({
          base,
          d: r?.[real] ? { [real]: r[real] } : {},
        })),
      ),
    ),
  );
  for (const r of extras) if (r.status === 'fulfilled') ok.push(r.value);

  // same provider on several upstreams: keep the one with the most episodes
  const best = new Map<string, { base: string; value: any; size: number }>();
  for (const { base, d } of ok) {
    for (const [name, value] of Object.entries<any>(d ?? {})) {
      if (NON_PROVIDER_KEYS.has(name) || !value || value.error) continue;
      const size = (value.episodes?.sub?.length ?? 0) + (value.episodes?.dub?.length ?? 0);
      if (!size) continue;
      const prev = best.get(name);
      if (!prev || size > prev.size) best.set(name, { base, value, size });
    }
  }
  const entries = [...best.entries()].sort((a, b) => rankOf(a[0]) - rankOf(b[0]));

  const out: Record<string, any> = {};
  for (const [name, { base, value }] of entries) {
    const convert = async (list: any) =>
      Promise.all(
        (Array.isArray(list) ? list : [])
          .filter((e) => e && typeof e.id === 'string' && /^watch\//.test(e.id))
          .map(async (e) => ({
            id: await seal({ p: e.id, b: base }),
            number: e.number,
            title: e.title ?? null,
            description: e.description ?? null,
            image: e.image ?? null,
            airDate: e.airDate ?? null,
            duration: e.duration ?? null,
            filler: !!e.filler,
          })),
      );
    const [sub, dub] = await Promise.all([
      convert(value.episodes?.sub),
      convert(value.episodes?.dub),
    ]);
    if (sub.length || dub.length) out[aliasFor(name)] = { episodes: { sub, dub } };
  }
  return out;
}

async function watch(token: string) {
  const opened = await open<{ p?: string; b?: string }>(token);
  const path = opened?.p;
  const base = opened?.b && UPSTREAMS.includes(opened.b) ? opened.b : UPSTREAMS[0];
  if (!path || !/^watch\/[\w.-]+\/[\w.-]+\/(sub|dub)\/[\w.%:-]+$/i.test(path)) {
    throw Object.assign(new Error('bad token'), { status: 400 });
  }
  const data = await upstream(base, path, 28000);
  const headerRef: string | undefined =
    data?.headers?.Referer ?? data?.headers?.referer ?? data?.headers?.referrer;

  const sources: any[] = Array.isArray(data?.streams) ? data.streams : [];
  const native = sources.filter((s) => s?.type !== 'embed' && isHttp(s?.url));
  const embeds = sources.filter((s) => s?.type === 'embed' && isHttp(s?.url));

  const mapSubs = async (list: any, referer?: string) =>
    Promise.all(
      (Array.isArray(list) ? list : [])
        .filter((t) => isHttp(t?.url))
        .map(async (t) => ({
          url: await proxied(t.url, referer),
          label: t.label ?? t.lang ?? 'Subtitles',
          srclang: t.srclang ?? t.lang ?? 'en',
          default: !!t.default,
        })),
    );

  const streams = await Promise.all(
    native.map(async (s, i) => {
      const ref = s.referer || headerRef;
      return {
        url: await proxied(s.url, ref),
        type: s.type,
        server: `Server ${i + 1}`,
        quality: s.quality,
        priority: s.priority,
        isActive: s.isActive,
        subtitles: await mapSubs(s.subtitles, ref),
        intro: s.intro,
        outro: s.outro,
      };
    }),
  );

  // Embeds can't be proxied, so they are only offered when nothing else plays.
  if (!streams.length) {
    embeds.forEach((s, i) =>
      streams.push({
        url: s.url,
        type: 'embed',
        server: `Server ${i + 1}`,
        quality: s.quality,
        priority: s.priority,
        isActive: s.isActive,
        subtitles: [],
        intro: s.intro,
        outro: s.outro,
      }),
    );
  }

  return {
    anilistId: data?.anilistId,
    episode: data?.episode,
    audio: data?.audio,
    streams,
    subtitles: await mapSubs(data?.subtitles, headerRef),
  };
}

export default async function handler(req: any, res: any) {
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);
  const kind = String(first(req.query?.k) ?? '');
  const id = String(first(req.query?.id) ?? '').replace(/\D/g, '');
  const token = String(first(req.query?.t) ?? '');

  try {
    if (kind === 'eps' && id) {
      const body = await episodes(id);
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json(body);
    }
    if (kind === 'watch' && token) {
      const body = await watch(token);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(body);
    }
    if (kind === 'map' && id) {
      let body: any = null;
      for (const base of UPSTREAMS) {
        try {
          body = await upstream(base, `map/${id}`, 12000);
          break;
        } catch {
          /* try the next one */
        }
      }
      if (!body) throw Object.assign(new Error('upstream'), { status: 502 });
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(body);
    }
    return res.status(400).json({ message: 'Bad request' });
  } catch (e: any) {
    // Never echo upstream details back to the browser.
    const status = e?.status === 400 ? 400 : e?.status === 404 ? 404 : 502;
    return res.status(status).json({ message: 'Source unavailable' });
  }
}
