import axios from 'axios';
import {
  anilistRequest,
  buildEpisodes,
  DETAIL_QUERY,
  EPISODES_QUERY,
  mapMedia,
  mapPage,
  PAGE_QUERY,
} from './anilist';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Catalog, search and anime details come straight from AniList (see
// ./anilist.ts) - no backend needed.
//
// VITE_BACKEND_URL is OPTIONAL and only used for what AniList cannot provide:
// episode streaming sources. Point it at a Consumet-compatible API
// (https://github.com/consumet/api.consumet.org). The old shared host
// public-miruro-consumet-api.vercel.app is down, so it is ignored.

function ensureUrlEndsWithSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

const DEAD_BACKENDS = ['public-miruro-consumet-api.vercel.app'];
const rawBackend = (
  import.meta.env.VITE_BACKEND_URL as string | undefined
)?.trim();
const BACKEND_URL =
  rawBackend && !DEAD_BACKENDS.some((h) => rawBackend.includes(h))
    ? ensureUrlEndsWithSlash(rawBackend)
    : '';

const SKIP_TIMES = ensureUrlEndsWithSlash(
  (import.meta.env.VITE_SKIP_TIMES as string | undefined)?.trim() ||
    'https://api.aniskip.com/',
);

// Same-origin JSON proxy (api/json.ts) used for the optional backend and
// aniskip. A custom VITE_PROXY_URL is honoured except the legacy corsproxy.io
// value, which has no /api/json endpoint and rejects production origins.
const configuredProxy = (
  import.meta.env.VITE_PROXY_URL as string | undefined
)?.trim();
const PROXY_URL = ensureUrlEndsWithSlash(
  configuredProxy && !configuredProxy.includes('corsproxy.io')
    ? configuredProxy
    : window.location.origin,
);
const PROXY_SERVER_BASE_URL = `${PROXY_URL}api/json`;

const axiosInstance = axios.create({
  baseURL: PROXY_SERVER_BASE_URL,
  timeout: 10000,
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
function handleError(error: any, context: string) {
  let errorMessage = 'An error occurred';

  if (error.message && error.message.includes('Access-Control-Allow-Origin')) {
    errorMessage = 'A CORS error occurred';
  }

  switch (context) {
    case 'data':
      errorMessage = 'Error fetching data';
      break;
    case 'anime episodes':
      errorMessage = 'Error fetching anime episodes';
      break;
  }

  if (error.response) {
    const status = error.response.status;
    if (status >= 500) {
      errorMessage += ': Server error';
    } else if (status >= 400) {
      errorMessage += ': Client error';
    }
    errorMessage += `: ${error.response.data?.message || 'Unknown error'}`;
  } else if (error.message) {
    errorMessage += `: ${error.message}`;
  }

  console.error(`${errorMessage}`, error);
  throw new Error(errorMessage);
}

// ---------------------------------------------------------------------------
// Session-storage cache
// ---------------------------------------------------------------------------
function generateCacheKey(...args: string[]) {
  return args.join('-');
}

interface CacheItem {
  value: any;
  timestamp: number;
}

function createOptimizedSessionStorageCache(
  maxSize: number,
  maxAge: number,
  cacheKey: string,
) {
  let initial: [string, CacheItem][] = [];
  try {
    initial = JSON.parse(sessionStorage.getItem(cacheKey) || '[]');
  } catch {
    initial = [];
  }
  const cache = new Map<string, CacheItem>(initial);
  const keys = new Set<string>(cache.keys());

  function isItemExpired(item: CacheItem) {
    return Date.now() - item.timestamp > maxAge;
  }

  function updateSessionStorage() {
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify(Array.from(cache.entries())),
      );
    } catch {
      // Storage full / unavailable: the in-memory cache still works.
    }
  }

  return {
    get(key: string) {
      if (cache.has(key)) {
        const item = cache.get(key);
        if (!isItemExpired(item!)) {
          keys.delete(key);
          keys.add(key);
          return item!.value;
        }
        cache.delete(key);
        keys.delete(key);
      }
      return undefined;
    },
    set(key: string, value: any) {
      if (cache.size >= maxSize) {
        const oldestKey = keys.values().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
          keys.delete(oldestKey);
        }
      }
      keys.add(key);
      cache.set(key, { value, timestamp: Date.now() });
      updateSessionStorage();
    },
  };
}

