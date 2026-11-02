// Vercel serverless function: TMDB title logo + HD backdrop for an anime.
//
//   GET /api/tmdb?id=<anilistId>&type=tv|movie&title=<fallback search title>
//   -> { logo: string|null, backdrop: string|null, reason?: string }
//
// The TMDB key lives only on the server. Set ONE of these in Vercel:
//   TMDB_API_KEY      v3 API key (32 chars)  -> sent as ?api_key=
//   TMDB_READ_TOKEN   v4 "API Read Access Token" (long JWT) -> sent as Bearer
// (a long JWT placed in TMDB_API_KEY is detected and sent as Bearer as well)
//
// AniList id -> TMDB id comes from the Anivexa /map endpoint; if that has no
// TMDB id we fall back to a TMDB title search.

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const STREAM_API = (
  process.env.VITE_STREAM_API?.trim() || 'https://anibiartv-api.vercel.app'
).replace(/\/+$/, '');

type Kind = 'tv' | 'movie';

function credentials() {
  const key = (process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY || '').trim();
  if (!key) return null;
  return { key, bearer: key.length > 40 };
}

async function tmdb(path: string, params: Record<string, string>, cred: ReturnType<typeof credentials>) {
  const url = new URL(`${TMDB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cred!.bearer) headers.Authorization = `Bearer ${cred!.key}`;
  else url.searchParams.set('api_key', cred!.key);
  const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw Object.assign(new Error(`TMDB ${res.status}`), { status: res.status });
  return res.json();
}

// --- AniList id -> TMDB id (tolerant of the response shape) -----------------
function asKind(v: unknown): Kind | undefined {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('movie') || s === 'film') return 'movie';
  if (s.includes('tv') || s.includes('show') || s.includes('series')) return 'tv';
  return undefined;
}

function idFromValue(v: unknown): { id: string; kind?: Kind } | null {
  if (typeof v === 'number' && v > 0) return { id: String(v) };
  if (typeof v === 'string') {
    const m = v.match(/(tv|movie)\/(\d+)/i);
    if (m) return { id: m[2], kind: m[1].toLowerCase() as Kind };
    if (/^\d+$/.test(v.trim())) return { id: v.trim() };
    return null;
  }
  if (v && typeof v === 'object') {
    const o = v as any;
    const inner = idFromValue(o.id ?? o.tmdbId ?? o.value ?? o.providerId ?? o.url);
    if (inner) return { id: inner.id, kind: inner.kind ?? asKind(o.type ?? o.media_type ?? o.mediaType ?? o.kind) };
  }
  return null;
}

function findTmdb(node: any, depth = 0): { id: string; kind?: Kind } | null {
  if (!node || typeof node !== 'object' || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const label = String(item?.provider ?? item?.site ?? item?.name ?? item?.source ?? '');
      if (/tmdb|themoviedb/i.test(label)) {
        const hit = idFromValue(item);
        if (hit) return hit;
      }
      const deep = findTmdb(item, depth + 1);
      if (deep) return deep;
    }
    return null;
  }
  for (const [k, v] of Object.entries(node)) {
    if (/tmdb|themoviedb/i.test(k)) {
      const hit = idFromValue(v);
      if (hit) return hit;
    }
  }
  for (const v of Object.values(node)) {
    const deep = findTmdb(v, depth + 1);
    if (deep) return deep;
  }
  return null;
}

async function mapToTmdb(anilistId: string) {
  try {
    const res = await fetch(`${STREAM_API}/map/${anilistId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return findTmdb(await res.json());
  } catch {
    return null;
  }
}

async function searchTmdb(title: string, kind: Kind, cred: ReturnType<typeof credentials>) {
  if (!title) return null;
  try {
    const data = await tmdb(`/search/${kind}`, { query: title, include_adult: 'false' }, cred);
    const results: any[] = data?.results ?? [];
    const jp = results.find(
      (r) => r.original_language === 'ja' || (r.origin_country ?? []).includes('JP'),
    );
    return jp ? String(jp.id) : null;
  } catch {
    return null;
  }
}

// --- image picking -----------------------------------------------------------
const rank = (img: any) => (img.vote_average ?? 0) * 100 + Math.min(img.width ?? 0, 4000) / 100;

function pickLogo(logos: any[]) {
  if (!logos?.length) return null;
  const pool = (lang: string | null) => logos.filter((l) => l.iso_639_1 === lang);
  for (const lang of ['en', 'ja', null]) {
    const list = pool(lang as any).sort((a, b) => rank(b) - rank(a));
    if (list[0]) return list[0];
  }
  return [...logos].sort((a, b) => rank(b) - rank(a))[0];
}

function pickBackdrop(backdrops: any[]) {
  if (!backdrops?.length) return null;
  const wide = backdrops.filter((b) => (b.width ?? 0) >= 1280);
  const pool = wide.length ? wide : backdrops;
  // prefer art without baked-in text/language
  const textless = pool.filter((b) => !b.iso_639_1);
  return [...(textless.length ? textless : pool)].sort((a, b) => rank(b) - rank(a))[0];
}

async function imagesFor(id: string, kind: Kind, cred: ReturnType<typeof credentials>) {
  return tmdb(`/${kind}/${id}/images`, { include_image_language: 'en,ja,null' }, cred);
}

export default async function handler(req: any, res: any) {
  const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const anilistId = String(rawId ?? '').replace(/\D/g, '');
  if (!anilistId) return res.status(400).json({ message: 'Missing "id"' });

  const cred = credentials();
  if (!cred) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ logo: null, backdrop: null, reason: 'no-key' });
  }

  const hint: Kind = req.query?.type === 'movie' ? 'movie' : 'tv';
  const title = String(Array.isArray(req.query?.title) ? req.query.title[0] : req.query?.title ?? '').slice(0, 200);

  try {
    const mapped = await mapToTmdb(anilistId);
    const kinds: Kind[] = mapped?.kind ? [mapped.kind, mapped.kind === 'tv' ? 'movie' : 'tv'] : [hint, hint === 'tv' ? 'movie' : 'tv'];

    let images: any = null;
    let tried = false;

    if (mapped?.id) {
      for (const kind of kinds) {
        tried = true;
        try {
          images = await imagesFor(mapped.id, kind, cred);
          if (images) break;
        } catch (e: any) {
          if (e?.status === 401) throw e;
        }
      }
    }

    if (!images) {
      const foundId = await searchTmdb(title, hint, cred);
      if (foundId) {
        try {
          images = await imagesFor(foundId, hint, cred);
        } catch {
          /* ignore */
        }
      }
    }

    const logo = pickLogo(images?.logos ?? []);
    const backdrop = pickBackdrop(images?.backdrops ?? []);

    res.setHeader(
      'Cache-Control',
      logo || backdrop
        ? 's-maxage=86400, stale-while-revalidate=604800'
        : 's-maxage=1800, stale-while-revalidate=3600',
    );
    return res.status(200).json({
      logo: logo ? `${IMG}/w500${logo.file_path}` : null,
      backdrop: backdrop ? `${IMG}/original${backdrop.file_path}` : null,
      ...(tried || title ? {} : { reason: 'unmapped' }),
    });
  } catch (error: any) {
    res.setHeader('Cache-Control', 'no-store');
    const bad = error?.status === 401;
    return res
      .status(200)
      .json({ logo: null, backdrop: null, reason: bad ? 'bad-key' : 'error' });
  }
}
