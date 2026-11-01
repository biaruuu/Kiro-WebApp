// AniList GraphQL adapter.
// Fetches catalog / search / details straight from AniList (CORS-enabled,
// no API key, no third-party backend) and maps the result into the
// Consumet-style `Anime` shape the UI components already consume.

const ANILIST_URL = 'https://graphql.anilist.co';

const TITLE = 'title { romaji english native userPreferred }';
const COVER = 'coverImage { extraLarge large color }';

const MINI_MEDIA = `
  id idMal ${TITLE} status episodes format averageScore ${COVER} bannerImage
`;

const MEDIA_FIELDS = `
  id idMal ${TITLE} description(asHtml: false) format status episodes duration
  season seasonYear averageScore popularity genres isAdult countryOfOrigin
  synonyms isLicensed ${COVER} bannerImage
  trailer { id site thumbnail }
  startDate { year month day } endDate { year month day }
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { airingAt timeUntilAiring episode }
`;

const DETAIL_FIELDS = `
  ${MEDIA_FIELDS}
  relations { edges { relationType(version: 2) node { ${MINI_MEDIA} } } }
  recommendations(sort: RATING_DESC, perPage: 12) {
    nodes { mediaRecommendation { ${MINI_MEDIA} } }
  }
  characters(sort: [ROLE, RELEVANCE], perPage: 12) {
    edges {
      role
      node { id name { full native } image { large } }
      voiceActors(language: JAPANESE) { id name { full native } image { large } languageV2 }
    }
  }
`;

export const PAGE_QUERY = `
  query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort],
         $season: MediaSeason, $seasonYear: Int, $status: MediaStatus,
         $format: MediaFormat, $genres: [String]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage lastPage hasNextPage total }
      media(type: ANIME, isAdult: false, search: $search, sort: $sort,
            season: $season, seasonYear: $seasonYear, status: $status,
            format: $format, genre_in: $genres) { ${MEDIA_FIELDS} }
    }
  }
`;

export const DETAIL_QUERY = `
  query ($id: Int) { Media(id: $id, type: ANIME) { ${DETAIL_FIELDS} } }
`;

export async function anilistRequest<T = any>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.errors) {
    const message =
      json?.errors?.[0]?.message || `AniList request failed (${response.status})`;
    throw new Error(message);
  }
  return json.data as T;
}

const STATUS_MAP: Record<string, string> = {
  RELEASING: 'Ongoing',
  FINISHED: 'Completed',
  NOT_YET_RELEASED: 'Not yet aired',
  CANCELLED: 'Cancelled',
  HIATUS: 'Hiatus',
};

const mapStatus = (s?: string | null) => (s ? (STATUS_MAP[s] ?? s) : s);

const mapTitle = (t: any) => ({
  romaji: t?.romaji ?? null,
  english: t?.english ?? null,
  native: t?.native ?? null,
  userPreferred: t?.userPreferred ?? t?.romaji ?? t?.english ?? '',
});

const stripHtml = (s?: string | null) =>
  s ? s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '';

const mapMini = (m: any, extra: Record<string, unknown> = {}) => ({
  id: String(m.id),
  malId: m.idMal != null ? String(m.idMal) : '',
  title: mapTitle(m.title),
  status: mapStatus(m.status),
  episodes: m.episodes ?? null,
  image: m.coverImage?.extraLarge ?? m.coverImage?.large ?? '',
  imageHash: '',
  cover: m.bannerImage ?? m.coverImage?.extraLarge ?? '',
  coverHash: '',
  rating: m.averageScore ?? null,
  type: m.format ?? '',
  ...extra,
});

export function mapMedia(m: any) {
  const next = m.nextAiringEpisode;
  const image = m.coverImage?.extraLarge ?? m.coverImage?.large ?? '';
  const out: any = {
    id: String(m.id),
    malId: m.idMal != null ? String(m.idMal) : '',
    title: mapTitle(m.title),
    trailer: m.trailer
      ? {
          id: m.trailer.id,
          site: m.trailer.site,
          thumbnail: m.trailer.thumbnail,
          thumbnailHash: '',
        }
      : null,
    synonyms: m.synonyms ?? [],
    isLicensed: !!m.isLicensed,
    isAdult: !!m.isAdult,
    countryOfOrigin: m.countryOfOrigin ?? '',
    image,
    imageHash: '',
    cover: m.bannerImage ?? image,
    coverHash: '',
    description: stripHtml(m.description),
    status: mapStatus(m.status),
    releaseDate: m.seasonYear ?? m.startDate?.year ?? null,
    totalEpisodes: m.episodes ?? null,
    currentEpisode: next ? next.episode - 1 : (m.episodes ?? null),
    rating: m.averageScore ?? null,
    duration: m.duration ?? null,
    genres: m.genres ?? [],
    studios: (m.studios?.nodes ?? []).map((s: any) => s.name),
    subOrDub: 'sub',
    season: m.season ?? '',
    popularity: m.popularity ?? 0,
    type: m.format ?? '',
    startDate: m.startDate ?? {},
    endDate: m.endDate ?? {},
    nextAiringEpisode: next
      ? {
          airingTime: next.airingAt,
          timeUntilAiring: next.timeUntilAiring,
          episode: next.episode,
        }
      : null,
    color: m.coverImage?.color ?? null,
    mappings: [],
    artwork: [],
    episodes: [],
    recommendations: (m.recommendations?.nodes ?? [])
      .filter((n: any) => n?.mediaRecommendation)
      .map((n: any) => mapMini(n.mediaRecommendation)),
    relations: (m.relations?.edges ?? []).map((e: any) =>
      mapMini(e.node, { relationType: e.relationType }),
    ),
    characters: (m.characters?.edges ?? []).map((e: any) => ({
      id: String(e.node.id),
      role: e.role,
      name: {
        romaji: e.node.name?.full ?? null,
        english: e.node.name?.full ?? null,
        native: e.node.name?.native ?? null,
        userPreferred: e.node.name?.full ?? '',
      },
      image: e.node.image?.large ?? '',
      imageHash: '',
      voiceActors: (e.voiceActors ?? []).map((v: any) => ({
        id: String(v.id),
        language: v.languageV2 ?? 'Japanese',
        name: {
          romaji: v.name?.full ?? null,
          english: v.name?.full ?? null,
          native: v.name?.native ?? null,
          userPreferred: v.name?.full ?? '',
        },
        image: v.image?.large ?? '',
        imageHash: '',
      })),
    })),
  };
  return out;
}

// Consumet-compatible page envelope: { currentPage, hasNextPage, results }
export function mapPage(data: any) {
  const page = data.Page;
  return {
    currentPage: page.pageInfo.currentPage,
    hasNextPage: page.pageInfo.hasNextPage,
    totalPages: page.pageInfo.lastPage,
    totalResults: page.pageInfo.total,
    results: page.media.map(mapMedia),
  };
}
