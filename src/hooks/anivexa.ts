// Client for our private streaming gateway (api/src.ts).
//
// The browser only ever talks to this site's /api/src: provider names are
// invented there, episode ids / media URLs are sealed tokens, and the upstream
// streaming API is never exposed.
//
//   /api/src?k=eps&id=<anilistId>   -> per-provider episode lists (sub + dub)
//   /api/src?k=watch&t=<token>      -> streams, subtitles, skip times
//   /api/src?k=map&id=<anilistId>   -> cross-site ids

export type Audio = 'sub' | 'dub';

export interface StreamEpisode {
  id: string; // sealed token (opaque)
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
}


// --- tiny sessionStorage cache --------------------------------------------
const CACHE_TTL = 10 * 60 * 1000;

function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(`gw1:${key}`);
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
      `gw1:${key}`,
      JSON.stringify({ t: Date.now(), v: value }),
    );
  } catch {
    /* storage full / unavailable */
  }
}

// --- fetching ---------------------------------------------------------------
async function getJson(query: string, timeoutMs = 28000): Promise<any> {
  const res = await fetch(`/api/src?${query}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Source unavailable');
  return res.json();
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

/** Cross-platform ids (MAL, TVDB, TMDB, Kitsu, AniDB, ...) for an AniList id. */
export async function fetchMap(anilistId: string): Promise<any> {
  const key = `map:${anilistId}`;
  const cached = cacheGet<any>(key);
  if (cached) return cached;
  const data = await getJson(`k=map&id=${encodeURIComponent(anilistId)}`, 12000);
  if (data) cacheSet(key, data);
  return data;
}

/** All providers that returned episodes for this AniList id. */
export async function fetchProviderEpisodes(
  anilistId: string,
): Promise<ProviderEpisodes[]> {
  const key = `episodes:${anilistId}`;
  const cached = cacheGet<ProviderEpisodes[]>(key);
  if (cached) return cached;

  const data = await getJson(`k=eps&id=${encodeURIComponent(anilistId)}`, 28000);
  const providers: ProviderEpisodes[] = [];
  for (const [name, value] of Object.entries<any>(data ?? {})) {
    if (!value || value.error) continue;
    const sub = cleanEpisodes(value.episodes?.sub);
    const dub = cleanEpisodes(value.episodes?.dub);
    if (sub.length || dub.length) providers.push({ provider: name, sub, dub });
  }
  // the gateway already returns providers in preference order
  if (providers.length) cacheSet(key, providers);
  return providers;
}

/** Streams, subtitles and skip times for one episode (use StreamEpisode.id). */
export async function fetchWatch(episodeId: string): Promise<WatchData> {
  const cached = cacheGet<WatchData>(`watch:${episodeId}`);
  if (cached) return cached;
  const data = await getJson(`k=watch&t=${encodeURIComponent(episodeId)}`);
  const result: WatchData = {
    anilistId: data.anilistId,
    episode: data.episode,
    audio: data.audio,
    streams: Array.isArray(data.streams) ? data.streams : [],
    subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
  };
  // Stream URLs are signed/expiring, so only cache briefly via the shared TTL.
  cacheSet(`watch:${episodeId}`, result);
  return result;
}

// --- helpers used by the player ---------------------------------------------

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
