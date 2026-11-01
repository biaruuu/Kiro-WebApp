// Client for the Anivexa streaming API (https://github.com/walterwhite-69/Anivexa-API).
//
//   GET /episodes/:anilistId                      -> per-provider episode lists (sub + dub)
//   GET /watch/:provider/:anilistId/:audio/:ep-id -> streams (hls | mp4 | embed), subtitles, skip times
//
// Everything is keyed by AniList id, which is exactly what the catalog uses.

export type Audio = 'sub' | 'dub';

const STREAM_API = (
  (import.meta.env.VITE_STREAM_API as string | undefined)?.trim() ||
  'https://anibiartv-api.vercel.app'
).replace(/\/+$/, '');

export interface StreamEpisode {
  id: string; // e.g. "watch/anikoto/16498/sub/anikoto-1"
  number: number;
  title: string | null;
  description: string | null;
  image: string | null;
  airDate: string | null;
  duration: number | null;
  filler: boolean;
}

export interface ProviderEpisodes {
  provider: string;
  sub: StreamEpisode[];
  dub: StreamEpisode[];
}

export interface SkipRange {
  start: number;
  end: number;
}

export interface SubtitleTrack {
  url: string;
  label: string;
  srclang: string;
  default?: boolean;
}

export interface StreamSource {
  url: string;
  type: 'hls' | 'mp4' | 'embed' | string;
  server: string;
  referer?: string;
  quality?: string;
  priority?: number;
  isActive?: boolean;
  embedUrl?: string;
  embed?: string;
  subtitles?: SubtitleTrack[];
  intro?: SkipRange;
  outro?: SkipRange;
}

export interface WatchData {
  anilistId: number;
  episode: number;
  audio: Audio;
  streams: StreamSource[];
  subtitles: SubtitleTrack[];
  downloads: { url: string; label: string }[];
  headers?: Record<string, string>;
}

// Providers in the order we prefer to try them.
export const PROVIDER_PRIORITY = [
  'anikoto',
  'animegg',
  'mkissa',
  'aniwaves',
  'animenosub',
  'senshi',
  'kaa',
  'anizone',
  'animeonsen',
  'anipm',
  'animedunya',
  'reanime',
];

const NON_PROVIDER_KEYS = new Set(['page', 'type', 'mappings']);

// --- tiny sessionStorage cache --------------------------------------------
const CACHE_TTL = 10 * 60 * 1000;

function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(`anivexa:${key}`);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t < CACHE_TTL) return v as T;
  } catch {
    /* ignore */
  }
  return undefined;
}

function cacheSet(key: string, value: unknown) {
  try {
    sessionStorage.setItem(
      `anivexa:${key}`,
      JSON.stringify({ t: Date.now(), v: value }),
    );
  } catch {
    /* storage full / unavailable */
  }
}

// --- fetching ---------------------------------------------------------------
// Try the API directly first (it sends CORS headers); if the browser blocks it,
// retry through the same-origin /api/json proxy.
async function getJson(path: string, timeoutMs = 25000): Promise<any> {
  const url = `${STREAM_API}/${path.replace(/^\/+/, '')}`;
  const attempt = async (target: string) => {
    const res = await fetch(target, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Stream API error ${res.status}`);
    return res.json();
  };
  try {
    return await attempt(url);
  } catch (err) {
    if (err instanceof TypeError || (err as any)?.name === 'TimeoutError') {
      return attempt(`/api/json?url=${encodeURIComponent(url)}`);
    }
    throw err;
  }
}

const cleanEpisodes = (list: any): StreamEpisode[] =>
  (Array.isArray(list) ? list : [])
    .filter((e) => e && typeof e.id === 'string' && Number(e.number) >= 1)
    .map((e) => ({
      id: e.id,
      number: Number(e.number),
      title: e.title ?? null,
      description: e.description ?? null,
      image: e.image ?? null,
      airDate: e.airDate ?? null,
      duration: e.duration ?? null,
      filler: !!e.filler,
    }))
    .sort((a, b) => a.number - b.number);

/** All providers that returned episodes for this AniList id. */
export async function fetchProviderEpisodes(
  anilistId: string,
): Promise<ProviderEpisodes[]> {
  const key = `episodes:${anilistId}`;
  const cached = cacheGet<ProviderEpisodes[]>(key);
  if (cached) return cached;

  const data = await getJson(`episodes/${anilistId}`);
  const providers: ProviderEpisodes[] = [];
  for (const [name, value] of Object.entries<any>(data ?? {})) {
    if (NON_PROVIDER_KEYS.has(name) || !value || value.error) continue;
    const sub = cleanEpisodes(value.episodes?.sub);
    const dub = cleanEpisodes(value.episodes?.dub);
    if (sub.length || dub.length) providers.push({ provider: name, sub, dub });
  }
  providers.sort((a, b) => {
    const ia = PROVIDER_PRIORITY.indexOf(a.provider);
    const ib = PROVIDER_PRIORITY.indexOf(b.provider);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  if (providers.length) cacheSet(key, providers);
  return providers;
}

/** Streams, subtitles and skip times for one episode (use StreamEpisode.id). */
export async function fetchWatch(episodeId: string): Promise<WatchData> {
  const cached = cacheGet<WatchData>(`watch:${episodeId}`);
  if (cached) return cached;
  const data = await getJson(episodeId);
  const result: WatchData = {
    anilistId: data.anilistId,
    episode: data.episode,
    audio: data.audio,
    streams: Array.isArray(data.streams) ? data.streams : [],
    subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
    downloads: Array.isArray(data.downloads) ? data.downloads : [],
    headers: data.headers,
  };
  // Stream URLs are signed/expiring, so only cache briefly via the shared TTL.
  cacheSet(`watch:${episodeId}`, result);
  return result;
}

// --- helpers used by the player ---------------------------------------------

/** Route a media / subtitle URL through our edge proxy so the right Referer is sent. */
export function proxyMedia(url: string, referer?: string): string {
  return `/api/stream?url=${encodeURIComponent(url)}${
    referer ? `&ref=${encodeURIComponent(referer)}` : ''
  }`;
}

/** Playable servers in the order they should be tried: native video first, embeds last. */
export function orderStreams(streams: StreamSource[]): StreamSource[] {
  const rank = (s: StreamSource) => (s.type === 'embed' ? 1 : 0);
  return [...streams]
    .filter((s) => !!s.url)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(!!b.isActive) - Number(!!a.isActive) ||
        (b.priority ?? 0) - (a.priority ?? 0),
    );
}

export const providerLabel = (name: string) =>
  name.charAt(0).toUpperCase() + name.slice(1);
