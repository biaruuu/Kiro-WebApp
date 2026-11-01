// localStorage helpers for watch history. The shapes match what the home page's
// "Continue Watching" row (EpisodeCard) already reads:
//   watched-episodes     : { [animeId]: Episode[] }   (last item = most recent)
//   last-anime-visited   : { [animeId]: { titleEnglish, titleRomaji, timestamp } }
//   all_episode_times    : { [episodeId]: { currentTime, playbackPercentage } }

const WATCHED = 'watched-episodes';
const VISITED = 'last-anime-visited';
const TIMES = 'all_episode_times';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable */
  }
}

export const episodeKey = (animeId: string, number: number) =>
  `${animeId}-ep-${number}`;

export function getWatchedNumbers(animeId: string): Set<number> {
  const all = read<Record<string, { number: number }[]>>(WATCHED, {});
  return new Set((all[animeId] ?? []).map((e) => Number(e.number)));
}

export function getLastWatchedNumber(animeId: string): number | undefined {
  const list = read<Record<string, { number: number }[]>>(WATCHED, {})[animeId];
  const last = list?.[list.length - 1];
  return last ? Number(last.number) : undefined;
}

export function markWatched(
  animeId: string,
  anime: { titleEnglish?: string | null; titleRomaji?: string | null },
  episode: {
    number: number;
    title?: string | null;
    image?: string | null;
    description?: string | null;
    airDate?: string | null;
  },
) {
  const all = read<Record<string, any[]>>(WATCHED, {});
  const list = (all[animeId] ?? []).filter(
    (e) => Number(e.number) !== episode.number,
  );
  list.push({
    id: episodeKey(animeId, episode.number),
    number: episode.number,
    title: episode.title || '',
    image: episode.image || '',
    imageHash: '',
    description: episode.description ?? null,
    airDate: episode.airDate ?? null,
  });
  all[animeId] = list;
  write(WATCHED, all);

  const visited = read<Record<string, any>>(VISITED, {});
  visited[animeId] = {
    titleEnglish: anime.titleEnglish ?? '',
    titleRomaji: anime.titleRomaji ?? '',
    timestamp: Date.now(),
  };
  write(VISITED, visited);
}

export function saveProgress(
  animeId: string,
  number: number,
  currentTime: number,
  duration: number,
) {
  if (!duration || !isFinite(duration)) return;
  const times = read<Record<string, any>>(TIMES, {});
  times[episodeKey(animeId, number)] = {
    currentTime,
    playbackPercentage: Math.min(100, (currentTime / duration) * 100),
  };
  write(TIMES, times);
}

export function getProgress(animeId: string, number: number) {
  const entry = read<Record<string, any>>(TIMES, {})[episodeKey(animeId, number)];
  if (!entry) return undefined;
  // Finished episodes restart from the beginning.
  if (entry.playbackPercentage > 95) return { currentTime: 0, playbackPercentage: 0 };
  return entry as { currentTime: number; playbackPercentage: number };
}

export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

export function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}