const CACHE_SIZE = 20;
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour (catalog data changes often)

function createCache(cacheKey: string) {
  return createOptimizedSessionStorageCache(
    CACHE_SIZE,
    CACHE_MAX_AGE,
    cacheKey,
  );
}

interface FetchOptions {
  type?: string;
  season?: string;
  format?: string;
  sort?: string[];
  genres?: string[];
  id?: string;
  year?: string;
  status?: string;
}

const listCache = createCache('AniListPages');
const detailCache = createCache('AniListDetail');
const episodesCache = createCache('AniListEpisodes');
const backendCache = createCache('BackendData');
const skipTimesCache = createCache('SkipTimes');

// ---------------------------------------------------------------------------
// Backend (optional) via proxy
// ---------------------------------------------------------------------------
async function fetchFromProxy(url: string, cache: any, cacheKey: string) {
  try {
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) return cachedResponse;

    const response = await axiosInstance.get('', { params: { url } });

    if (
      response.status !== 200 ||
      (response.data.statusCode && response.data.statusCode >= 400)
    ) {
      const errorMessage = response.data.message || 'Unknown server error';
      throw new Error(
        `Server error: ${
          response.data.statusCode || response.status
        } ${errorMessage}`,
      );
    }

    cache.set(cacheKey, response.data);
    return response.data;
  } catch (error) {
    handleError(error, 'data');
    throw error;
  }
}

function requireBackend(feature: string): string {
  if (!BACKEND_URL) {
    throw new Error(
      `${feature} needs a streaming backend. Set VITE_BACKEND_URL to a Consumet-compatible API.`,
    );
  }
  return BACKEND_URL;
}

// ---------------------------------------------------------------------------
// AniList-backed catalog
// ---------------------------------------------------------------------------
async function cachedAniList<T>(
  cache: any,
  cacheKey: string,
  query: string,
  variables: Record<string, unknown>,
  map: (data: any) => T,
): Promise<T> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  try {
    const result = map(await anilistRequest(query, variables));
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    handleError(error, 'data');
    throw error;
  }
}

export async function fetchAdvancedSearch(
  searchQuery: string = '',
  page: number = 1,
  perPage: number = 20,
  options: FetchOptions = {},
) {
  const variables: Record<string, unknown> = {
    page,
    perPage,
    ...(searchQuery && { search: searchQuery }),
    ...(options.sort?.length && { sort: options.sort }),
    ...(options.season && { season: options.season }),
    ...(options.year && { seasonYear: Number(options.year) }),
    ...(options.status && { status: options.status }),
    ...(options.format && { format: options.format }),
    ...(options.genres?.length && { genres: options.genres }),
  };
  return cachedAniList(
    listCache,
    generateCacheKey('search', JSON.stringify(variables)),
    PAGE_QUERY,
    variables,
    mapPage,
  );
}

export async function fetchAnimeData(animeId: string, _provider?: string) {
  return cachedAniList(
    detailCache,
    generateCacheKey('detail', animeId),
    DETAIL_QUERY,
    { id: Number(animeId) },
    (data) => mapMedia(data.Media),
  );
}

// Kept for API compatibility: Watch falls back to this if fetchAnimeData fails.
export const fetchAnimeInfo = fetchAnimeData;

type ListType = 'TopRated' | 'Trending' | 'Popular' | 'TopAiring' | 'Upcoming';

