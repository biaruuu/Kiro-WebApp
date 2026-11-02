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
// Title logos (transparent PNGs), like the ones Miruro shows in its hero.
// Looked up by AniList id through ani.zip, which exposes fanart "Clearlogo"
// images. Cached for a week; a miss simply falls back to the text title.
// ---------------------------------------------------------------------------
const LOGO_TTL = 7 * 24 * 3600 * 1000;
const logoMem = new Map<string, Promise<string | null>>();

function logoFromStorage(id: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(`logo:${id}`);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t < LOGO_TTL) return v as string | null;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function fetchTitleLogo(id: string): Promise<string | null> {
  let p = logoMem.get(id);
  if (p) return p;

  const stored = logoFromStorage(id);
  if (stored !== undefined) {
    p = Promise.resolve(stored);
  } else {
    p = (async () => {
      const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error('logo lookup failed');
      const json = await res.json();
      const images: any[] = Array.isArray(json?.images) ? json.images : [];
      const logo =
        images.find((i) => /clearlogo/i.test(i?.coverType || ''))?.url ?? null;
      try {
        localStorage.setItem(`logo:${id}`, JSON.stringify({ t: Date.now(), v: logo }));
      } catch {
        /* ignore */
      }
      return (logo as string | null) ?? null;
    })().catch(() => null);
  }
  logoMem.set(id, p);
  return p;
}

/** undefined = still looking, null = none found, string = logo url */
export function useTitleLogo(id: string, enabled = true): string | null | undefined {
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchTitleLogo(id).then((l) => alive && setLogo(l));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return logo;
}
