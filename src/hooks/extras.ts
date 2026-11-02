import { useEffect, useState } from 'react';
import { fetchProviderEpisodes } from './anivexa';

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
