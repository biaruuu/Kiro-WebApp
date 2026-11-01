import {
  anilistRequest,
  DETAIL_QUERY,
  mapMedia,
  mapPage,
  mapRecent,
  PAGE_QUERY,
  RECENT_QUERY,
} from './anilist';

// Catalog, search and anime details come straight from AniList (see
// ./anilist.ts). Episode lists and video sources come from the Anivexa
// streaming API (see ./anivexa.ts).

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

// Recently aired episodes (last 3 days), newest first, one entry per anime.
export async function fetchRecentEpisodes() {
  // Round to 5 minutes so the cache key is stable between renders.
  const before = Math.floor(Date.now() / 300000) * 300;
  const after = before - 3 * 24 * 3600;
  const pages = await Promise.all(
    [1, 2].map((page) =>
      cachedAniList(
        listCache,
        generateCacheKey('recent', String(page), String(before)),
        RECENT_QUERY,
        { page, perPage: 50, before, after },
        mapRecent,
      ),
    ),
  );
  const seen = new Set<string>();
  const results = pages
    .flat()
    .filter((a: any) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  return { results };
}
