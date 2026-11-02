import { useEffect, useState } from 'react';
import { fetchMap, fetchProviderEpisodes } from './anivexa';

// ---------------------------------------------------------------------------
// Tiny concurrency-limited queue so lists of cards don't fire dozens of
// requests at once.
// ---------------------------------------------------------------------------
const MAX_PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) run();
    else waiting.push(run);
  });
}

// ---------------------------------------------------------------------------
// Sub / dub episode counts, from the streaming API (the real source of truth
// for what can actually be watched).
// ---------------------------------------------------------------------------
export interface AudioCounts {
  sub: number;
  dub: number;
}

const countCache = new Map<string, Promise<AudioCounts | null>>();

export function fetchAudioCounts(id: string): Promise<AudioCounts | null> {
  let p = countCache.get(id);
  if (!p) {
    p = schedule(async () => {
      const providers = await fetchProviderEpisodes(id);
      let sub = 0;
      let dub = 0;
      for (const prov of providers) {
        sub = Math.max(sub, prov.sub.length);
        dub = Math.max(dub, prov.dub.length);
      }
      return { sub, dub };
    }).catch(() => {
      countCache.delete(id); // allow a retry later
      return null;
    });
    countCache.set(id, p);
  }
  return p;
}

export function useAudioCounts(id: string, enabled = true): AudioCounts | null {
  const [counts, setCounts] = useState<AudioCounts | null>(null);
  useEffect(() => {
    setCounts(null);
    if (!enabled) return;
    let alive = true;
    fetchAudioCounts(id).then((c) => alive && setCounts(c));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return counts;
}

// ---------------------------------------------------------------------------
// TMDB artwork (title logo + HD backdrop) via our /api/tmdb function, which
// keeps the TMDB key on the server. Without a key it answers `no-key` and the
// UI falls back to the text title and the AniList banner.
// ---------------------------------------------------------------------------
export interface TmdbArt {
  logo: string | null;
  backdrop: string | null;
}

const ART_TTL = 7 * 24 * 3600 * 1000;
const ART_MISS_TTL = 30 * 60 * 1000;
const artMem = new Map<string, Promise<TmdbArt | null>>();

function artFromStorage(id: string): TmdbArt | undefined {
  try {
    const raw = localStorage.getItem(`art2:${id}`);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    const found = v && (v.logo || v.backdrop);
    if (Date.now() - t < (found ? ART_TTL : ART_MISS_TTL)) return v as TmdbArt;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function fetchTmdbArt(
  id: string,
  opts: { type?: string; title?: string } = {},
): Promise<TmdbArt | null> {
  let p = artMem.get(id);
  if (p) return p;

  const stored = artFromStorage(id);
  if (stored) {
    p = Promise.resolve(stored);
  } else {
    const qs = new URLSearchParams({ id });
    if (opts.type === 'MOVIE') qs.set('type', 'movie');
    if (opts.title) qs.set('title', opts.title);
    p = (async () => {
      const res = await fetch(`/api/tmdb?${qs}`, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error('tmdb lookup failed');
      const json = await res.json();
      const art: TmdbArt = { logo: json.logo ?? null, backdrop: json.backdrop ?? null };
      // only remember definite answers (not "no key yet" / errors)
      if (!json.reason || json.reason === 'unmapped') {
        try {
          localStorage.setItem(`art2:${id}`, JSON.stringify({ t: Date.now(), v: art }));
        } catch {
          /* ignore */
        }
      }
      return art;
    })().catch(() => null);
  }
  artMem.set(id, p);
  return p;
}

/** Fetches TMDB art for several anime. A key is absent while the lookup is pending. */
export function useTmdbArtMap(
  items: { id: string; type?: string; title?: string }[],
): Record<string, TmdbArt | null> {
  const [map, setMap] = useState<Record<string, TmdbArt | null>>({});
  const signature = items.map((i) => i.id).join(',');
  useEffect(() => {
    let alive = true;
    for (const it of items) {
      fetchTmdbArt(it.id, it).then((art) => {
        if (alive) setMap((m) => (it.id in m ? m : { ...m, [it.id]: art }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return map;
}

// ---------------------------------------------------------------------------
// Artwork gallery (TMDB backdrops / posters / logos) for the details page.
// ---------------------------------------------------------------------------
export interface GalleryImage {
  thumb: string;
  full: string;
  w?: number;
  h?: number;
}
export interface TmdbGallery {
  backdrops: GalleryImage[];
  posters: GalleryImage[];
  logos: GalleryImage[];
}

const galleryMem = new Map<string, Promise<TmdbGallery | null>>();

export function fetchTmdbGallery(
  id: string,
  opts: { type?: string; title?: string } = {},
): Promise<TmdbGallery | null> {
  let p = galleryMem.get(id);
  if (p) return p;
  const qs = new URLSearchParams({ id, gallery: '1' });
  if (opts.type === 'MOVIE') qs.set('type', 'movie');
  if (opts.title) qs.set('title', opts.title);
  p = fetch(`/api/tmdb?${qs}`, { signal: AbortSignal.timeout(12000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.gallery as TmdbGallery) ?? null)
    .catch(() => null);
  galleryMem.set(id, p);
  return p;
}

// ---------------------------------------------------------------------------
// MAL score (Jikan) and cross-site ids (Anivexa /map) for the details page.
// ---------------------------------------------------------------------------
const malMem = new Map<string, Promise<number | null>>();

export function fetchMalScore(malId: string): Promise<number | null> {
  let p = malMem.get(malId);
  if (!p) {
    p = fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      signal: AbortSignal.timeout(7000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (typeof j?.data?.score === 'number' ? (j.data.score as number) : null))
      .catch(() => null);
    malMem.set(malId, p);
  }
  return p;
}

export interface ExternalIds {
  anidb?: string;
  kitsu?: string;
  tvdb?: string;
  tmdb?: string;
  tmdbKind?: 'tv' | 'movie';
  imdb?: string;
  anisearch?: string;
}

const SITES: [keyof ExternalIds, RegExp][] = [
  ['anidb', /anidb/i],
  ['kitsu', /kitsu/i],
  ['tvdb', /tvdb/i],
  ['tmdb', /tmdb|themoviedb/i],
  ['imdb', /imdb/i],
  ['anisearch', /anisearch/i],
];

const idOf = (v: any): string | null => {
  if (typeof v === 'number' && v > 0) return String(v);
  if (typeof v === 'string' && v.trim()) {
    const m = v.match(/(tt\d+|\d+)\s*$/);
    return m ? m[1] : null;
  }
  if (v && typeof v === 'object') return idOf(v.id ?? v.value ?? v.providerId);
  return null;
};

export function parseExternalIds(map: any): ExternalIds {
  const out: ExternalIds = {};
  const visit = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        const label = String(item?.provider ?? item?.site ?? item?.name ?? item?.source ?? '');
        for (const [key, re] of SITES) {
          if (!out[key] && re.test(label)) {
            const id = idOf(item);
            if (id) (out as any)[key] = id;
          }
        }
        visit(item, depth + 1);
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      for (const [key, re] of SITES) {
        if (!out[key] && re.test(k)) {
          const id = idOf(v);
          if (id) (out as any)[key] = id;
          if (key === 'tmdb' && v && typeof v === 'object') {
            const t = String((v as any).type ?? (v as any).media_type ?? '').toLowerCase();
            if (t.includes('movie')) out.tmdbKind = 'movie';
            else if (t) out.tmdbKind = 'tv';
          }
        }
      }
      visit(v, depth + 1);
    }
  };
  visit(map);
  return out;
}

const idsMem = new Map<string, Promise<ExternalIds>>();

export function fetchExternalIds(anilistId: string): Promise<ExternalIds> {
  let p = idsMem.get(anilistId);
  if (!p) {
    p = fetchMap(anilistId)
      .then(parseExternalIds)
      .catch(() => ({}) as ExternalIds);
    idsMem.set(anilistId, p);
  }
  return p;
}