const LIST_OPTIONS: Record<ListType, FetchOptions> = {
  TopRated: { sort: ['SCORE_DESC'] },
  Trending: { sort: ['TRENDING_DESC'] },
  Popular: { sort: ['POPULARITY_DESC'] },
  TopAiring: { status: 'RELEASING', sort: ['TRENDING_DESC'] },
  Upcoming: { status: 'NOT_YET_RELEASED', sort: ['POPULARITY_DESC'] },
};

const fetchList = (type: ListType, page = 1, perPage = 16) =>
  fetchAdvancedSearch('', page, perPage, LIST_OPTIONS[type]);

export const fetchTopAnime = (page: number, perPage: number) =>
  fetchList('TopRated', page, perPage);
export const fetchTrendingAnime = (page: number, perPage: number) =>
  fetchList('Trending', page, perPage);
export const fetchPopularAnime = (page: number, perPage: number) =>
  fetchList('Popular', page, perPage);
export const fetchTopAiringAnime = (page: number, perPage: number) =>
  fetchList('TopAiring', page, perPage);
export const fetchUpcomingSeasons = (page: number, perPage: number) =>
  fetchList('Upcoming', page, perPage);

// Recently updated airing shows (AniList has no "recent episodes" feed).
export async function fetchRecentEpisodes(
  page: number = 1,
  perPage: number = 18,
  _provider?: string,
) {
  return fetchAdvancedSearch('', page, perPage, {
    status: 'RELEASING',
    sort: ['UPDATED_AT_DESC'],
  });
}

// ---------------------------------------------------------------------------
// Episodes & streaming
// ---------------------------------------------------------------------------
// Episode list: built from AniList data ("<slug>-episode-<n>"). If a
// Consumet backend is configured it is tried first so its ids line up with
// its own streaming endpoints.
export async function fetchAnimeEpisodes(
  animeId: string,
  provider: string = 'gogoanime',
  dub: boolean = false,
) {
  if (BACKEND_URL) {
    try {
      const params = new URLSearchParams({
        provider,
        dub: dub ? 'true' : 'false',
      });
      const url = `${BACKEND_URL}meta/anilist/episodes/${animeId}?${params.toString()}`;
      const data = await fetchFromProxy(
        url,
        backendCache,
        generateCacheKey(
          'animeEpisodes',
          animeId,
          provider,
          dub ? 'dub' : 'sub',
        ),
      );
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {
      // fall through to the AniList-built list
    }
  }
  return cachedAniList(
    episodesCache,
    generateCacheKey('episodes', animeId),
    EPISODES_QUERY,
    { id: Number(animeId) },
    (data) => buildEpisodes(data.Media),
  );
}

export async function fetchAnimeEmbeddedEpisodes(episodeId: string) {
  const base = requireBackend('Streaming');
  return fetchFromProxy(
    `${base}meta/anilist/servers/${episodeId}`,
    backendCache,
    generateCacheKey('animeEmbeddedServers', episodeId),
  );
}

export async function fetchAnimeStreamingLinks(episodeId: string) {
  const base = requireBackend('Streaming');
  return fetchFromProxy(
    `${base}meta/anilist/watch/${episodeId}`,
    backendCache,
    generateCacheKey('animeStreamingLinks', episodeId),
  );
}

// ---------------------------------------------------------------------------
// Skip times (aniskip)
// ---------------------------------------------------------------------------
interface FetchSkipTimesParams {
  malId: string;
  episodeNumber: string;
  episodeLength?: string;
}

export async function fetchSkipTimes({
  malId,
  episodeNumber,
  episodeLength = '0',
}: FetchSkipTimesParams) {
  const types = ['ed', 'mixed-ed', 'mixed-op', 'op', 'recap'];
  const url = new URL(`${SKIP_TIMES}v2/skip-times/${malId}/${episodeNumber}`);
  url.searchParams.append('episodeLength', episodeLength.toString());
  types.forEach((type) => url.searchParams.append('types[]', type));

  const cacheKey = generateCacheKey(
    'skipTimes',
    malId,
    episodeNumber,
    episodeLength || '',
  );
  return fetchFromProxy(url.toString(), skipTimesCache, cacheKey);
}
